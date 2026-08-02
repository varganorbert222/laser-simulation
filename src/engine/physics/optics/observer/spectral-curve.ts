/**
 * Dense spectral curve lookup (1 nm tables from CIE/CVRL conversion).
 */
export interface SpectralCurve1nm {
  readonly nmMin: number;
  readonly nmMax: number;
  readonly stepNm: number;
  readonly values: readonly number[];
}

export interface SpectralMultiCurve1nm extends SpectralCurve1nm {
  readonly channels: number;
  readonly channelNames: readonly string[];
}

/** Sample a 1 nm dense curve; clamps to table edges (engine-style). */
export function sampleCurve1nm(curve: SpectralCurve1nm, wavelengthNm: number): number {
  if (!Number.isFinite(wavelengthNm)) return 0;
  const i = Math.round(wavelengthNm);
  if (i <= curve.nmMin) return curve.values[0] ?? 0;
  if (i >= curve.nmMax) return curve.values[curve.values.length - 1] ?? 0;
  return curve.values[i - curve.nmMin] ?? 0;
}

/** Sample interleaved multi-channel curve → channel vector. */
export function sampleMultiCurve1nm(
  curve: SpectralMultiCurve1nm,
  wavelengthNm: number,
): number[] {
  const out = new Array<number>(curve.channels).fill(0);
  if (!Number.isFinite(wavelengthNm)) return out;
  const i = Math.round(wavelengthNm);
  const clamped = Math.max(curve.nmMin, Math.min(curve.nmMax, i));
  const base = (clamped - curve.nmMin) * curve.channels;
  for (let c = 0; c < curve.channels; c++) {
    out[c] = curve.values[base + c] ?? 0;
  }
  return out;
}
