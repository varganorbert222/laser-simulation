/**
 * CIE 2006-compatible LMS cone fundamentals (Stockman & Sharpe 2°).
 * Required before enabling HumanEye cone fatigue.
 */
import { LMS_CIE2006_2DEG } from './data/generated/lms-cie2006-2deg';
import { sampleMultiCurve1nm, type SpectralMultiCurve1nm } from './spectral-curve';

export type LMSConeFundamentals = SpectralMultiCurve1nm;

export const LMS_2006_2DEG: LMSConeFundamentals = LMS_CIE2006_2DEG;

export interface Lms {
  L: number;
  M: number;
  S: number;
}

export function lmsAtWavelength(wavelengthNm: number, spectralRadiance = 1): Lms {
  const [L, M, S] = sampleMultiCurve1nm(LMS_2006_2DEG, wavelengthNm);
  return {
    L: spectralRadiance * (L ?? 0),
    M: spectralRadiance * (M ?? 0),
    S: spectralRadiance * (S ?? 0),
  };
}

/**
 * Approximate linear RGB → LMS via XYZ (Hunt-Pointer-Estevez-ish educational path).
 * Tagged approximated — not a clinical transform.
 */
export function linearRgbToLmsApprox(r: number, g: number, b: number): Lms {
  // RGB → XYZ (D65) then HPE-like XYZ→LMS
  const X = 0.4124564 * r + 0.3575761 * g + 0.1804375 * b;
  const Y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
  const Z = 0.0193339 * r + 0.119192 * g + 0.9503041 * b;
  return {
    L: 0.4002 * X + 0.7076 * Y - 0.0808 * Z,
    M: -0.2263 * X + 1.1653 * Y + 0.0457 * Z,
    S: 0.0 * X + 0.0 * Y + 0.9182 * Z,
  };
}

export function lmsToLinearRgbApprox(lms: Lms): [number, number, number] {
  // Approximate inverse of the above (educational)
  const X = 1.8599364 * lms.L - 1.1293816 * lms.M + 0.2198974 * lms.S;
  const Y = 0.3611914 * lms.L + 0.6388125 * lms.M - 0.0000064 * lms.S;
  const Z = 0.0 * lms.L + 0.0 * lms.M + 1.0890636 * lms.S;
  const r = 3.2404542 * X - 1.5371385 * Y - 0.4985314 * Z;
  const g = -0.969266 * X + 1.8760108 * Y + 0.041556 * Z;
  const b = 0.0556434 * X - 0.2040259 * Y + 1.0572252 * Z;
  return [r, g, b];
}
