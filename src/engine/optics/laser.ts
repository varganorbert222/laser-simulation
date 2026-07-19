/** Gaussian beam waist radius w(z), Rayleigh range, and TEM00 irradiance helpers. */

/** Soft display scale so étendue-normalized Li stays in a usable HDR range. */
export const DISPLAY_RADIANCE_SCALE = 1e-3;

export function clampM2(m2: number): number {
  if (!Number.isFinite(m2)) return 1;
  return Math.min(50, Math.max(1, m2));
}

/**
 * Migrate legacy visual `parallelness` (0–1) → beam quality M².
 * parallelness=1 → M²=1 (diffraction-limited); 0 → M²≈4.
 */
export function m2FromParallelness(parallelness: number): number {
  const p = Math.min(1, Math.max(0, Number.isFinite(parallelness) ? parallelness : 1));
  return clampM2(1 + 3 * (1 - p));
}

export function rayleighRange(w0: number, wavelengthM: number, m2 = 1): number {
  if (wavelengthM <= 0) return Infinity;
  const m = clampM2(m2);
  return (Math.PI * w0 * w0) / (m * wavelengthM);
}

/** Beam radius at distance z from the waist (meters). */
export function beamRadiusAt(w0: number, zR: number, z: number): number {
  if (!Number.isFinite(zR) || zR === 0) return w0;
  return w0 * Math.sqrt(1 + (z / zR) * (z / zR));
}

/**
 * Far-field half-angle divergence (radians) ≈ M² λ / (π w0).
 */
export function divergenceHalfAngle(w0: number, wavelengthM: number, m2 = 1): number {
  if (w0 <= 0) return Infinity;
  return (clampM2(m2) * wavelengthM) / (Math.PI * w0);
}

export function divergenceMrad(w0: number, wavelengthM: number, m2 = 1): number {
  return divergenceHalfAngle(w0, wavelengthM, m2) * 1e3;
}

/**
 * TEM00 intensity footprint (peak 1): I(r,w) = exp(−2 r² / w²).
 */
export function gaussianTem00Profile(r: number, w: number): number {
  const ww = Math.max(w, 1e-6);
  return Math.exp((-2 * (r * r)) / (ww * ww));
}

/**
 * Étendue-normalized TEM00 irradiance density (∫ I dA = 1 over the plane):
 * I = (2 / (π w²)) exp(−2 r² / w²).
 */
export function gaussianTem00Density(r: number, w: number): number {
  const ww = Math.max(w, 1e-6);
  const w2 = ww * ww;
  return ((2 / Math.PI) / w2) * Math.exp((-2 * (r * r)) / w2);
}

/** Elliptic TEM00 density with ∫ I dA = 1: (2/(π wx wy)) exp(−2(x²/wx² + y²/wy²)). */
export function gaussianTem00DensityElliptic(x: number, y: number, wx: number, wy: number): number {
  const ax = Math.max(wx, 1e-6);
  const ay = Math.max(wy, 1e-6);
  return ((2 / Math.PI) / (ax * ay)) * Math.exp(-2 * ((x * x) / (ax * ax) + (y * y) / (ay * ay)));
}

/**
 * Peak irradiance for power P: E0 = 2 P / (π w²).
 * With density form, E(r) = P · gaussianTem00Density(r,w).
 */
export function peakIrradiance(power: number, w: number): number {
  const ww = Math.max(w, 1e-6);
  return (2 * Math.max(0, power)) / (Math.PI * ww * ww);
}

/** Beam radius with M²-aware Rayleigh range. */
export function laserBeamRadius(w0: number, wavelengthM: number, m2: number, z: number): number {
  const w = Math.max(w0, 1e-4);
  const zR = rayleighRange(w, Math.max(wavelengthM, 1e-12), m2);
  return beamRadiusAt(w, zR, z);
}
