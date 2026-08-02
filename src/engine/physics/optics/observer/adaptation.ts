/**
 * HumanEye adaptation polarity (P0 fix).
 *
 * Y high = day → photopic; Y low = night → scotopic.
 * `blend` / scotopicWeight: 0 = photopic, 1 = scotopic.
 */
import { smoothstep } from '../../../math/smoothstep';
import { clamp01 } from '../../../math/clamp';

export interface EyeAdaptationState {
  /** 0 = photopic, 1 = scotopic */
  scotopicWeight: number;
  /**
   * Educational mesopic peak in intermediate Y (0 at both extremes).
   * Blend-target curve weight — not CIE 191 dynamic compliance.
   */
  mesopicFactor: number;
  /** Metered scene luminance Y used for this state. */
  sceneLuminanceY: number;
}

/** Default educational thresholds in relative HDR buffer units. */
export const ADAPTATION_Y_NIGHT = 0.01;
export const ADAPTATION_Y_DAY = 10;

/**
 * Correct polarity: scotopicWeight = 1 - smoothstep(Y_night, Y_day, avgY)
 */
export function scotopicWeightFromLuminanceY(
  avgY: number,
  yNight = ADAPTATION_Y_NIGHT,
  yDay = ADAPTATION_Y_DAY,
): number {
  if (!Number.isFinite(avgY)) return 0;
  return clamp01(1 - smoothstep(yNight, yDay, avgY));
}

/**
 * Educational mesopic lobe: peaks near geometric mid of night/day, 0 at extremes.
 */
export function mesopicFactorFromLuminanceY(
  avgY: number,
  yNight = ADAPTATION_Y_NIGHT,
  yDay = ADAPTATION_Y_DAY,
): number {
  if (!Number.isFinite(avgY)) return 0;
  const logN = Math.log10(Math.max(1e-8, yNight));
  const logD = Math.log10(Math.max(1e-8, yDay));
  const logY = Math.log10(Math.max(1e-8, avgY));
  const t = clamp01((logY - logN) / Math.max(1e-8, logD - logN));
  // Smooth bump: 4 t (1-t) peaks at 1 when t=0.5
  return clamp01(4 * t * (1 - t));
}

export function adaptFromSceneLuminanceY(avgY: number): EyeAdaptationState {
  return {
    scotopicWeight: scotopicWeightFromLuminanceY(avgY),
    mesopicFactor: mesopicFactorFromLuminanceY(avgY),
    sceneLuminanceY: avgY,
  };
}
