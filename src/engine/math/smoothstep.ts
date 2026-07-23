import { clamp01 } from './clamp';

/** Cubic Hermite fade on an already unit-interval `t` (Perlin / smoothstep core). */
export function hermite01(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Hermite smoothstep between edge0 and edge1 (GLSL-compatible). */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / Math.max(1e-8, edge1 - edge0));
  return hermite01(t);
}
