import { C, EV, H, VISIBLE_NM_MAX, VISIBLE_NM_MIN } from './constants';
import { clamp01, type Rgb01 } from './color';

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
 * Display mapping λ → RGB (educational approximation from common CIE-ish piecewise).
 * Tagged as visualized / approximated — not a calibrated colorimetric transform.
 */
export function wavelengthToRgb(nm: number): readonly [number, number, number] {
  const w = Math.min(Math.max(nm, VISIBLE_NM_MIN), 809);
  let red = 0;
  let green = 0;
  let blue = 0;

  if (w >= 380 && w < 440) {
    red = -(w - 440) / (440 - 380);
    blue = 1;
  } else if (w >= 440 && w < 490) {
    green = (w - 440) / (490 - 440);
    blue = 1;
  } else if (w >= 490 && w < 510) {
    green = 1;
    blue = -(w - 510) / (510 - 490);
  } else if (w >= 510 && w < 580) {
    red = (w - 510) / (580 - 510);
    green = 1;
  } else if (w >= 580 && w < 645) {
    red = 1;
    green = -(w - 645) / (645 - 580);
  } else if (w >= 645 && w < 809) {
    red = 1;
  }

  let factor = 0;
  if (w >= 380 && w < 420) factor = 0.3 + (0.7 * (w - 380)) / (420 - 380);
  else if (w >= 420 && w < 645) factor = 1;
  else if (w >= 645 && w < 809) factor = 0.3 + (0.7 * (809 - w)) / (809 - 645);

  const gamma = 0.8;
  const R = red > 0 ? Math.pow(red * factor, gamma) : 0;
  const G = green > 0 ? Math.pow(green * factor, gamma) : 0;
  const B = blue > 0 ? Math.pow(blue * factor, gamma) : 0;
  return [R, G, B];
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
  const clamped = Math.min(Math.max(nm, VISIBLE_NM_MIN), VISIBLE_NM_MAX);
  return Math.pow(refNm / clamped, 4);
}

/**
 * Compressive display curve for monitor brightness from power in watts.
 * Always labeled as tone-mapped — not linear perceived brightness.
 */
export function displayPowerCurve(powerW: number, gamma = 0.7): number {
  return Math.pow(Math.max(powerW, 0), gamma);
}
