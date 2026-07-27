import { describe, expect, it } from 'vitest';
import {
  atlasUvToVoxel,
  buoyancyForce,
  clampSimDt,
  fluidAtlasLayout,
  voxelToAtlasUv,
} from './atlas';

describe('fluidAtlasLayout', () => {
  it('packs 32³ into a square-ish atlas', () => {
    const L = fluidAtlasLayout(32);
    expect(L.gridRes).toBe(32);
    expect(L.tilesX * L.tilesY).toBeGreaterThanOrEqual(32);
    expect(L.atlasWidth).toBe(32 * L.tilesX);
    expect(L.atlasHeight).toBe(32 * L.tilesY);
  });

  it('round-trips voxel centers through UV', () => {
    const L = fluidAtlasLayout(32);
    for (const iz of [0, 1, 15, 31]) {
      const [u, v] = voxelToAtlasUv(4, 7, iz, L);
      const back = atlasUvToVoxel(u, v, L);
      expect(back).toEqual({ ix: 4, iy: 7, iz });
    }
  });

  it('rejects UV past last valid slice padding', () => {
    const L = fluidAtlasLayout(32);
    // Far past last tile row.
    expect(atlasUvToVoxel(0.99, 0.99, L)).toBeNull();
  });
});

describe('clampSimDt / buoyancyForce', () => {
  it('caps dt by CFL', () => {
    expect(clampSimDt(1 / 30, 100, 0.9)).toBeCloseTo(0.009, 5);
    expect(clampSimDt(1 / 60, 1, 0.9)).toBeCloseTo(1 / 60, 5);
  });

  it('scales buoyancy by ΔT', () => {
    expect(buoyancyForce(2, 0, 1.5)).toBeCloseTo(3);
    expect(buoyancyForce(0, 0, 1.5)).toBe(0);
  });
});
