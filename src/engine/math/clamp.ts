/** Inclusive clamp to [0, 1]; non-finite → 0. */
export function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.min(1, Math.max(0, v));
}

/**
 * Inclusive clamp to [0, 1]; non-finite → fallback.
 * Prefer this when deserializing / normalizing with a default.
 */
export function clampUnit(v: number, fallback = 0): number {
  if (!Number.isFinite(v)) return fallback;
  return Math.min(1, Math.max(0, v));
}

/** Inclusive clamp to [min, max]; non-finite → fallback (defaults to min). */
export function clampRange(v: number, min: number, max: number, fallback = min): number {
  if (!Number.isFinite(v)) return fallback;
  return Math.min(max, Math.max(min, v));
}
