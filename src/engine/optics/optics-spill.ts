/**
 * Residual optical power outside the ideal TEM00 / designed beam.
 * Models imperfect baffling, scatter in the optics train, and aperture leakage
 * as a single energy fraction (physically plausible, not three theatrical knobs).
 */

export interface OpticsSpillParams {
  /**
   * Fraction of optical power in residual / stray field (0–1).
   * Core beam is scaled by (1 − strayPowerFraction) so total power is conserved.
   */
  strayPowerFraction: number;
}

/** @deprecated Legacy three-channel spill — migrated into strayPowerFraction. */
export type LegacyOpticsSpillParams = Partial<OpticsSpillParams> & {
  strayLight?: number;
  internalReflection?: number;
  apertureSpill?: number;
};

export const OPTICS_SPILL_MIN = 0;
export const OPTICS_SPILL_MAX = 0.85;

export function clampSpill01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.min(OPTICS_SPILL_MAX, Math.max(OPTICS_SPILL_MIN, v));
}

export function defaultOpticsSpill(): OpticsSpillParams {
  return { strayPowerFraction: 0.08 };
}

/**
 * Migrate legacy {strayLight, internalReflection, apertureSpill} → single fraction.
 * Uses a weighted mean of the three educational channels.
 */
export function normalizeOpticsSpill(
  raw: LegacyOpticsSpillParams | null | undefined,
): OpticsSpillParams {
  const d = defaultOpticsSpill();
  if (!raw || typeof raw !== 'object') return d;

  if (typeof raw.strayPowerFraction === 'number' && Number.isFinite(raw.strayPowerFraction)) {
    return { strayPowerFraction: clampSpill01(raw.strayPowerFraction) };
  }

  const hasLegacy =
    typeof raw.strayLight === 'number' ||
    typeof raw.internalReflection === 'number' ||
    typeof raw.apertureSpill === 'number';
  if (!hasLegacy) return d;

  const s = typeof raw.strayLight === 'number' ? Math.max(0, raw.strayLight) : 0;
  const i = typeof raw.internalReflection === 'number' ? Math.max(0, raw.internalReflection) : 0;
  const a = typeof raw.apertureSpill === 'number' ? Math.max(0, raw.apertureSpill) : 0;
  // Map 0–1 educational mix into a modest physical residual (cap at MAX).
  const mixed = 0.45 * s + 0.25 * i + 0.3 * a;
  return { strayPowerFraction: clampSpill01(mixed * 0.45) };
}

export function hasOpticsSpill(spill: OpticsSpillParams): boolean {
  return spill.strayPowerFraction > 1e-4;
}

/**
 * Pack for GPU: [stray, internal-like, aperture-like] lobe weights derived from
 * a single fraction (wide / mid / near-aperture residual).
 */
export function spillToGpuWeights(spill: OpticsSpillParams): [number, number, number] {
  const f = clampSpill01(spill.strayPowerFraction);
  return [f, f * 0.55, f * 0.85];
}
