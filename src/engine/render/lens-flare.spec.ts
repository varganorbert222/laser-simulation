import { describe, expect, it } from 'vitest';
import {
  createLensFlareElement,
  defaultLensFlareLightsTune,
  defaultLensFlareOptics,
  defaultLensFlareSunTune,
  lensFlareElementKindCode,
  lensFlareFacingWeight,
  MAX_FLARE_ELEMENTS,
  normalizeLensFlareElement,
  normalizeLensFlareGroupTune,
  normalizeLensFlareOptics,
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
  it('keeps only intensity + volBloom (+ enabled)', () => {
    const n = normalizeLensFlareGroupTune(
      { intensity: 99, volBloom: -1, ghosts: 2 } as never,
      defaultLensFlareLightsTune(),
    );
    expect(n.intensity).toBe(4);
    expect(n.volBloom).toBe(0);
    expect(n.enabled).toBe(true);
    expect(defaultLensFlareSunTune().intensity).toBeGreaterThan(
      defaultLensFlareLightsTune().volBloom,
    );
  });
});

describe('normalizeLensFlareOptics', () => {
  it('defaults recreate baked ghost stack + streak + halo', () => {
    const d = defaultLensFlareOptics();
    expect(d.elements.length).toBe(8);
    expect(d.elements.filter((e) => e.kind === 'ghost')).toHaveLength(6);
    expect(d.elements.some((e) => e.kind === 'streak')).toBe(true);
    expect(d.elements.some((e) => e.kind === 'halo')).toBe(true);
    expect(d.chromatic).toBe(1);
    expect(d.dirt).toBe(0.85);
  });

  it('caps element list and clamps fields', () => {
    const many = Array.from({ length: MAX_FLARE_ELEMENTS + 5 }, (_, i) =>
      createLensFlareElement(i % 2 === 0 ? 'ghost' : 'streak'),
    );
    const n = normalizeLensFlareOptics(
      {
        chromatic: 9,
        dirt: -1,
        elements: [
          {
            kind: 'ghost',
            color: [2, -1, 0.5],
            size: 99,
            axis: -3,
            weight: 5,
          },
          ...many,
        ],
      },
      defaultLensFlareOptics(),
    );
    expect(n.elements.length).toBe(MAX_FLARE_ELEMENTS);
    expect(n.chromatic).toBe(2);
    expect(n.dirt).toBe(0);
    expect(n.elements[0]!.color).toEqual([1, 0, 0.5]);
    expect(n.elements[0]!.size).toBe(4);
    expect(n.elements[0]!.axis).toBe(0);
    expect(n.elements[0]!.weight).toBe(2);
  });

  it('falls back when elements missing', () => {
    const fb = defaultLensFlareOptics();
    const n = normalizeLensFlareOptics({ chromatic: 0.5 }, fb);
    expect(n.chromatic).toBe(0.5);
    expect(n.elements.length).toBe(fb.elements.length);
  });
});

describe('normalizeLensFlareElement', () => {
  it('normalizes kind and defaults', () => {
    const e = normalizeLensFlareElement({ kind: 'halo', size: 0.01 });
    expect(e.kind).toBe('halo');
    expect(e.size).toBe(0.05);
    expect(lensFlareElementKindCode('ghost')).toBe(0);
    expect(lensFlareElementKindCode('streak')).toBe(1);
    expect(lensFlareElementKindCode('halo')).toBe(2);
  });
});
