/** Gaussian beam waist radius w(z) and Rayleigh range helpers. */

export function rayleighRange(w0: number, wavelengthM: number): number {
  if (wavelengthM <= 0) return Infinity;
  return (Math.PI * w0 * w0) / wavelengthM;
}

/** Beam radius at distance z from the waist (meters). */
export function beamRadiusAt(w0: number, zR: number, z: number): number {
  if (!Number.isFinite(zR) || zR === 0) return w0;
  return w0 * Math.sqrt(1 + (z / zR) * (z / zR));
}

/** Far-field half-angle divergence (radians) ≈ λ / (π w0). */
export function divergenceHalfAngle(w0: number, wavelengthM: number): number {
  if (w0 <= 0) return Infinity;
  return wavelengthM / (Math.PI * w0);
}

export function divergenceMrad(w0: number, wavelengthM: number): number {
  return divergenceHalfAngle(w0, wavelengthM) * 1e3;
}
