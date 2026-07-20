import { describe, expect, it } from 'vitest';
import {
  intersectBox,
  lightMediaTransmittance,
  mediaOpticalDepthAlongSegment,
  sunMediaTransmittance,
  type ShadowMediaVolume,
} from './volumetric-shadow';

function box(partial: Partial<ShadowMediaVolume> = {}): ShadowMediaVolume {
  return {
    center: [0, 0, 0],
    halfExtents: [2, 2, 2],
    density: 1,
    scatter: 0.1,
    scatterMie: 0,
    absorption: 0,
    noiseThresholdLow: 0,
    noiseThresholdHigh: 1,
    layerKind: 2,
    insulating: false,
    emissionRate: 1,
    plumeDir: [0, 0, 1],
    coneCos: -1,
    plumeLengthM: 4,
    ...partial,
  };
}

describe('volumetric-shadow (chord Beer–Lambert)', () => {
  it('intersectBox hits a centered cube along +Z', () => {
    const hit = intersectBox([0, 0, -5], [0, 0, 1], [0, 0, 0], [1, 1, 1]);
    expect(hit).not.toBeNull();
    expect(hit![0]).toBeCloseTo(4, 5);
    expect(hit![1]).toBeCloseTo(6, 5);
  });

  it('empty media → transmittance 1', () => {
    expect(lightMediaTransmittance([0, 0, 0], [1, 0, 0], [])).toBe(1);
  });

  it('dense particulate along the path attenuates light', () => {
    const vol = box({ scatter: 0.5, density: 1, halfExtents: [5, 5, 5] });
    const T = lightMediaTransmittance([0, 0, 0], [4, 0, 0], [vol]);
    expect(T).toBeGreaterThan(0);
    expect(T).toBeLessThan(0.5);
  });

  it('optical depth scales with path length inside the AABB', () => {
    const vol = box({ scatter: 0.2, halfExtents: [10, 10, 10] });
    const short = mediaOpticalDepthAlongSegment([0, 0, 0], [1, 0, 0], 1, [vol]);
    const long = mediaOpticalDepthAlongSegment([0, 0, 0], [1, 0, 0], 4, [vol]);
    expect(long).toBeGreaterThan(short * 3.5);
  });

  it('sun transmittance soft-attenuates through a thick volume', () => {
    const vol = box({ scatter: 0.3, halfExtents: [20, 20, 20] });
    const T = sunMediaTransmittance([0, 0, 0], [0, 1, 0], [vol], 12);
    expect(T).toBeLessThan(0.25);
    expect(T).toBeGreaterThan(0);
  });

  it('insulating interior replaces outdoor climate contribution', () => {
    const outdoor = box({
      layerKind: 0,
      insulating: false,
      scatter: 1,
      halfExtents: [10, 10, 10],
    });
    const room = box({
      layerKind: 1,
      insulating: true,
      scatter: 0.01,
      halfExtents: [1, 1, 1],
    });
    const withRoom = mediaOpticalDepthAlongSegment([0, 0, 0], [1, 0, 0], 8, [outdoor, room]);
    const outdoorOnly = mediaOpticalDepthAlongSegment([0, 0, 0], [1, 0, 0], 8, [outdoor]);
    expect(withRoom).toBeLessThan(outdoorOnly * 0.2);
  });
});
