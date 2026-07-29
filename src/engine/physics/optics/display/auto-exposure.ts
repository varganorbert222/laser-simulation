/**
 * HDR auto-exposure from average scene luminance (log-average / key-value).
 * Used at compose time when Atmosphere is enabled — lasers contribute only via
 * visible HDR energy in the frame (volumetric scatter + surface), not watts/nm.
 */
import { clampRange } from '../../../math/clamp';

/** Middle-grey key (Reinhard / photographic). */
export const AUTO_EXPOSURE_KEY = 0.18;

export const AUTO_EXPOSURE_MIN = 0.05;
export const AUTO_EXPOSURE_MAX = 8;

/** Temporal EMA toward target exposure per frame (~eye adaptation). */
export const AUTO_EXPOSURE_EMA_ALPHA = 0.08;

/**
 * Legacy HDR compose pre-exposure when auto-exposure is off
 * (matches previous `combined * 0.25` path).
 */
export const MANUAL_HDR_EXPOSURE = 0.25;

/** SDR compose: full-strength tonemap (no pre-dim). */
export const MANUAL_SDR_EXPOSURE = 1;

/**
 * Exposure multiplier from average linear luminance.
 * target = key / avgLum, clamped for stability.
 */
export function exposureFromAvgLuminance(
  avgLum: number,
  key: number = AUTO_EXPOSURE_KEY,
): number {
  const lum = Math.max(avgLum, 1e-4);
  const k = Number.isFinite(key) && key > 0 ? key : AUTO_EXPOSURE_KEY;
  return clampRange(k / lum, AUTO_EXPOSURE_MIN, AUTO_EXPOSURE_MAX);
}

/** Exponential moving average toward target exposure. */
export function smoothExposure(
  previous: number,
  target: number,
  alpha: number = AUTO_EXPOSURE_EMA_ALPHA,
): number {
  const a = clampRange(alpha, 0, 1);
  const prev = Number.isFinite(previous) ? previous : target;
  const tgt = Number.isFinite(target) ? target : prev;
  return prev + (tgt - prev) * a;
}

/**
 * Compose exposure when auto-exposure is disabled.
 * Preserves prior HDR vs SDR headroom behaviour.
 */
export function manualComposeExposure(colorProfile: 'hdr' | 'sdr'): number {
  return colorProfile === 'sdr' ? MANUAL_SDR_EXPOSURE : MANUAL_HDR_EXPOSURE;
}
