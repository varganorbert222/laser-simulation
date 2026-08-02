/**
 * Dog dichromat photopigment peaks (educational offline summary).
 *
 * Neitz, Geist & Jacobs (1989): cone peaks ≈ 429 nm (S) and 555 nm (M/L).
 * Jacobs et al. canid ERG: ~430–435 nm and ~555 nm.
 * Curves below are Gaussian lobes peaked at those λ — not digitized lab spectra.
 */
export interface DichromatConePeaks {
  /** Short-wavelength cone peak (nm). */
  readonly sPeakNm: number;
  /** Medium/long shared cone peak (nm). */
  readonly mlPeakNm: number;
  /** Educational Gaussian σ (nm). */
  readonly sigmaNm: number;
}

/** Domestic dog — Neitz et al. 1989 / Jacobs canid ERG. */
export const DOG_CONE_PEAKS: DichromatConePeaks = {
  sPeakNm: 429,
  mlPeakNm: 555,
  sigmaNm: 45,
};

/** Relative Gaussian sensitivity at λ (peak = 1). */
export function gaussianConeSensitivity(
  wavelengthNm: number,
  peakNm: number,
  sigmaNm: number,
): number {
  if (!Number.isFinite(wavelengthNm)) return 0;
  const x = (wavelengthNm - peakNm) / Math.max(1e-6, sigmaNm);
  return Math.exp(-0.5 * x * x);
}

export function dogConeSensitivities(wavelengthNm: number): { S: number; ML: number } {
  return {
    S: gaussianConeSensitivity(wavelengthNm, DOG_CONE_PEAKS.sPeakNm, DOG_CONE_PEAKS.sigmaNm),
    ML: gaussianConeSensitivity(wavelengthNm, DOG_CONE_PEAKS.mlPeakNm, DOG_CONE_PEAKS.sigmaNm),
  };
}
