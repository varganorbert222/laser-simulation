/**
 * Scotopic (night) relative luminous efficacy V′(λ).
 *
 * Educational Gaussian approximation peaked near CIE scotopic peak (~507 nm).
 * Peak normalized to 1 — not a calibrated CIE table, but visually faithful for lasers.
 */

/** CIE-ish scotopic peak (nm). */
const SCOTOPIC_PEAK_NM = 507;

/** Gaussian width (nm) for the educational V′(λ) lobe. */
const SCOTOPIC_SIGMA_NM = 50;

/**
 * Relative scotopic efficacy V′(λ), peak ≈ 1 at ~507 nm.
 * Returns 0 for non-finite input.
 */
export function scotopicLuminousEfficacy(wavelengthNm: number): number {
  if (!Number.isFinite(wavelengthNm)) return 0;
  const x = (wavelengthNm - SCOTOPIC_PEAK_NM) / SCOTOPIC_SIGMA_NM;
  return Math.exp(-0.5 * x * x);
}
