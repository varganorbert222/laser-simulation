import { describe, expect, it } from 'vitest';
import {
  defaultLensFlareLightsTune,
  defaultLensFlareSunTune,
  lensFlareFacingWeight,
  normalizeLensFlareGroupTune,
} from './lens-flare';

describe('lensFlareFacingWeight', () => {
  it('omni is visible from every side', () => {
    const light: [number, number, number] = [0, 1, 0];
    const dir: [number, number, number] = [0, 0, 1];
    expect(lensFlareFacingWeight(dir, light, [0, 1, 5], true)).toBe(1);
    expect(lensFlareFacingWeight(dir, light, [0, 1, -5], true)).toBe(1);
  });

  it('directional only when beam faces the camera', () => {
    const light: [number, number, number] = [0, 1, 0];
    const dir: [number, number, number] = [0, 0, 1];
    expect(lensFlareFacingWeight(dir, light, [0, 1, 5], false)).toBeGreaterThan(0.5);
    expect(lensFlareFacingWeight(dir, light, [0, 1, -5], false)).toBe(0);
  });
});

describe('normalizeLensFlareGroupTune', () => {
  it('fills defaults and clamps', () => {
    const n = normalizeLensFlareGroupTune(
      { intensity: 99, ghosts: -1 },
      defaultLensFlareLightsTune(),
    );
    expect(n.intensity).toBe(4);
    expect(n.ghosts).toBe(0);
    expect(n.enabled).toBe(true);
    expect(defaultLensFlareSunTune().halo).toBeGreaterThan(
      defaultLensFlareLightsTune().halo,
    );
  });
});
