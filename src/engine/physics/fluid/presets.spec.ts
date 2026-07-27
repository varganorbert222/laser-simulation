import { describe, expect, it } from 'vitest';
import { defaultFogVolume, normalizeFogVolume } from '../../ecs/components/fog';
import { defaultFluidVolume, normalizeFluidVolume } from '../../ecs/components/fluid';
import { defaultFogPreset } from '../fog/presets';
import { applyWaterPreset } from './water-presets';
import { jacobiIterationsForLadder } from './presets';
import { particleCountForFill } from './sph-sim';

describe('FogVolume normalize', () => {
  it('fills smoke defaults', () => {
    const v = normalizeFogVolume({});
    const p = defaultFogPreset();
    expect(v.buoyancy).toBeCloseTo(p.buoyancy);
    expect(v.opticalDensity).toBeCloseTo(p.opticalDensity);
    expect(v.enabled).toBe(true);
  });

  it('matches defaultFogVolume', () => {
    const d = defaultFogVolume();
    const n = normalizeFogVolume(d);
    expect(n.emissionRate).toBe(d.emissionRate);
  });
});

describe('FluidVolume SPH normalize', () => {
  it('applies aquarium water defaults', () => {
    const v = normalizeFluidVolume({});
    const d = defaultFluidVolume();
    const aq = applyWaterPreset('aquarium');
    expect(v.fillFraction).toBeCloseTo(d.fillFraction);
    expect(v.particleRadius).toBeCloseTo(d.particleRadius);
    expect(v.ior).toBeCloseTo(aq.ior);
    expect(v.presetId).toBe('aquarium');
    expect(v.waveAmplitude).toBeCloseTo(aq.waveAmplitude);
  });

  it('maps legacy fillHeight to fillFraction', () => {
    const v = normalizeFluidVolume({ fillHeight: 0.4 } as never);
    expect(v.fillFraction).toBeCloseTo(0.4);
  });

  it('migrates legacy particleCount to particleRadius', () => {
    const v = normalizeFluidVolume({
      halfExtents: [1, 1, 1],
      fillFraction: 0.5,
      particleCount: 512,
    } as never);
    expect(v.particleRadius).toBeGreaterThan(0.01);
    expect(v.particleRadius).toBeLessThan(0.4);
  });

  it('applies lake/sea named presets', () => {
    const lake = normalizeFluidVolume({ presetId: 'lake' });
    expect(lake.color[1]).toBeGreaterThan(lake.color[0]);
    expect(lake.waveAmplitude).toBeGreaterThan(applyWaterPreset('aquarium').waveAmplitude);
    const sea = normalizeFluidVolume({ presetId: 'sea' });
    expect(sea.ior).toBeCloseTo(1.34);
    expect(sea.absorption).toBeGreaterThan(lake.absorption);
  });

  it('normalizes wallMode', () => {
    expect(normalizeFluidVolume({}).wallMode).toBe('none');
    expect(normalizeFluidVolume({ wallMode: 'glass' }).wallMode).toBe('glass');
    expect(normalizeFluidVolume({ wallMode: 'solid' }).wallMode).toBe('solid');
    expect(normalizeFluidVolume({ wallMode: 'nope' as never }).wallMode).toBe('none');
  });
});

describe('particleCountForFill', () => {
  it('scales with fillFraction and particleRadius', () => {
    const half: [number, number, number] = [1, 1, 1];
    const low = particleCountForFill(half, 0.25, 0.08);
    const high = particleCountForFill(half, 0.8, 0.08);
    expect(high).toBeGreaterThan(low);
    const fine = particleCountForFill(half, 0.5, 0.04);
    const coarse = particleCountForFill(half, 0.5, 0.12);
    expect(fine).toBeGreaterThan(coarse);
  });
});

describe('jacobiIterationsForLadder', () => {
  it('scales with quality', () => {
    expect(jacobiIterationsForLadder('low')).toBe(12);
    expect(jacobiIterationsForLadder('ultra')).toBe(32);
  });
});
