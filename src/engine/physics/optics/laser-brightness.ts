/**
 * Laser apparent brightness: CIE photopic / scotopic V(λ) + environment-driven
 * eye exposure + editable power→HDR curve.
 *
 * Perceived visibility (educational, LaserPointerHub form):
 *   I_vis ≈ P × V_eff(λ) × S_Rayleigh/Mie × Q_beam
 *
 * Two GPU scales:
 *   - physicalLuminousScale → volumetric march (linear in P·V·exposure; ACES at compose)
 *   - displayLuminousPower → surface/UI (Weber–Fechner / editable curve)
 *
 * Physical BeamModel irradiance stays ∝ P; waist is not grown with power (étendue).
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
import { scotopicLuminousEfficacy } from './scotopic-efficacy';
import { rayleighScatterWeight } from './wavelength';

/**
 * Max eye-adaptation gain in a fully dark environment (ambientLevel = 0).
 * Models pupil + dark adaptation vs bright-lab baseline (gain = 1).
 */
export const DARK_ENVIRONMENT_ADAPTATION_GAIN = 12;

/**
 * Ambient level at/above which V_eff is fully photopic.
 * Below this, blends toward scotopic V′ (Purkinje shift) as ambient → 0.
 */
export const PHOTOPIC_AMBIENT_FLOOR = 0.35;

/**
 * Divides CIE luminous product (mW·V·exposure) into a volumetric GPU scale.
 * ~35 ⇒ 150 mW green at night (product ~1.4e3) → scale ~40, visible with outdoor haze.
 */
export const PHYSICAL_LUMINOUS_REF = 35;

export interface VisionBrightnessOpts {
  /** Scene ambient level [0,1] from EnvironmentLighting — drives eye exposure. */
  ambientLevel?: number;
  /** Editable power→HDR curve; omit to use scientific Weber–Fechner default. */
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

/**
 * Photopic weight in mesopic blend: 1 at bright ambient, 0 in full dark.
 * Default ambient (0.38) stays fully photopic so calculator ratios hold.
 */
export function photopicVisionWeight(ambientLevel = ENVIRONMENT_AMBIENT_DEFAULT): number {
  const a = clampAmbientLevel(ambientLevel);
  return Math.min(1, Math.max(0, a / PHOTOPIC_AMBIENT_FLOOR));
}

/**
 * Effective spectral sensitivity V_eff(λ): photopic by day, scotopic in the dark
 * (ambient-driven mesopic blend — Purkinje shift without a mode switch).
 */
export function eyeSensitivity(
  wavelengthNm: number,
  ambientLevel = ENVIRONMENT_AMBIENT_DEFAULT,
): number {
  const w = photopicVisionWeight(ambientLevel);
  if (w >= 1 - 1e-6) return photopicLuminousEfficacy(wavelengthNm);
  if (w <= 1e-6) return scotopicLuminousEfficacy(wavelengthNm);
  return (
    w * photopicLuminousEfficacy(wavelengthNm) +
    (1 - w) * scotopicLuminousEfficacy(wavelengthNm)
  );
}

/**
 * Eye exposure from environment brightness (inverse of ambient fill).
 * Dark lab → high gain; bright day → ~1×.
 */
export function eyeAdaptationGainFromAmbient(ambientLevel = ENVIRONMENT_AMBIENT_DEFAULT): number {
  const a = clampAmbientLevel(ambientLevel);
  return 1 + (1 - a) * (DARK_ENVIRONMENT_ADAPTATION_GAIN - 1);
}

/** Relative perceived brightness of a laser spot: P(mW) · V_eff(λ) · exposure(ambient). */
export function laserDotLuminousProduct(
  powerW: number,
  wavelengthNm: number,
  ambientLevel = ENVIRONMENT_AMBIENT_DEFAULT,
): number {
  const powerMw = Math.max(0, powerW) * 1000;
  return (
    powerMw *
    eyeSensitivity(wavelengthNm, ambientLevel) *
    eyeAdaptationGainFromAmbient(ambientLevel)
  );
}

/**
 * Relative perceived brightness of a laser beam in clear-air (Rayleigh) media:
 * P(mW) · V_eff(λ) · exposure · (λ_ref / λ)⁴
 * Fog/Mie visibility uses the same V_eff but S≈1 in the march (n≈0).
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
 * Linear luminous scale for volumetric in-scatter (no Weber–Fechner).
 * ∝ P · V_eff · eyeAdaptation — power differences remain visible until ACES compose.
 */
export function physicalLuminousScale(
  powerW: number,
  wavelengthNm: number,
  opts?: VisionBrightnessOpts | null,
): number {
  const ambient = opts?.ambientLevel ?? ENVIRONMENT_AMBIENT_DEFAULT;
  return laserDotLuminousProduct(powerW, wavelengthNm, ambient) / PHYSICAL_LUMINOUS_REF;
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
 * Educational display luminous scale for emitters (V_eff(λ) + ambient exposure + response curve).
 * Used as GpuLight.powerDisplay for surfaces/UI; volumetrics use physicalLuminousScale.
 */
export function displayLuminousPower(
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
 * Relative brightness of laser A vs laser B for beams in clear air (Rayleigh).
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

export { scientificDisplayLuminousToneMap } from './display-response-curve';
export { scotopicLuminousEfficacy } from './scotopic-efficacy';
