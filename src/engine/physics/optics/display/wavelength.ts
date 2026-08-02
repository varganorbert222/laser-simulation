import { C, EV, H, VISIBLE_NM_MAX, VISIBLE_NM_MIN } from './constants';
import { clampRange } from '../../../math/clamp';
import type { Rgb01 } from './color';
import { rgbToDominantWavelength } from './cie-dominant-wavelength';

export { VISIBLE_NM_MAX, VISIBLE_NM_MIN } from './constants';

export interface WavelengthDerived {
  wavelengthNm: number;
  frequencyHz: number;
  frequencyTHz: number;
  wavenumberPerM: number;
  wavenumberPerCm: number;
  energyJ: number;
  energyEv: number;
}

export function deriveFromWavelengthNm(wavelengthNm: number): WavelengthDerived {
  const lambdaM = wavelengthNm * 1e-9;
  const frequencyHz = C / lambdaM;
  const energyJ = H * frequencyHz;
  return {
    wavelengthNm,
    frequencyHz,
    frequencyTHz: frequencyHz / 1e12,
    wavenumberPerM: 1 / lambdaM,
    wavenumberPerCm: 1 / (lambdaM * 100),
    energyJ,
    energyEv: energyJ / EV,
  };
}

/**
 * Clamp to the display/colour spectrum ({@link VISIBLE_NM_MIN}–{@link VISIBLE_NM_MAX}).
 */
export function clampVisibleWavelengthNm(nm: number, fallback = 550): number {
  return clampRange(nm, VISIBLE_NM_MIN, VISIBLE_NM_MAX, fallback);
}

/**
 * Dan Bruton piecewise λ → RGB (pre-γ) — exact match of `temp/colorUtils.js`
 * (`wavelengthToRgb`), spectrum **380–700 nm** only.
 */
function brutonPiecewise(nm: number): { r: number; g: number; b: number; factor: number } {
  if (!Number.isFinite(nm)) return { r: 0, g: 0, b: 0, factor: 0 };

  let r = 0;
  let g = 0;
  let b = 0;

  if (nm >= 380 && nm < 440) {
    r = -(nm - 440) / (440 - 380);
    g = 0;
    b = 1;
  } else if (nm >= 440 && nm < 490) {
    r = 0;
    g = (nm - 440) / (490 - 440);
    b = 1;
  } else if (nm >= 490 && nm < 510) {
    r = 0;
    g = 1;
    b = -(nm - 510) / (510 - 490);
  } else if (nm >= 510 && nm < 580) {
    r = (nm - 510) / (580 - 510);
    g = 1;
    b = 0;
  } else if (nm >= 580 && nm < 645) {
    r = 1;
    g = -(nm - 645) / (645 - 580);
    b = 0;
  } else if (nm >= 645 && nm <= 700) {
    r = 1;
    g = 0;
    b = 0;
  } else {
    return { r: 0, g: 0, b: 0, factor: 0 };
  }

  // Intensity falloff at edges of visible spectrum (colorUtils.js)
  let factor: number;
  if (nm >= 380 && nm < 420) {
    factor = 0.3 + (0.7 * (nm - 380)) / (420 - 380);
  } else if (nm >= 420 && nm <= 680) {
    factor = 1.0;
  } else if (nm > 680 && nm <= 700) {
    factor = 0.3 + (0.7 * (700 - nm)) / (700 - 680);
  } else {
    factor = 0;
  }

  return { r, g, b, factor };
}

/**
 * Linear working-space λ → RGB (Bruton × factor, **no γ encode**).
 * Use for GPU / lighting chromaticity (+ normalizeChromaticity).
 */
export function wavelengthToRgbLinear(nm: number): readonly [number, number, number] {
  const { r, g, b, factor } = brutonPiecewise(nm);
  return [r * factor, g * factor, b * factor];
}

/**
 * Display λ → RGB in [0, 1] — `colorUtils.wavelengthToRgb` with γ = 0.80
 * (floats instead of 0–255; see {@link wavelengthToRgb255}).
 */
export function wavelengthToRgb(nm: number): readonly [number, number, number] {
  const [r, g, b] = wavelengthToRgbLinear(nm);
  const gamma = 0.8;
  return [
    r !== 0 ? Math.pow(r, gamma) : 0,
    g !== 0 ? Math.pow(g, gamma) : 0,
    b !== 0 ? Math.pow(b, gamma) : 0,
  ];
}

/**
 * 8-bit RGB (0–255) — same rounding as `colorUtils.wavelengthToRgb`.
 */
export function wavelengthToRgb255(nm: number): readonly [number, number, number] {
  const [r, g, b] = wavelengthToRgb(nm);
  return [
    Math.round(255 * r),
    Math.round(255 * g),
    Math.round(255 * b),
  ];
}

/**
 * Inverse for UI: sRGB → CIE dominant (or complementary) wavelength in nm.
 * Chromaticity mapping only — not a physical monochromatic decomposition.
 * Achromatic → 550 nm; result clamped to 380–700 nm.
 */
export function rgbToWavelengthNm(rgb: Rgb01): number {
  const result = rgbToDominantWavelength(rgb);
  if (result.wavelengthNm == null) return 550;
  return Math.round(clampVisibleWavelengthNm(result.wavelengthNm));
}

/**
 * Rayleigh-inspired scattering weight ∝ λ⁻⁴, normalized at 550 nm.
 * Educational weight only — not a full atmospheric model.
 */
export function rayleighScatterWeight(nm: number, refNm = 550): number {
  const clamped = clampVisibleWavelengthNm(nm);
  return Math.pow(refNm / clamped, 4);
}

export type { DominantWavelengthKind, DominantWavelengthResult } from './cie-dominant-wavelength';
export {
  rgbToDominantWavelength,
  hexToDominantWavelength,
  rgb01ToXy,
  CIE_D65_WHITE,
} from './cie-dominant-wavelength';
