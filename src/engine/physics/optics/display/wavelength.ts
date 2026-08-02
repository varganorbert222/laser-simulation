import { C, EV, H, VISIBLE_NM_MAX, VISIBLE_NM_MIN } from './constants';
import { clamp01, clampRange } from '../../../math/clamp';
import type { Rgb01 } from './color';

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
 * Refined Academo piecewise RGB × vision-limit factor — **no γ encode**.
 * Use for GPU / working-space chromaticity (Linear HDR pipeline).
 */
export function wavelengthToRgbLinear(nm: number): readonly [number, number, number] {
  if (!Number.isFinite(nm)) return [0, 0, 0];
  const wavelength = nm;

  let red = 0;
  let green = 0;
  let blue = 0;

  if (wavelength >= 380 && wavelength < 440) {
    red = -(wavelength - 440) / (440 - 380);
    green = 0;
    blue = 0.9;
  } else if (wavelength >= 440 && wavelength < 490) {
    red = 0;
    green = (wavelength - 440) / (490 - 430);
    blue = 0.75;
  } else if (wavelength >= 490 && wavelength < 510) {
    red = 0;
    green = 0.85;
    blue = -(wavelength - 510) / (510 - 490);
  } else if (wavelength >= 510 && wavelength < 580) {
    red = (wavelength - 510) / (580 - 510);
    green = 0.85;
    blue = 0;
  } else if (wavelength >= 580 && wavelength < 645) {
    red = 1;
    green = -(wavelength - 645) / (645 - 573);
    blue = 0;
  } else if (wavelength >= 645 && wavelength < 781) {
    red = 1;
    green = 0;
    blue = 0;
  } else {
    return [0, 0, 0];
  }

  let factor = 0;
  if (wavelength >= 380 && wavelength < 420) {
    factor = 0.15 + (0.7 * (wavelength - 380)) / (420 - 380);
  } else if (wavelength >= 420 && wavelength < 645) {
    factor = 1;
  } else if (wavelength >= 645 && wavelength < 781) {
    factor = 0.3 + (0.7 * (780 - wavelength)) / (780 - 645);
  }

  return [red * factor, green * factor, blue * factor];
}

/**
 * Display λ → RGB in [0, 1] (Academo γ = 0.80 encode for UI swatches).
 * For lighting / volumetrics use {@link wavelengthToRgbLinear} + normalizeChromaticity.
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
 * Classic Academo / Dan Bruton nm→RGB (0–1), kept for comparison / docs.
 * Prefer {@link wavelengthToRgb} for product tint.
 */
export function wavelengthToRgbAcademoOriginal(nm: number): readonly [number, number, number] {
  if (!Number.isFinite(nm)) return [0, 0, 0];
  const wavelength = nm;
  const gamma = 0.8;

  let red = 0;
  let green = 0;
  let blue = 0;

  if (wavelength >= 380 && wavelength < 440) {
    red = -(wavelength - 440) / (440 - 380);
    green = 0;
    blue = 1;
  } else if (wavelength >= 440 && wavelength < 490) {
    red = 0;
    green = (wavelength - 440) / (490 - 440);
    blue = 1;
  } else if (wavelength >= 490 && wavelength < 510) {
    red = 0;
    green = 1;
    blue = -(wavelength - 510) / (510 - 490);
  } else if (wavelength >= 510 && wavelength < 580) {
    red = (wavelength - 510) / (580 - 510);
    green = 1;
    blue = 0;
  } else if (wavelength >= 580 && wavelength < 645) {
    red = 1;
    green = -(wavelength - 645) / (645 - 580);
    blue = 0;
  } else if (wavelength >= 645 && wavelength < 781) {
    red = 1;
    green = 0;
    blue = 0;
  } else {
    return [0, 0, 0];
  }

  let factor = 0;
  if (wavelength >= 380 && wavelength < 420) {
    factor = 0.3 + (0.7 * (wavelength - 380)) / (420 - 380);
  } else if (wavelength >= 420 && wavelength < 701) {
    factor = 1;
  } else if (wavelength >= 701 && wavelength < 781) {
    factor = 0.3 + (0.7 * (780 - wavelength)) / (780 - 700);
  }

  const R = red !== 0 ? Math.pow(red * factor, gamma) : 0;
  const G = green !== 0 ? Math.pow(green * factor, gamma) : 0;
  const B = blue !== 0 ? Math.pow(blue * factor, gamma) : 0;
  return [R, G, B];
}

/**
 * 8-bit RGB (0–255) for hex/UI previews — same locus as {@link wavelengthToRgb}.
 */
export function wavelengthToRgb255(nm: number): readonly [number, number, number] {
  const [r, g, b] = wavelengthToRgb(nm);
  return [
    Math.round(255 * r),
    Math.round(255 * g),
    Math.round(255 * b),
  ];
}

type SpectralSample = { nm: number; rgb: Rgb01 };

let spectralLut: SpectralSample[] | null = null;

function getSpectralLut(): SpectralSample[] {
  if (!spectralLut) {
    const samples: SpectralSample[] = [];
    for (let nm = VISIBLE_NM_MIN; nm <= VISIBLE_NM_MAX; nm += 1) {
      samples.push({ nm, rgb: wavelengthToRgb(nm) });
    }
    spectralLut = samples;
  }
  return spectralLut;
}

/**
 * Inverse display mapping RGB → nearest visible λ (nm).
 * Educational approximation — non-spectral colors (gray, magenta) snap to closest locus sample.
 */
export function rgbToWavelengthNm(rgb: Rgb01): number {
  const r = clamp01(rgb[0]);
  const g = clamp01(rgb[1]);
  const b = clamp01(rgb[2]);
  let bestNm = 550;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const sample of getSpectralLut()) {
    const dr = sample.rgb[0] - r;
    const dg = sample.rgb[1] - g;
    const db = sample.rgb[2] - b;
    const dist = dr * dr + dg * dg + db * db;
    if (dist < bestDist) {
      bestDist = dist;
      bestNm = sample.nm;
    }
  }
  return bestNm;
}

/**
 * Rayleigh-inspired scattering weight ∝ λ⁻⁴, normalized at 550 nm.
 * Educational weight only — not a full atmospheric model.
 */
export function rayleighScatterWeight(nm: number, refNm = 550): number {
  const clamped = clampRange(nm, VISIBLE_NM_MIN, VISIBLE_NM_MAX);
  return Math.pow(refNm / clamped, 4);
}
