/**
 * Linear RGB helpers + educational HDR→SDR display mapping.
 *
 * Pipeline (laser sim):
 *   λ → chromaticity (hue fixed)
 *   P(W) · V(λ) · Rayleigh → intensity (HDR)
 *   chroma × intensity → ACES / hue-preserving tonemap → monitor RGB
 */

import { clamp01, clampRange } from '../../math/clamp';

export type Rgb01 = readonly [number, number, number];

export function clampRgb(rgb: Rgb01): [number, number, number] {
  return [clamp01(rgb[0]), clamp01(rgb[1]), clamp01(rgb[2])];
}

/**
 * Max-normalize RGB so the brightest channel is 1 (chromaticity).
 * Colour depends on wavelength only — never on power.
 */
export function normalizeChromaticity(rgb: Rgb01): [number, number, number] {
  const r = Number.isFinite(rgb[0]) ? Math.max(0, rgb[0]) : 0;
  const g = Number.isFinite(rgb[1]) ? Math.max(0, rgb[1]) : 0;
  const b = Number.isFinite(rgb[2]) ? Math.max(0, rgb[2]) : 0;
  const m = Math.max(r, g, b);
  if (m <= 1e-12) return [0, 0, 0];
  return [r / m, g / m, b / m];
}

/**
 * ACES filmic curve on a single HDR value (Narkowicz fit).
 */
export function acesFilmCurve(x: number): number {
  const a = 2.51;
  const b = 0.03;
  const c = 2.43;
  const d = 0.59;
  const e = 0.14;
  const v = Number.isFinite(x) ? Math.max(0, x) : 0;
  return clamp01((v * (a * v + b)) / (v * (c * v + d) + e));
}

/**
 * Per-channel ACES (can push bright greens toward white on the shoulder).
 * Prefer {@link acesLuminanceToneMap} for laser colour fidelity.
 */
export function acesFilmToneMap(rgb: Rgb01): [number, number, number] {
  return [acesFilmCurve(rgb[0]), acesFilmCurve(rgb[1]), acesFilmCurve(rgb[2])];
}

/**
 * ACES on luminance only, then re-apply chromaticity — power changes brightness,
 * not hue (525 nm stays green instead of yellow/white clip).
 * If a channel exceeds 1 after remapping (vivid greens), gamut-fit by max scale.
 */
export function acesLuminanceToneMap(rgb: Rgb01): [number, number, number] {
  const r = Number.isFinite(rgb[0]) ? Math.max(0, rgb[0]) : 0;
  const g = Number.isFinite(rgb[1]) ? Math.max(0, rgb[1]) : 0;
  const b = Number.isFinite(rgb[2]) ? Math.max(0, rgb[2]) : 0;
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  if (y <= 1e-12) return [0, 0, 0];
  const mappedY = acesFilmCurve(y);
  const s = mappedY / y;
  let outR = r * s;
  let outG = g * s;
  let outB = b * s;
  const peak = Math.max(outR, outG, outB);
  if (peak > 1) {
    outR /= peak;
    outG /= peak;
    outB /= peak;
  }
  return [outR, outG, outB];
}

/**
 * Display RGB: chromaticity (λ) × intensity (power / V(λ) / …) → luminance ACES.
 * Intensity must not recolour the laser — only brighten within the tonemap.
 */
export function displayRgb(chroma: Rgb01, intensity: number): [number, number, number] {
  const c = normalizeChromaticity(chroma);
  const i = Number.isFinite(intensity) ? Math.max(0, intensity) : 0;
  return acesLuminanceToneMap([c[0] * i, c[1] * i, c[2] * i]);
}

export function rgbToHex(rgb: Rgb01): string {
  const [r, g, b] = clampRgb(rgb);
  return `#${toHexByte(Math.round(r * 255))}${toHexByte(Math.round(g * 255))}${toHexByte(Math.round(b * 255))}`;
}

/**
 * Parse `#rgb` / `#rrggbb` / `rrggbb`. Returns null if invalid.
 */
export function hexToRgb(hex: string): [number, number, number] | null {
  const raw = hex.trim().replace(/^#/, '');
  let full = raw;
  if (raw.length === 3) {
    full = raw
      .split('')
      .map((ch) => ch + ch)
      .join('');
  }
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  return [
    parseInt(full.slice(0, 2), 16) / 255,
    parseInt(full.slice(2, 4), 16) / 255,
    parseInt(full.slice(4, 6), 16) / 255,
  ];
}

function toHexByte(value: number): string {
  return Math.round(clampRange(value, 0, 255)).toString(16).padStart(2, '0');
}
