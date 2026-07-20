import { describe, expect, it } from 'vitest';

import type { LightEmitter } from '../ecs/components';
import { defaultOpticsSpill } from './optics-spill';
import { defaultLaserParams } from './modes';
import {
  beamModelFromEmitter,
  beamModelToGpuParams,
  beamModeCode,
  evalRadianceField,
  surfaceBrdfWeights,
  zeroSpill,
  type BeamModel,
} from './beam-model';
import { defaultSurfaceMaterial } from './surface-material';

function emitter(partial: Partial<LightEmitter> & Pick<LightEmitter, 'params'>): LightEmitter {
  return {
    wavelengthNm: 532,
    powerW: 1,
    enabled: true,
    surfaceGain: 1,
    glowGain: 1,
    bloomGain: 1,
    apertureCoupling: 0.5,
    spill: defaultOpticsSpill(),
    ...partial,
  };
}

describe('beamModelFromEmitter', () => {
  it('maps omni_lamp → omni', () => {
    const m = beamModelFromEmitter(
      emitter({
        params: { mode: 'omni_lamp', omni: { softRadiusM: 1.5, falloff: 2 } },
      }),
    );
    expect(m.kind).toBe('omni');
    if (m.kind === 'omni') {
      expect(m.softRadiusM).toBe(1.5);
      expect(m.falloff).toBe(2);
    }
    expect(beamModeCode(m.kind)).toBe(0);
  });

  it('maps spotlight → cone (radians)', () => {
    const m = beamModelFromEmitter(
      emitter({
        params: {
          mode: 'spotlight',
          spot: { innerConeDeg: 20, outerConeDeg: 40, apertureSharpness: 4 },
        },
      }),
    );
    expect(m.kind).toBe('cone');
    if (m.kind === 'cone') {
      expect(m.innerRad).toBeCloseTo((20 * Math.PI) / 180, 5);
      expect(m.outerRad).toBeCloseTo((40 * Math.PI) / 180, 5);
      expect(m.sharpness).toBe(4);
    }
    expect(beamModeCode(m.kind)).toBe(1);
  });

  it('maps parallel → tube', () => {
    const m = beamModelFromEmitter(
      emitter({
        params: { mode: 'parallel', parallel: { beamRadiusM: 0.05, residualMrad: 2 } },
      }),
    );
    expect(m.kind).toBe('tube');
    if (m.kind === 'tube') {
      expect(m.radiusM).toBe(0.05);
      expect(m.residualRad).toBeCloseTo(0.002, 6);
    }
    expect(beamModeCode(m.kind)).toBe(2);
  });

  it('maps laser → gaussian with M²', () => {
    const m = beamModelFromEmitter(
      emitter({
        wavelengthNm: 650,
        params: {
          mode: 'laser',
          laser: { ...defaultLaserParams(), w0M: 0.001, m2: 1.2, probeDistanceM: 1 },
        },
      }),
    );
    expect(m.kind).toBe('gaussian');
    if (m.kind === 'gaussian') {
      expect(m.laser.w0M).toBe(0.001);
      expect(m.laser.m2).toBe(1.2);
      expect(m.lambdaM).toBeCloseTo(650e-9, 12);
    }
    expect(beamModeCode(m.kind)).toBe(3);
  });

  it('migrates legacy parallelness → m2', () => {
    const m = beamModelFromEmitter(
      emitter({
        params: {
          mode: 'laser',
          laser: {
            w0M: 0.01,
            parallelness: 1,
            probeDistanceM: 5,
          } as never,
        },
      }),
    );
    expect(m.kind).toBe('gaussian');
    if (m.kind === 'gaussian') {
      expect(m.laser.m2).toBe(1);
    }
  });
});

describe('beamModelToGpuParams', () => {
  it('packs parallel as tube (mode 2), not gaussian', () => {
    const model = beamModelFromEmitter(
      emitter({
        params: { mode: 'parallel', parallel: { beamRadiusM: 0.04, residualMrad: 1 } },
      }),
    );
    const g = beamModelToGpuParams(model);
    expect(g.mode).toBe(2);
    expect(g.p0).toBe(0.04);
    expect(g.p1).toBeCloseTo(0.001, 6);
  });

  it('packs gaussian m2 into p1', () => {
    const model = beamModelFromEmitter(
      emitter({
        params: {
          mode: 'laser',
          laser: { ...defaultLaserParams(), w0M: 0.005, m2: 2.5 },
        },
      }),
    );
    const g = beamModelToGpuParams(model);
    expect(g.mode).toBe(3);
    expect(g.p1).toBe(2.5);
  });
});

describe('evalRadianceField', () => {
  const origin: [number, number, number] = [0, 0, 0];
  const dir: [number, number, number] = [0, 0, 1];

  it('omni is isotropic at equal distance', () => {
    const model: BeamModel = {
      kind: 'omni',
      softRadiusM: 1,
      falloff: 2,
      spill: zeroSpill(),
    };
    const a = evalRadianceField(model, {
      origin,
      direction: dir,
      point: [1, 0, 0],
    });
    const b = evalRadianceField(model, {
      origin,
      direction: dir,
      point: [0, 1, 0],
    });
    expect(a.core).toBeCloseTo(b.core, 6);
    expect(a.core).toBeGreaterThan(0);
  });

  it('cone hotspot > spill at outer rim', () => {
    const model: BeamModel = {
      kind: 'cone',
      innerRad: 0.15,
      outerRad: 0.4,
      sharpness: 4,
      spill: zeroSpill(),
    };
    const onAxis = evalRadianceField(model, {
      origin,
      direction: dir,
      point: [0, 0, 2],
    });
    const rim = evalRadianceField(model, {
      origin,
      direction: dir,
      point: [0.75, 0, 2],
    });
    expect(onAxis.core).toBeGreaterThan(rim.core);
    expect(onAxis.core).toBeGreaterThan(0);
  });

  it('gaussian peaks on axis (TEM00)', () => {
    const model: BeamModel = {
      kind: 'gaussian',
      laser: { ...defaultLaserParams(), w0M: 0.002, m2: 1 },
      lambdaM: 532e-9,
      spill: zeroSpill(),
    };
    const axis = evalRadianceField(model, {
      origin,
      direction: dir,
      point: [0, 0, 1],
    });
    const off = evalRadianceField(model, {
      origin,
      direction: dir,
      point: [0.05, 0, 1],
    });
    expect(axis.core).toBeGreaterThan(off.core);
    expect(axis.core).toBeGreaterThan(0);
  });

  it('tube residual widens with distance', () => {
    const model: BeamModel = {
      kind: 'tube',
      radiusM: 0.02,
      residualRad: 0.01,
      spill: zeroSpill(),
    };
    const near = evalRadianceField(model, {
      origin,
      direction: dir,
      point: [0.03, 0, 0.5],
    });
    const far = evalRadianceField(model, {
      origin,
      direction: dir,
      point: [0.03, 0, 5],
    });
    expect(far.core).toBeGreaterThan(near.core);
  });

  it('étendue: on-axis Li falls as beam widens', () => {
    const model: BeamModel = {
      kind: 'gaussian',
      laser: { ...defaultLaserParams(), w0M: 0.001, m2: 1 },
      lambdaM: 532e-9,
      spill: zeroSpill(),
    };
    const near = evalRadianceField(model, {
      origin,
      direction: dir,
      point: [0, 0, 0.01],
    });
    const far = evalRadianceField(model, {
      origin,
      direction: dir,
      point: [0, 0, 5],
    });
    expect(near.core).toBeGreaterThan(far.core);
  });

  it('strayPowerFraction conserves core share and adds residual', () => {
    const base: BeamModel = {
      kind: 'gaussian',
      laser: { ...defaultLaserParams(), w0M: 0.002, m2: 1 },
      lambdaM: 532e-9,
      spill: zeroSpill(),
    };
    const withSpill: BeamModel = {
      ...base,
      spill: { strayPowerFraction: 0.4 },
    };
    const sample = { origin, direction: dir, point: [0, 0, 1] as [number, number, number] };
    const clean = evalRadianceField(base, sample);
    const dirty = evalRadianceField(withSpill, sample);
    expect(dirty.core).toBeCloseTo(clean.core * 0.6, 6);
    expect(dirty.spill).toBeGreaterThan(0);
    // Off-axis residual should be stronger relative to a pure TEM00 core.
    const off = { origin, direction: dir, point: [0.08, 0, 1] as [number, number, number] };
    expect(evalRadianceField(withSpill, off).total).toBeGreaterThan(
      evalRadianceField(base, off).total,
    );
  });
});

describe('surfaceBrdfWeights', () => {
  it('maps albedo/metal/rough consistently', () => {
    const w = surfaceBrdfWeights({
      ...defaultSurfaceMaterial(),
      albedo: 0.8,
      metalness: 0,
      roughness: 0.5,
    });
    expect(w.reflectivity).toBeGreaterThan(0.5);
    expect(w.absorption).toBeLessThan(0.6);
    expect(w.diffuseWeight).toBeGreaterThan(w.specularWeight);
    expect(w.roughness).toBe(0.5);
    expect(w.albedo).toBe(0.8);
  });
});
