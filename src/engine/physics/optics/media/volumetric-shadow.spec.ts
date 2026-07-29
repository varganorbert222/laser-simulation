import { describe, expect, it } from 'vitest';
import {
  lightMediaTransmittance,
  lightMediaTransmittanceLocal,
  type ShadowMediaVolume,
} from './volumetric-shadow';
import { createQuality, shadowStepsForQuality } from '../../../render/quality';

function box(partial: Partial<ShadowMediaVolume> = {}): ShadowMediaVolume {
  return {
    center: [0, 0, 0],
    halfExtents: [5, 5, 5],
    density: 1,
    scatter: 0.4,
    scatterMie: 0,
    absorption: 0,
    layerKind: 2,
    insulating: false,
    emissionRate: 1,
    plumeDir: [0, 0, 1],
    coneCos: -1,
    plumeLengthM: 4,
    ...partial,
  };
}

describe('volumetric-shadow (Light→Medium tiers)', () => {
  it('off → transmittance 1', () => {
    expect(lightMediaTransmittance([0, 0, 0], [3, 0, 0], 0.5, 'off')).toBe(1);
  });

  it('low matches local σ·d', () => {
    const T = lightMediaTransmittance([0, 0, 0], [3, 0, 0], 0.25, 'low');
    expect(T).toBeCloseTo(lightMediaTransmittanceLocal([0, 0, 0], [3, 0, 0], 0.25), 10);
  });

  it('medium/high attenuate through dense volume', () => {
    const vol = box();
    const Tmed = lightMediaTransmittance([0, 0, 0], [4, 0, 0], 0, 'medium', [vol]);
    const Thigh = lightMediaTransmittance([0, 0, 0], [4, 0, 0], 0, 'high', [vol]);
    expect(Tmed).toBeGreaterThan(0);
    expect(Tmed).toBeLessThan(1);
    expect(Thigh).toBeGreaterThan(0);
    expect(Thigh).toBeLessThan(1);
  });

  it('quality presets map shadow steps', () => {
    expect(shadowStepsForQuality('off')).toBe(0);
    expect(shadowStepsForQuality('low')).toBe(1);
    expect(shadowStepsForQuality('medium')).toBe(4);
    expect(shadowStepsForQuality('high')).toBe(8);
    expect(createQuality('low').shadowQuality).toBe('off');
    expect(createQuality('ultra').shadowQuality).toBe('high');
  });
});
