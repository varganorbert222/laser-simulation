/**
 * Unity-HDR-like appearance for non-laser lights (color / CCT / lumens)
 * vs spectral lasers (wavelengthNm + powerW).
 */

import { clamp01, clampRange } from '../../math/clamp';
import { clampRgb, normalizeChromaticity, type Rgb01 } from './color';
import {
  displayLuminousToneMap,
  eyeAdaptationGainFromAmbient,
  physicalLuminousScale,
  displayLuminousPower,
  photopicLuminousEfficacy,
  type VisionBrightnessOpts,
} from './laser-brightness';
import { ENVIRONMENT_AMBIENT_DEFAULT } from './environment-lighting';
import type { LightMode } from './modes';
import { isSunMode } from './modes';
import { rayleighScatterWeight, wavelengthToRgb } from './wavelength';

/** Lasers stay spectral (λ + W). All other emitters use HDR lamp fields. */
export function isSpectralLightMode(mode: LightMode): boolean {
  return mode === 'laser';
}

/** Divide lumen×exposure into volumetric GPU scale (≈800 lm → similar fill to a 1 W green pointer). */
export const LUMEN_PHYSICAL_REF = 120;

export const COLOR_TEMP_K_MIN = 1000;
export const COLOR_TEMP_K_MAX = 20000;
export const INTENSITY_LM_MAX = 5_000_000;

export interface LightHdrAppearance {
  colorRgb: [number, number, number];
  intensityLm: number;
  useColorTemperature: boolean;
  colorTemperatureK: number;
}

export interface ResolvedEmitterAppearance {
  chroma: [number, number, number];
  powerDisplay: number;
  powerLinear: number;
  /** Effective nm for Rayleigh scatter weight (laser λ, else ~555 or CCT-derived). */
  scatterNm: number;
  scatterWeight: number;
}

export function defaultHdrAppearance(mode: LightMode = 'omni_lamp'): LightHdrAppearance {
  if (isSunMode(mode)) {
    return {
      colorRgb: [1, 0.96, 0.9],
      intensityLm: 80_000,
      useColorTemperature: true,
      colorTemperatureK: 5772,
    };
  }
  if (mode === 'flashlight') {
    return {
      colorRgb: [1, 0.98, 0.92],
      intensityLm: 400,
      useColorTemperature: false,
      colorTemperatureK: 4000,
    };
  }
  if (mode === 'spotlight') {
    return {
      colorRgb: [1, 1, 1],
      intensityLm: 800,
      useColorTemperature: false,
      colorTemperatureK: 5600,
    };
  }
  if (mode === 'parallel') {
    return {
      colorRgb: [1, 1, 1],
      intensityLm: 1200,
      useColorTemperature: false,
      colorTemperatureK: 5600,
    };
  }
  return {
    colorRgb: [1, 0.95, 0.85],
    intensityLm: 600,
    useColorTemperature: false,
    colorTemperatureK: 3000,
  };
}

export function clampColorTemperatureK(k: number, fallback = 6500): number {
  return clampRange(k, COLOR_TEMP_K_MIN, COLOR_TEMP_K_MAX, fallback);
}

export function clampIntensityLm(v: number, fallback = 800): number {
  return clampRange(v, 0, INTENSITY_LM_MAX, fallback);
}

/**
 * Approximate blackbody chromaticity (Tanner Helland fit) → linear RGB filter.
 * Valid roughly 1000–40000 K; clamped to our UI range.
 */
export function colorTemperatureToRgb(kelvin: number): [number, number, number] {
  const k = clampColorTemperatureK(kelvin) / 100;
  let r: number;
  let g: number;
  let b: number;

  if (k <= 66) {
    r = 255;
    g = 99.4708025861 * Math.log(k) - 161.1195681661;
    b = k <= 19 ? 0 : 138.5177312231 * Math.log(k - 10) - 305.0447927307;
  } else {
    r = 329.698727446 * Math.pow(k - 60, -0.1332047592);
    g = 288.1221695283 * Math.pow(k - 60, -0.0755148492);
    b = 255;
  }

  return clampRgb([r / 255, g / 255, b / 255]);
}

/** CIE-ish educational: Φ_v ≈ 683 lm/W · V(λ) · P */
export function estimateIntensityLmFromSpectral(powerW: number, wavelengthNm: number): number {
  const v = photopicLuminousEfficacy(wavelengthNm);
  return clampIntensityLm(Math.max(0, powerW) * 683 * v, 0);
}

export function normalizeHdrAppearance(
  raw: Partial<LightHdrAppearance> | null | undefined,
  fallback: LightHdrAppearance,
): LightHdrAppearance {
  const colorSrc = raw?.colorRgb ?? fallback.colorRgb;
  return {
    colorRgb: clampRgb([
      Number.isFinite(colorSrc[0]) ? colorSrc[0]! : fallback.colorRgb[0],
      Number.isFinite(colorSrc[1]) ? colorSrc[1]! : fallback.colorRgb[1],
      Number.isFinite(colorSrc[2]) ? colorSrc[2]! : fallback.colorRgb[2],
    ]),
    intensityLm: clampIntensityLm(
      typeof raw?.intensityLm === 'number' ? raw.intensityLm : fallback.intensityLm,
      fallback.intensityLm,
    ),
    useColorTemperature:
      typeof raw?.useColorTemperature === 'boolean'
        ? raw.useColorTemperature
        : fallback.useColorTemperature,
    colorTemperatureK: clampColorTemperatureK(
      typeof raw?.colorTemperatureK === 'number'
        ? raw.colorTemperatureK
        : fallback.colorTemperatureK,
      fallback.colorTemperatureK,
    ),
  };
}

/** Final filter chromaticity for an HDR lamp (CCT overrides RGB when enabled). */
export function resolveHdrChroma(hdr: LightHdrAppearance): [number, number, number] {
  if (hdr.useColorTemperature) {
    return normalizeChromaticity(colorTemperatureToRgb(hdr.colorTemperatureK));
  }
  return normalizeChromaticity(hdr.colorRgb);
}

function lampLuminousProduct(
  intensityLm: number,
  ambientLevel = ENVIRONMENT_AMBIENT_DEFAULT,
): number {
  return Math.max(0, intensityLm) * eyeAdaptationGainFromAmbient(ambientLevel);
}

export function physicalLumenScale(
  intensityLm: number,
  opts?: VisionBrightnessOpts | null,
): number {
  const ambient = opts?.ambientLevel ?? ENVIRONMENT_AMBIENT_DEFAULT;
  return lampLuminousProduct(intensityLm, ambient) / LUMEN_PHYSICAL_REF;
}

export function displayLumenBrightness(
  intensityLm: number,
  opts?: VisionBrightnessOpts | null,
): number {
  const ambient = opts?.ambientLevel ?? ENVIRONMENT_AMBIENT_DEFAULT;
  return displayLuminousToneMap(
    lampLuminousProduct(intensityLm, ambient),
    opts?.responseCurve,
  );
}

/**
 * Effective scatter wavelength for non-spectral lights:
 * warm CCT → longer λ, cool → shorter (educational Rayleigh bias).
 */
export function scatterNmFromHdr(hdr: LightHdrAppearance): number {
  if (hdr.useColorTemperature) {
    const t = hdr.colorTemperatureK;
    // Map 2000–10000 K → ~650–450 nm.
    const u = clamp01((t - 2000) / 8000);
    return 650 - u * 200;
  }
  const [r, g, b] = hdr.colorRgb;
  const sum = r + g + b;
  if (sum <= 1e-6) return 555;
  // Rough hue → nm via channel weights.
  return clamp01((2 * r + g) / (2 * sum)) * 200 + 450;
}

export type EmitterAppearanceSource = {
  params: { mode: LightMode };
  wavelengthNm: number;
  powerW: number;
  colorRgb: [number, number, number];
  intensityLm: number;
  useColorTemperature: boolean;
  colorTemperatureK: number;
};

export function resolveEmitterAppearance(
  emitter: EmitterAppearanceSource,
  opts?: VisionBrightnessOpts | null,
): ResolvedEmitterAppearance {
  if (isSpectralLightMode(emitter.params.mode)) {
    const chroma = normalizeChromaticity(wavelengthToRgb(emitter.wavelengthNm) as Rgb01);
    return {
      chroma,
      powerDisplay: displayLuminousPower(emitter.powerW, emitter.wavelengthNm, opts),
      powerLinear: physicalLuminousScale(emitter.powerW, emitter.wavelengthNm, opts),
      scatterNm: emitter.wavelengthNm,
      scatterWeight: rayleighScatterWeight(emitter.wavelengthNm),
    };
  }

  const hdr: LightHdrAppearance = {
    colorRgb: emitter.colorRgb,
    intensityLm: emitter.intensityLm,
    useColorTemperature: emitter.useColorTemperature,
    colorTemperatureK: emitter.colorTemperatureK,
  };
  const scatterNm = scatterNmFromHdr(hdr);
  return {
    chroma: resolveHdrChroma(hdr),
    powerDisplay: displayLumenBrightness(hdr.intensityLm, opts),
    powerLinear: physicalLumenScale(hdr.intensityLm, opts),
    scatterNm,
    scatterWeight: rayleighScatterWeight(scatterNm),
  };
}
