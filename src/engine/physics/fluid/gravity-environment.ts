/**
 * Global gravity for GPU fluid force pass (world-space unit direction × strength).
 * Smoke buoyancy remains a separate temperature-driven force along “up”.
 */
import { clampRange } from '../../math/clamp';
import { length, normalize, type Vec3, vec3 } from '../../math/vec3';

export interface GravityEnvironment {
  /** Unit direction in world space (default down). */
  direction: Vec3;
  /** Magnitude scaled for fluid grid cell/s² (not literal 9.81). */
  strength: number;
  enabled: boolean;
}

export const GRAVITY_STRENGTH_DEFAULT = 9.5;

export function createDefaultGravityEnvironment(): GravityEnvironment {
  return {
    direction: vec3(0, -1, 0),
    strength: GRAVITY_STRENGTH_DEFAULT,
    enabled: true,
  };
}

function normalizeDir(raw: unknown, fallback: Vec3): Vec3 {
  if (!Array.isArray(raw) || raw.length < 3) return fallback;
  const v: Vec3 = [
    typeof raw[0] === 'number' ? raw[0] : fallback[0],
    typeof raw[1] === 'number' ? raw[1] : fallback[1],
    typeof raw[2] === 'number' ? raw[2] : fallback[2],
  ];
  return length(v) < 1e-8 ? fallback : normalize(v);
}

export function normalizeGravityEnvironment(
  raw: Partial<GravityEnvironment> | null | undefined,
): GravityEnvironment {
  const base = createDefaultGravityEnvironment();
  if (!raw || typeof raw !== 'object') return base;
  return {
    direction: normalizeDir(raw.direction, base.direction),
    strength:
      typeof raw.strength === 'number'
        ? clampRange(raw.strength, 0, 40, base.strength)
        : base.strength,
    enabled: typeof raw.enabled === 'boolean' ? raw.enabled : base.enabled,
  };
}

/** World-space acceleration vector (direction × strength), or zero if disabled. */
export function resolveGravityAccel(env: GravityEnvironment): Vec3 {
  if (!env.enabled || env.strength <= 1e-8) return vec3(0, 0, 0);
  const d = length(env.direction) < 1e-8 ? vec3(0, -1, 0) : normalize(env.direction);
  return [d[0] * env.strength, d[1] * env.strength, d[2] * env.strength];
}
