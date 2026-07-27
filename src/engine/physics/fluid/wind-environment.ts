/**
 * Global wind for GPU fluid force pass.
 * gustAmount === 0 → static direction×strength; >0 → host-side noise modulation.
 */
import { clampRange, clampUnit } from '../../math/clamp';
import { length, normalize, type Vec3, vec3 } from '../../math/vec3';

export interface WindEnvironment {
  /** Unit direction in world space. */
  direction: Vec3;
  /** Base wind speed (fluid grid cell/s scale). */
  strength: number;
  /** 0 = static; >0 modulates strength with procedural noise. */
  gustAmount: number;
  noiseScale: number;
  noiseTimeScale: number;
  /** Reserved for noise library asset; null = procedural hash on host. */
  noiseAssetId: string | null;
  enabled: boolean;
}

export const WIND_STRENGTH_DEFAULT = 3.5;

export function createDefaultWindEnvironment(): WindEnvironment {
  return {
    direction: vec3(1, 0, 0.25),
    strength: WIND_STRENGTH_DEFAULT,
    gustAmount: 0.25,
    noiseScale: 0.35,
    noiseTimeScale: 0.4,
    noiseAssetId: null,
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

export function normalizeWindEnvironment(
  raw: Partial<WindEnvironment> | null | undefined,
): WindEnvironment {
  const base = createDefaultWindEnvironment();
  if (!raw || typeof raw !== 'object') return base;
  const asset =
    raw.noiseAssetId === null
      ? null
      : typeof raw.noiseAssetId === 'string' && raw.noiseAssetId.length > 0
        ? raw.noiseAssetId
        : base.noiseAssetId;
  return {
    direction: normalizeDir(raw.direction, base.direction),
    strength:
      typeof raw.strength === 'number'
        ? clampRange(raw.strength, 0, 40, base.strength)
        : base.strength,
    gustAmount:
      typeof raw.gustAmount === 'number'
        ? clampRange(raw.gustAmount, 0, 2, base.gustAmount)
        : base.gustAmount,
    noiseScale:
      typeof raw.noiseScale === 'number'
        ? clampRange(raw.noiseScale, 0.01, 8, base.noiseScale)
        : base.noiseScale,
    noiseTimeScale:
      typeof raw.noiseTimeScale === 'number'
        ? clampRange(raw.noiseTimeScale, 0, 8, base.noiseTimeScale)
        : base.noiseTimeScale,
    noiseAssetId: asset,
    enabled: typeof raw.enabled === 'boolean' ? raw.enabled : base.enabled,
  };
}

/** Cheap hash for gust modulation (host-side; no asset required). */
function hash3(x: number, y: number, z: number): number {
  const n = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
  return n - Math.floor(n);
}

/**
 * Resolve world-space wind velocity for the force pass.
 * v1: one global vector per frame (optional position for spatial gust phase).
 */
export function resolveWindForce(
  env: WindEnvironment,
  timeS: number,
  position?: Vec3,
): Vec3 {
  if (!env.enabled || env.strength <= 1e-8) return vec3(0, 0, 0);
  const d = length(env.direction) < 1e-8 ? vec3(1, 0, 0) : normalize(env.direction);
  let mag = env.strength;
  if (env.gustAmount > 1e-6) {
    const p = position ?? vec3(0, 0, 0);
    const s = env.noiseScale;
    const t = timeS * env.noiseTimeScale;
    const n =
      hash3(p[0] * s + t, p[1] * s, p[2] * s + t * 0.7) * 2 -
      1 +
      (hash3(p[2] * s - t, p[0] * s * 1.3, t) * 2 - 1) * 0.5;
    mag *= 1 + env.gustAmount * n;
    mag = Math.max(0, mag);
  }
  return [d[0] * mag, d[1] * mag, d[2] * mag];
}

export function clampWindCoupling(v: number, fallback = 1): number {
  return clampUnit(v, fallback);
}
