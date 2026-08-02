/**
 * Laser apparent brightness: CIE V(λ) luminance vs Bruton hue.
 *
 * Separation (monitor approximation of real lasers):
 *   - **Hue / chromaticity** → nm→RGB (Dan Bruton); never scales power.
 *   - **Luminance** → Φ_v ≈ 683 · P · V(λ), then relative to a reference laser
 *     (default 1 W @ 532 nm) and multiplied onto linear HDR emissive.
 *
 * Two GPU/UI scales:
 *   - {@link physicalLuminousScale} → volumetric + surface (linear; ACES at compose)
 *   - {@link displayLuminousPower} → UI / science (Weber–Fechner / editable curve)
 *
 * Physical BeamModel irradiance stays ∝ P; waist is not grown with power (étendue).
 *
 * Relative ordering (Laser Beam and Dot Relative Brightness):
 *   relDot ∝ P·V · relBeam ∝ P·V·(λ_ref/λ)⁴
 *   (global eye exposure cancels in ratios)
 */
import {
  scientificDisplayLuminousToneMap,
  evaluateDisplayResponse,
  type DisplayResponseCurve,
} from './display-response-curve';
import { clampAmbientLevel, ENVIRONMENT_AMBIENT_DEFAULT } from '../scene/environment-lighting';
import { clamp01, clampRange } from '../../../math/clamp';
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
const DARK_ENVIRONMENT_ADAPTATION_GAIN = 12;

/**
 * Ambient level at/above which V_eff is fully photopic.
 * Below this, blends toward scotopic V′ (Purkinje shift) as ambient → 0.
 */
const PHOTOPIC_AMBIENT_FLOOR = 0.35;

/**
 * Reference laser for relative luminance (user / industry pointer baseline).
 * L_rel(1 W, 532 nm) = 1 before emissive gain / eye adaptation.
 */
export const LASER_LUMINANCE_REF_NM = 532;
export const LASER_LUMINANCE_REF_POWER_W = 1;

/**
 * Linear emissive multiplier after L_rel for GPU (volumetric `powerLinear`).
 * HDR keeps more headroom into compose tonemap; SDR is milder (compose also ×0.55).
 */
export const LASER_EMISSIVE_GAIN_HDR = 28;
export const LASER_EMISSIVE_GAIN_SDR = 16;

export type ColorProfileBrightness = 'hdr' | 'sdr';

export interface VisionBrightnessOpts {
  /** Scene ambient level [0,1] — drives mesopic V_eff and (when pack-side) eye gain. */
  ambientLevel?: number;
  /** Editable power→HDR curve; omit to use scientific Weber–Fechner default. */
  responseCurve?: DisplayResponseCurve | null;
  /**
   * When false, pack-side eyeAdaptationGain is 1 — compose HDR auto-exposure
   * handles display adaptation (Atmosphere / sky ON). Default true (lab / sky OFF).
   */
  packSideAdaptation?: boolean;
  /**
   * Display colour profile from Quality — scales emissive headroom after L_rel.
   * Default `'hdr'`.
   */
  colorProfile?: ColorProfileBrightness;
}

/**
 * Photopic relative luminous efficacy V(λ), peak ≈ 1 at 555 nm.
 * Values outside the table clamp to nearest tabulated nm.
 */
export function photopicLuminousEfficacy(wavelengthNm: number): number {
  if (!Number.isFinite(wavelengthNm)) return 0;
  const clamped = Math.round(clampRange(wavelengthNm, PHOTOPIC_NM_MIN, PHOTOPIC_NM_MAX));
  return PHOTOPIC_LUMINOUS_EFFICACY[clamped] ?? 0;
}

/**
 * Photopic weight in mesopic blend: 1 at bright ambient, 0 in full dark.
 * Default ambient (0.38) stays fully photopic so calculator ratios hold.
 */
export function photopicVisionWeight(ambientLevel = ENVIRONMENT_AMBIENT_DEFAULT): number {
  const a = clampAmbientLevel(ambientLevel);
  return clamp01(a / PHOTOPIC_AMBIENT_FLOOR);
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
 * Monochromatic luminous flux (lm): Φ_v ≈ 683 · P · V(λ) (CIE photopic).
 * Educational — real lasers are narrowband; this is the standard CIE shortcut.
 */
export function luminousFluxLm(powerW: number, wavelengthNm: number): number {
  return Math.max(0, powerW) * 683 * photopicLuminousEfficacy(wavelengthNm);
}

/**
 * Eye exposure from environment brightness (inverse of ambient fill).
 * Dark lab → high gain; bright day → ~1×.
 * Used only when pack-side adaptation is on (sky OFF); sky ON uses compose AE.
 */
export function eyeAdaptationGainFromAmbient(ambientLevel = ENVIRONMENT_AMBIENT_DEFAULT): number {
  const a = clampAmbientLevel(ambientLevel);
  return 1 + (1 - a) * (DARK_ENVIRONMENT_ADAPTATION_GAIN - 1);
}

/** Pack-side adaptation gain from vision opts (1 when compose auto-exposure owns display). */
export function packSideEyeAdaptationGain(opts?: VisionBrightnessOpts | null): number {
  if (opts?.packSideAdaptation === false) return 1;
  return eyeAdaptationGainFromAmbient(opts?.ambientLevel ?? ENVIRONMENT_AMBIENT_DEFAULT);
}

export function laserEmissiveGainForProfile(
  profile: ColorProfileBrightness | null | undefined,
): number {
  return profile === 'sdr' ? LASER_EMISSIVE_GAIN_SDR : LASER_EMISSIVE_GAIN_HDR;
}

/**
 * Relative luminance vs a reference laser (default 1 W @ 532 nm):
 *   L_rel = (P · V_eff(λ)) / (P_ref · V_eff(λ_ref))
 *
 * Hue is not involved — only spectral sensitivity and power.
 * Eye adaptation is applied later ({@link physicalLuminousScale}) so dark-lab
 * gain brightens all wavelengths equally.
 */
export function relativeLaserLuminance(
  powerW: number,
  wavelengthNm: number,
  ambientLevel = ENVIRONMENT_AMBIENT_DEFAULT,
  refPowerW = LASER_LUMINANCE_REF_POWER_W,
  refNm = LASER_LUMINANCE_REF_NM,
): number {
  const num = Math.max(0, powerW) * eyeSensitivity(wavelengthNm, ambientLevel);
  const den = Math.max(1e-12, Math.max(0, refPowerW) * eyeSensitivity(refNm, ambientLevel));
  return num / den;
}

/** Relative perceived brightness of a laser spot: P(mW) · V_eff(λ) · exposure(ambient). */
export function laserDotLuminousProduct(
  powerW: number,
  wavelengthNm: number,
  ambientLevel = ENVIRONMENT_AMBIENT_DEFAULT,
  packSideAdaptation = true,
): number {
  const powerMw = Math.max(0, powerW) * 1000;
  const gain = packSideAdaptation
    ? eyeAdaptationGainFromAmbient(ambientLevel)
    : 1;
  return powerMw * eyeSensitivity(wavelengthNm, ambientLevel) * gain;
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
 * Linear luminous scale for volumetric in-scatter / surface emissive (no Weber–Fechner).
 *
 *   powerLinear = L_rel(P, λ) · eyeAdaptation · emissiveGain(HDR|SDR)
 *
 * Chromaticity (nm→RGB) is applied separately as a unit-peak filter.
 */
export function physicalLuminousScale(
  powerW: number,
  wavelengthNm: number,
  opts?: VisionBrightnessOpts | null,
): number {
  const ambient = opts?.ambientLevel ?? ENVIRONMENT_AMBIENT_DEFAULT;
  const rel = relativeLaserLuminance(powerW, wavelengthNm, ambient);
  const eye = packSideEyeAdaptationGain(opts);
  const emissive = laserEmissiveGainForProfile(opts?.colorProfile);
  return rel * eye * emissive;
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
  const packSide = opts?.packSideAdaptation !== false;
  return displayLuminousToneMap(
    laserDotLuminousProduct(powerW, wavelengthNm, ambient, packSide),
    opts?.responseCurve,
  );
}

/**
 * Educational display luminous scale for emitters (V_eff(λ) + ambient exposure + response curve).
 * Used for UI / science readout display brightness; GPU surfaces+volumetrics use physicalLuminousScale.
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
