/**
 * Soft nozzle plume envelope for smoke machines.
 * When coneCos < 0 the envelope is disabled (uniform AABB fill).
 */

import { clampRange } from '../../math/clamp';
import { smoothstep } from '../../math/smoothstep';
import type { Vec3 } from '../../math/vec3';
import { dot, length } from '../../math/vec3';

export const SMOKE_EMISSION_RATE_MIN = 0;
export const SMOKE_EMISSION_RATE_MAX = 3;
export const SMOKE_CONE_ANGLE_DEG_MIN = 5;
export const SMOKE_CONE_ANGLE_DEG_MAX = 80;
export const SMOKE_PLUME_LENGTH_M_MIN = 0.25;
export const SMOKE_PLUME_LENGTH_M_MAX = 20;

/** Sentinel: plume disabled → fill uses full AABB FBM. */
export const PLUME_DISABLED_CONE_COS = -1;

export function coneCosFromHalfAngleDeg(coneAngleDeg: number): number {
  const rad =
    (clampRange(coneAngleDeg, SMOKE_CONE_ANGLE_DEG_MIN, SMOKE_CONE_ANGLE_DEG_MAX) * Math.PI) / 180;
  return Math.cos(rad);
}

/**
 * Density multiplier in [0, 1+] from a soft spray cone along `plumeDir`.
 * `localPos` is relative to the nozzle (media center); `plumeDir` unit.
 * `coneCos < 0` → return 1 (legacy uniform volumes).
 */
export function plumeEnvelope(
  localPos: Vec3,
  plumeDir: Vec3,
  coneCos: number,
  lengthM: number,
  emissionRate: number,
): number {
  if (!(coneCos >= 0)) return 1;
  if (!(emissionRate > 0)) return 0;

  const along = dot(localPos, plumeDir);
  if (along <= 1e-5) return 0;

  const dist = Math.max(1e-6, length(localPos));
  const cosTheta = along / dist;
  // Soft cone: inside when cosTheta >= coneCos (narrower = larger cos).
  const coneMask = smoothstep(coneCos - 0.08, Math.min(1, coneCos + 0.04), cosTheta);

  const len = Math.max(SMOKE_PLUME_LENGTH_M_MIN, lengthM);
  const axial = 1 - smoothstep(len * 0.55, len, along);

  return Math.max(0, emissionRate) * coneMask * axial;
}
