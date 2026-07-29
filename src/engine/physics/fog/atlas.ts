/**
 * 3D grid ↔ 2D slice-atlas layout (WebGL2 has no 3D render targets).
 * CPU twin of shaders/src/fog/atlas.glsl
 */

export interface FogAtlasLayout {
  gridRes: number;
  tilesX: number;
  tilesY: number;
  atlasWidth: number;
  atlasHeight: number;
  sliceCount: number;
}

/** Square-ish tile grid covering `gridRes` Z-slices. */
export function fogAtlasLayout(gridRes: number): FogAtlasLayout {
  const n = Math.max(1, Math.floor(gridRes));
  const tilesX = Math.max(1, Math.ceil(Math.sqrt(n)));
  const tilesY = Math.max(1, Math.ceil(n / tilesX));
  return {
    gridRes: n,
    tilesX,
    tilesY,
    atlasWidth: n * tilesX,
    atlasHeight: n * tilesY,
    sliceCount: n,
  };
}

/** Voxel index → atlas UV in [0,1] (texel centers). */
export function voxelToAtlasUv(
  ix: number,
  iy: number,
  iz: number,
  layout: FogAtlasLayout,
): [number, number] {
  const { gridRes: n, tilesX, atlasWidth, atlasHeight } = layout;
  const clampedZ = Math.max(0, Math.min(n - 1, Math.floor(iz)));
  const tileX = clampedZ % tilesX;
  const tileY = Math.floor(clampedZ / tilesX);
  const px = tileX * n + ix + 0.5;
  const py = tileY * n + iy + 0.5;
  return [px / atlasWidth, py / atlasHeight];
}

/** Atlas UV → voxel indices (floored). Returns null if outside valid Z range. */
export function atlasUvToVoxel(
  u: number,
  v: number,
  layout: FogAtlasLayout,
): { ix: number; iy: number; iz: number } | null {
  const { gridRes: n, tilesX, atlasWidth, atlasHeight, sliceCount } = layout;
  const px = u * atlasWidth;
  const py = v * atlasHeight;
  const ix = Math.floor(px % n);
  const iy = Math.floor(py % n);
  const tileX = Math.floor(px / n);
  const tileY = Math.floor(py / n);
  const iz = tileY * tilesX + tileX;
  if (iz < 0 || iz >= sliceCount) return null;
  return { ix, iy, iz };
}

/**
 * CFL-limited simulation dt so |u|·dt/dx ≤ cflMax.
 * velocityMax is in grid cells / second; dx = 1 cell.
 */
export function clampSimDt(dt: number, velocityMax: number, cflMax = 0.9): number {
  if (!Number.isFinite(dt) || dt <= 0) return 1 / 60;
  const vmax = Math.max(1e-6, velocityMax);
  const maxDt = cflMax / vmax;
  return Math.min(dt, maxDt);
}

/** Buoyancy force magnitude: k · (T − T_ambient). */
export function buoyancyForce(temperature: number, ambient: number, strength: number): number {
  return strength * (temperature - ambient);
}
