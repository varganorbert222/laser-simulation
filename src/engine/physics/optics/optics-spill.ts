/**
 * Residual optical power outside the ideal TEM00 / designed beam.
 *
 * Scientifically: a single energy fraction `strayPowerFraction` (0–1) is the
 * correct first-order description of power that never stays in the designed
 * mode (scatter, coating bounce, baffle leak). Core irradiance is scaled by
 * (1 − f); residual irradiance carries fraction f.
 *
 * That residual is *not* a single blob — see `optics-residual.ts` for the
 * educational decomposition into ghosts / Tyndall halo / edge leak / flare
 * streaks (lens ghosting & internal reflection phenomenology).
 *
 * Aberrations that reshape the designed core (coma, astigmatism, spherical,
 * ellipticity) are separate LaserParams — they do not consume stray power.
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

import { clampRange } from '../../math/clamp';

export const OPTICS_SPILL_MIN = 0;
export const OPTICS_SPILL_MAX = 0.85;

export function clampSpill01(v: number): number {
  return clampRange(v, OPTICS_SPILL_MIN, OPTICS_SPILL_MAX, 0);
}

export function defaultOpticsSpill(): OpticsSpillParams {
  // ~8%: plausible for multi-element uncoated / poorly baffled educational optics.
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
  const mixed = 0.45 * s + 0.25 * i + 0.3 * a;
  return { strayPowerFraction: clampSpill01(mixed * 0.45) };
}

export function hasOpticsSpill(spill: OpticsSpillParams): boolean {
  return spill.strayPowerFraction > 1e-4;
}

/**
 * Pack for GPU: spill.x = strayPowerFraction.
 * For gaussian lasers, spill.y = packUnitPair(coma, astigmatism) (float32-safe).
 * spill.z unused.
 */
export function spillToGpuWeights(spill: OpticsSpillParams): [number, number, number] {
  const f = clampSpill01(spill.strayPowerFraction);
  return [f, 0, 0];
}
