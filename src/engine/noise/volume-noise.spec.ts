import { describe, expect, it } from 'vitest';
import {
  bakeNoiseVolume,
  createDefaultNoiseRecipe,
  createDefaultNoiseLayer,
  noiseSliceToRgba,
  sampleNoiseRecipe,
  seamlessError,
} from './volume-noise';
import { bakedToNoiseVolumeFile, parseNoiseVolumeFile } from './volume-noise-io';

describe('volume-noise', () => {
  it('bakes a tileable R8 3D volume', () => {
    const recipe = createDefaultNoiseRecipe(32, '3d');
    const baked = bakeNoiseVolume(recipe);
    expect(baked.dimension).toBe('3d');
    expect(baked.depth).toBe(32);
    expect(baked.data.length).toBe(32 ** 3);
    expect(baked.data.some((v) => v > 0)).toBe(true);
  });

  it('bakes a tileable R8 2D texture', () => {
    const recipe = createDefaultNoiseRecipe(32, '2d');
    const baked = bakeNoiseVolume(recipe);
    expect(baked.dimension).toBe('2d');
    expect(baked.depth).toBe(1);
    expect(baked.data.length).toBe(32 * 32);
  });

  it('is seamless on domain boundaries (low edge error)', () => {
    const recipe = {
      ...createDefaultNoiseRecipe(32, '3d'),
      layers: [
        createDefaultNoiseLayer({
          name: 'Only',
          seed: 3,
          frequency: 4,
          octaves: 2,
          amplitude: 1,
          blend: 'add' as const,
        }),
      ],
    };
    const baked = bakeNoiseVolume(recipe);
    // Trilinear at last texel ≠ first due to half-texel; average error stays modest.
    expect(seamlessError(baked)).toBeLessThan(40);
    const a = sampleNoiseRecipe(recipe, 0, 0.31, 0.47);
    const b = sampleNoiseRecipe(recipe, 1, 0.31, 0.47);
    expect(Math.abs(a - b)).toBeLessThan(1e-6);
  });

  it('additive vs subtractive layers change the field', () => {
    const base = createDefaultNoiseRecipe(32);
    const addOnly = bakeNoiseVolume({
      ...base,
      layers: [createDefaultNoiseLayer({ name: 'A', blend: 'add', amplitude: 1, seed: 1 })],
    });
    const withSub = bakeNoiseVolume({
      ...base,
      layers: [
        createDefaultNoiseLayer({ name: 'A', blend: 'add', amplitude: 1, seed: 1 }),
        createDefaultNoiseLayer({ name: 'B', blend: 'sub', amplitude: 0.8, seed: 2, frequency: 5 }),
      ],
    });
    let diff = 0;
    for (let i = 0; i < addOnly.data.length; i++) {
      diff += Math.abs(addOnly.data[i]! - withSub.data[i]!);
    }
    expect(diff).toBeGreaterThan(100);
  });

  it('round-trips through JSON file format', () => {
    const baked = bakeNoiseVolume(createDefaultNoiseRecipe(32, '2d'));
    const file = bakedToNoiseVolumeFile(baked);
    const again = parseNoiseVolumeFile(file);
    expect(again.dimension).toBe('2d');
    expect(again.data.length).toBe(baked.data.length);
    expect(Array.from(again.data.slice(0, 64))).toEqual(Array.from(baked.data.slice(0, 64)));
  });

  it('writes an RGBA slice for preview', () => {
    const baked = bakeNoiseVolume(createDefaultNoiseRecipe(32));
    const rgba = noiseSliceToRgba(baked, 8);
    expect(rgba.length).toBe(32 * 32 * 4);
    expect(rgba[3]).toBe(255);
  });
});
