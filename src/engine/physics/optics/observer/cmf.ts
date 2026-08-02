/**
 * CIE 1931 2° colour-matching functions (offline).
 */
import { CMF_CIE1931_2DEG } from './data/generated/cmf-cie1931-2deg';
import { sampleMultiCurve1nm, type SpectralMultiCurve1nm } from './spectral-curve';

export type ColorMatchingFunctions = SpectralMultiCurve1nm;

export const CMF_1931_2DEG: ColorMatchingFunctions = CMF_CIE1931_2DEG;

export interface Xyz {
  X: number;
  Y: number;
  Z: number;
}

/** Narrowband educational shortcut: ∝ L₀ · CMF(λ₀). */
export function cmfXyzAtWavelength(wavelengthNm: number, spectralRadiance = 1): Xyz {
  const [xBar, yBar, zBar] = sampleMultiCurve1nm(CMF_1931_2DEG, wavelengthNm);
  return {
    X: spectralRadiance * (xBar ?? 0),
    Y: spectralRadiance * (yBar ?? 0),
    Z: spectralRadiance * (zBar ?? 0),
  };
}

/**
 * Approximate linear sRGB → XYZ (D65) for realtime RGB HDR proxy.
 * Label as approximated when used for broadband scene radiance.
 */
export function linearSrgbToXyzApprox(r: number, g: number, b: number): Xyz {
  return {
    X: 0.4124564 * r + 0.3575761 * g + 0.1804375 * b,
    Y: 0.2126729 * r + 0.7151522 * g + 0.072175 * b,
    Z: 0.0193339 * r + 0.119192 * g + 0.9503041 * b,
  };
}

/** XYZ → linear sRGB (D65), clamp negatives only. */
export function xyzToLinearSrgbApprox(xyz: Xyz): [number, number, number] {
  const r = 3.2404542 * xyz.X - 1.5371385 * xyz.Y - 0.4985314 * xyz.Z;
  const g = -0.969266 * xyz.X + 1.8760108 * xyz.Y + 0.041556 * xyz.Z;
  const b = 0.0556434 * xyz.X - 0.2040259 * xyz.Y + 1.0572252 * xyz.Z;
  return [r, g, b];
}
