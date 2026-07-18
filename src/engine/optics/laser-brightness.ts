/**
 * Laser apparent brightness: CIE photopic V(λ) + environment-driven eye exposure
 * + editable power→HDR curve.
 *
 * Display chain (educational, not calibrated nits):
 *   P(W), λ → luminous = P·V(λ)·eyeAdaptation(ambient)
 *   → display response curve (default = scientific CIE / Stevens γ≈0.7)
 *   × chromaticity(λ) → luminance-ACES on the volumetric layer
 *
 * Colour never comes from power — only from wavelength chromaticity.
 * No separate day/night vision curves: ambient environment sets exposure.
 *
 * Relative wavelength ordering (Laser Beam and Dot Relative Brightness):
 *   relDot ∝ P·V · relBeam ∝ P·V·(λ_ref/λ)⁴
 *   (global eye exposure cancels in ratios)
 */
import {
  scientificDisplayLuminousToneMap,
  evaluateDisplayResponse,
  type DisplayResponseCurve,
} from './display-response-curve';
import { clampAmbientLevel, ENVIRONMENT_AMBIENT_DEFAULT } from './environment-lighting';
import {
  PHOTOPIC_LUMINOUS_EFFICACY,
  PHOTOPIC_NM_MAX,
  PHOTOPIC_NM_MIN,
} from './photopic-efficacy-table';
import { rayleighScatterWeight } from './wavelength';

/** Luminous product (mW·V) for 1 W at V=1 — science / curve reference. */
export const LASER_LIGHTSABER_LUMINOUS_REF = 1000;

/** @deprecated Prefer LASER_LIGHTSABER_LUMINOUS_REF — kept for older imports. */
export const LASER_DISPLAY_LUMINOUS_REF = LASER_LIGHTSABER_LUMINOUS_REF;

/** @deprecated Theatrical scale; scientific default uses DISPLAY_SCIENCE_HDR_AT_REF. */
export const LASER_LIGHTSABER_DISPLAY_HDR = 48;

/** Scientific Stevens-like exponent (aligned with display-response-curve). */
export const LASER_DISPLAY_POWER_GAMMA = 0.7;

/** Soft HDR ceiling. */
export const LASER_DISPLAY_HDR_CEILING = 96;

/**
 * Max eye-adaptation gain in a fully dark environment (ambientLevel = 0).
 * Models pupil + dark adaptation vs bright-lab baseline (gain = 1).
 */
export const DARK_ENVIRONMENT_ADAPTATION_GAIN = 12;

export interface VisionBrightnessOpts {
  /** Scene ambient level [0,1] from EnvironmentLighting — drives eye exposure. */
  ambientLevel?: number;
  /** Editable power→HDR curve; omit to use scientific CIE / Stevens default. */
  responseCurve?: DisplayResponseCurve | null;
}

/**
 * Photopic relative luminous efficacy V(λ), peak ≈ 1 at 555 nm.
 * Values outside the table clamp to nearest tabulated nm.
 */
export function photopicLuminousEfficacy(wavelengthNm: number): number {
  if (!Number.isFinite(wavelengthNm)) return 0;
  const nm = Math.round(wavelengthNm);
  const clamped = Math.min(PHOTOPIC_NM_MAX, Math.max(PHOTOPIC_NM_MIN, nm));
  return PHOTOPIC_LUMINOUS_EFFICACY[clamped] ?? 0;
}

/** Universal spectral sensitivity: CIE photopic V(λ). */
export function eyeSensitivity(wavelengthNm: number): number {
  return photopicLuminousEfficacy(wavelengthNm);
}

/**
 * Eye exposure from environment brightness (inverse of ambient fill).
 * Dark lab → high gain; bright day → ~1×.
 */
export function eyeAdaptationGainFromAmbient(ambientLevel = ENVIRONMENT_AMBIENT_DEFAULT): number {
  const a = clampAmbientLevel(ambientLevel);
  return 1 + (1 - a) * (DARK_ENVIRONMENT_ADAPTATION_GAIN - 1);
}

/** Alias of eyeAdaptationGainFromAmbient. */
export function eyeAdaptationGain(ambientLevel = ENVIRONMENT_AMBIENT_DEFAULT): number {
  return eyeAdaptationGainFromAmbient(ambientLevel);
}

/** Relative perceived brightness of a laser spot: P(mW) · V(λ) · exposure(ambient). */
export function laserDotLuminousProduct(
  powerW: number,
  wavelengthNm: number,
  ambientLevel = ENVIRONMENT_AMBIENT_DEFAULT,
): number {
  const powerMw = Math.max(0, powerW) * 1000;
  return (
    powerMw *
    eyeSensitivity(wavelengthNm) *
    eyeAdaptationGainFromAmbient(ambientLevel)
  );
}

/**
 * Relative perceived brightness of a laser beam in scattering media:
 * P(mW) · V(λ) · exposure · (λ_ref / λ)⁴
 */
export function laserBeamLuminousProduct(
  powerW: number,
  wavelengthNm: number,
  refNm = 550,
  ambientLevel = ENVIRONMENT_AMBIENT_DEFAULT,
): number {
  return (
    laserDotLuminousProduct(powerW, wavelengthNm, ambientLevel) *
    rayleighScatterWeight(wavelengthNm, refNm)
  );
}

/**
 * HDR intensity from luminous product.
 * Uses editable curve when provided; otherwise the scientific soft-ceil map.
 */
export function displayLuminousToneMap(
  luminousProduct: number,
  curve?: DisplayResponseCurve | null,
): number {
  if (curve?.points?.length) {
    return evaluateDisplayResponse(luminousProduct, curve);
  }
  return scientificDisplayLuminousToneMap(luminousProduct);
}

/** Surface / glow / “dot” display brightness for a light emitter. */
export function laserDotDisplayBrightness(
  powerW: number,
  wavelengthNm: number,
  opts?: VisionBrightnessOpts | null,
): number {
  const ambient = opts?.ambientLevel ?? ENVIRONMENT_AMBIENT_DEFAULT;
  return displayLuminousToneMap(
    laserDotLuminousProduct(powerW, wavelengthNm, ambient),
    opts?.responseCurve,
  );
}

/**
 * Volumetric beam display power factor (V(λ) + ambient exposure + response curve).
 * Multiply by rayleighScatterWeight in the pack/shader for full beam model.
 */
export function laserBeamDisplayPower(
  powerW: number,
  wavelengthNm: number,
  opts?: VisionBrightnessOpts | null,
): number {
  return laserDotDisplayBrightness(powerW, wavelengthNm, opts);
}

/**
 * Relative brightness of laser A vs laser B for dots (spots).
 * Matches calculator: (P_a·V_a) / (P_b·V_b) — exposure cancels.
 */
export function relativeDotBrightness(
  a: { powerW: number; wavelengthNm: number },
  b: { powerW: number; wavelengthNm: number },
  ambientLevel = ENVIRONMENT_AMBIENT_DEFAULT,
): number {
  const lb = laserDotLuminousProduct(b.powerW, b.wavelengthNm, ambientLevel);
  if (lb <= 0) {
    return lb === 0 && laserDotLuminousProduct(a.powerW, a.wavelengthNm, ambientLevel) <= 0
      ? 1
      : Infinity;
  }
  return laserDotLuminousProduct(a.powerW, a.wavelengthNm, ambientLevel) / lb;
}

/**
 * Relative brightness of laser A vs laser B for beams in fog.
 * Matches calculator: dotRatio · (λ_b / λ_a)⁴
 */
export function relativeBeamBrightness(
  a: { powerW: number; wavelengthNm: number },
  b: { powerW: number; wavelengthNm: number },
  ambientLevel = ENVIRONMENT_AMBIENT_DEFAULT,
): number {
  const lb = laserBeamLuminousProduct(b.powerW, b.wavelengthNm, 550, ambientLevel);
  if (lb <= 0) {
    return lb === 0 && laserBeamLuminousProduct(a.powerW, a.wavelengthNm, 550, ambientLevel) <= 0
      ? 1
      : Infinity;
  }
  return laserBeamLuminousProduct(a.powerW, a.wavelengthNm, 550, ambientLevel) / lb;
}

export { scientificDisplayLuminousToneMap, analyticDisplayLuminousToneMap } from './display-response-curve';
