/**
 * V(λ) / V′(λ) / educational mesopic tables + V_eff blend.
 */
import { V_LAMBDA_PHOTOPIC } from './data/generated/v-lambda-photopic';
import { V_LAMBDA_SCOTOPIC } from './data/generated/v-lambda-scotopic';
import { V_LAMBDA_MESOPIC_M08 } from './data/generated/v-lambda-mesopic-m08';
import { sampleCurve1nm, type SpectralCurve1nm } from './spectral-curve';

export type VLambdaCurve = SpectralCurve1nm;

export const PHOTOPIC_V: VLambdaCurve = V_LAMBDA_PHOTOPIC;
export const SCOTOPIC_V: VLambdaCurve = V_LAMBDA_SCOTOPIC;
/** Educational mesopic blend target (m=0.8) — not CIE 191 compliance claim. */
export const MESOPIC_V_M08: VLambdaCurve = V_LAMBDA_MESOPIC_M08;

export function photopicV(wavelengthNm: number): number {
  return sampleCurve1nm(PHOTOPIC_V, wavelengthNm);
}

export function scotopicV(wavelengthNm: number): number {
  return sampleCurve1nm(SCOTOPIC_V, wavelengthNm);
}

export function mesopicVm08(wavelengthNm: number): number {
  return sampleCurve1nm(MESOPIC_V_M08, wavelengthNm);
}

/**
 * Educational V_eff(λ):
 *   V_pm = lerp(V, V_mes, mesopicFactor)
 *   V_eff = lerp(V_pm, V′, scotopicWeight)
 *
 * Do **not** apply as Y * V_eff after CMF Y.
 */
export function effectiveVLambda(
  wavelengthNm: number,
  scotopicWeight: number,
  mesopicFactor = 0,
): number {
  const wS = Math.max(0, Math.min(1, scotopicWeight));
  const wM = Math.max(0, Math.min(1, mesopicFactor));
  const vP = photopicV(wavelengthNm);
  const vM = mesopicVm08(wavelengthNm);
  const vS = scotopicV(wavelengthNm);
  const vPm = vP * (1 - wM) + vM * wM;
  return vPm * (1 - wS) + vS * wS;
}
