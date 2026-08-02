/**
 * CIE 1931 dominant / complementary wavelength.
 *
 * Color → Wavelength (Colors on the Web / `temp/colorUtils-wavelength.js`):
 *   1. Convert selected sRGB to CIE xy chromaticity (D65 white).
 *   2. Cast a ray from D65 through that xy; where it meets the spectral locus
 *      (curve of pure single wavelengths) is the **dominant wavelength**.
 *   3. **Spectral purity** = how far the colour sits along that ray
 *      (0% near white → 100% at the locus, or on the line of purples).
 *
 * These values describe chromaticity, not physical composition: a dominant
 * wavelength is the closest matching pure hue, not a claim that the colour is
 * monochromatic light.
 *
 * Purples/magentas lie on the far side of white from the spectral locus (the
 * **line of purples**). They have no direct locus position; we report a
 * **complementary** wavelength — the pure hue opposite white that, mixed with
 * white, yields the picked colour — and measure purity toward the purple line.
 */

import { clamp01 } from '../../../math/clamp';
import { srgbToLinearChannel, type Rgb01 } from './color';

/** CIE 1931 2° spectral locus (published table, 10 nm steps, 380–700 nm). */
const LOCUS_TABLE: ReadonlyArray<readonly [number, number, number]> = [
  [380, 0.1741, 0.005],
  [390, 0.1738, 0.0049],
  [400, 0.1733, 0.0048],
  [410, 0.1726, 0.0048],
  [420, 0.1714, 0.0051],
  [430, 0.1689, 0.0069],
  [440, 0.1644, 0.0109],
  [450, 0.1566, 0.0177],
  [460, 0.144, 0.0297],
  [470, 0.1241, 0.0578],
  [480, 0.0913, 0.1327],
  [490, 0.0454, 0.295],
  [500, 0.0082, 0.5384],
  [510, 0.0139, 0.7502],
  [520, 0.0743, 0.8338],
  [530, 0.1547, 0.8059],
  [540, 0.2296, 0.7543],
  [550, 0.3016, 0.6923],
  [560, 0.3731, 0.6245],
  [570, 0.4441, 0.5547],
  [580, 0.5125, 0.4866],
  [590, 0.5752, 0.4242],
  [600, 0.627, 0.3725],
  [610, 0.6658, 0.334],
  [620, 0.6915, 0.3083],
  [630, 0.7079, 0.292],
  [640, 0.719, 0.2809],
  [650, 0.726, 0.274],
  [660, 0.73, 0.27],
  [670, 0.732, 0.268],
  [680, 0.7334, 0.2666],
  [690, 0.7344, 0.2656],
  [700, 0.7347, 0.2653],
];

type LocusPt = { nm: number; x: number; y: number };

const SPECTRAL_LOCUS: LocusPt[] = (() => {
  const pts: LocusPt[] = [];
  for (let i = 0; i < LOCUS_TABLE.length - 1; i++) {
    const [nm0, x0, y0] = LOCUS_TABLE[i]!;
    const [nm1, x1, y1] = LOCUS_TABLE[i + 1]!;
    for (let nm = nm0; nm < nm1; nm++) {
      const t = (nm - nm0) / (nm1 - nm0);
      pts.push({ nm, x: x0 + t * (x1 - x0), y: y0 + t * (y1 - y0) });
    }
  }
  const last = LOCUS_TABLE[LOCUS_TABLE.length - 1]!;
  pts.push({ nm: last[0], x: last[1], y: last[2] });
  return pts;
})();

/** CIE D65 white point (xy). */
export const CIE_D65_WHITE = { x: 0.31272, y: 0.32903 } as const;

const VIOLET_END = SPECTRAL_LOCUS[0]!;
const RED_END = SPECTRAL_LOCUS[SPECTRAL_LOCUS.length - 1]!;

function xyFromXYZ(X: number, Y: number, Z: number): { x: number; y: number } {
  const sum = X + Y + Z;
  if (sum === 0) return { x: 0, y: 0 };
  return { x: X / sum, y: Y / sum };
}

/**
 * sRGB (display-referred [0,1]) → CIE xy chromaticity via linear sRGB → XYZ (D65).
 */
export function rgb01ToXy(rgb: Rgb01): { x: number; y: number } {
  const R = srgbToLinearChannel(clamp01(rgb[0]));
  const G = srgbToLinearChannel(clamp01(rgb[1]));
  const B = srgbToLinearChannel(clamp01(rgb[2]));
  // sRGB (linear) → XYZ, D65 (IEC 61966-2-1 / Bradford-free standard matrix)
  const X = 0.4124564 * R + 0.3575761 * G + 0.1804375 * B;
  const Y = 0.2126729 * R + 0.7151522 * G + 0.072175 * B;
  const Z = 0.0193339 * R + 0.119192 * G + 0.9503041 * B;
  return xyFromXYZ(X, Y, Z);
}

function angleFromWhite(x: number, y: number): number {
  return Math.atan2(y - CIE_D65_WHITE.y, x - CIE_D65_WHITE.x);
}

type Unwrapped = { pt: LocusPt; a: number };

const UNWRAPPED_LOCUS: Unwrapped[] = (() => {
  const out: Unwrapped[] = [];
  let prevRaw: number | null = null;
  let acc = 0;
  for (const pt of SPECTRAL_LOCUS) {
    const raw = angleFromWhite(pt.x, pt.y);
    if (prevRaw === null) {
      acc = raw;
    } else {
      let delta = raw - prevRaw;
      while (delta > Math.PI) delta -= 2 * Math.PI;
      while (delta < -Math.PI) delta += 2 * Math.PI;
      acc += delta;
    }
    out.push({ pt, a: acc });
    prevRaw = raw;
  }
  return out;
})();

const UNWRAP_MIN = Math.min(UNWRAPPED_LOCUS[0]!.a, UNWRAPPED_LOCUS[UNWRAPPED_LOCUS.length - 1]!.a);
const UNWRAP_MAX = Math.max(UNWRAPPED_LOCUS[0]!.a, UNWRAPPED_LOCUS[UNWRAPPED_LOCUS.length - 1]!.a);

function findLocusMatch(targetAngle: number): LocusPt | null {
  let target: number | null = null;
  for (let k = -2; k <= 2; k++) {
    const candidate = targetAngle + k * 2 * Math.PI;
    if (candidate >= UNWRAP_MIN && candidate <= UNWRAP_MAX) {
      target = candidate;
      break;
    }
  }
  if (target === null) return null;

  for (let i = 1; i < UNWRAPPED_LOCUS.length; i++) {
    const prev = UNWRAPPED_LOCUS[i - 1]!;
    const curr = UNWRAPPED_LOCUS[i]!;
    const lo = Math.min(prev.a, curr.a);
    const hi = Math.max(prev.a, curr.a);
    if (target >= lo && target <= hi && hi !== lo) {
      const t = (target - prev.a) / (curr.a - prev.a);
      return {
        nm: prev.pt.nm + t * (curr.pt.nm - prev.pt.nm),
        x: prev.pt.x + t * (curr.pt.x - prev.pt.x),
        y: prev.pt.y + t * (curr.pt.y - prev.pt.y),
      };
    }
  }
  return null;
}

/**
 * Distance from D65 along unit direction `ux,uy` to the line of purples
 * (chord joining the 380 nm and 700 nm locus ends). Returns null if no hit.
 */
function distanceToPurpleLine(ux: number, uy: number): number | null {
  const ox = CIE_D65_WHITE.x;
  const oy = CIE_D65_WHITE.y;
  const ax = VIOLET_END.x;
  const ay = VIOLET_END.y;
  const ex = RED_END.x - ax;
  const ey = RED_END.y - ay;
  // ox + s*ux = ax + u*ex ; oy + s*uy = ay + u*ey
  const det = ux * ey - uy * ex;
  if (Math.abs(det) < 1e-14) return null;
  const fx = ax - ox;
  const fy = ay - oy;
  const s = (fx * ey - fy * ex) / det;
  const u = (fx * uy - fy * ux) / det;
  if (s <= 1e-9 || u < -1e-6 || u > 1 + 1e-6) return null;
  return s;
}

export type DominantWavelengthKind = 'dominant' | 'complementary' | 'achromatic';

export interface DominantWavelengthResult {
  type: DominantWavelengthKind;
  /** nm, one decimal — null when achromatic */
  wavelengthNm: number | null;
  /**
   * Spectral (excitation) purity 0–100: fraction of the way from D65 along the
   * hue ray toward the spectral locus (dominant) or line of purples (complementary).
   */
  purity: number | null;
}

/**
 * Dominant (or complementary) wavelength for an sRGB colour in [0, 1].
 * Same algorithm family as `ColorUtils.hexToDominantWavelength`.
 */
export function rgbToDominantWavelength(rgb: Rgb01): DominantWavelengthResult {
  const colorXy = rgb01ToXy(rgb);
  const dx = colorXy.x - CIE_D65_WHITE.x;
  const dy = colorXy.y - CIE_D65_WHITE.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  // Effectively gray/white — no meaningful hue direction.
  if (dist < 0.002) {
    return { type: 'achromatic', wavelengthNm: null, purity: 0 };
  }

  const angle = Math.atan2(dy, dx);
  let match = findLocusMatch(angle);
  let type: DominantWavelengthKind = 'dominant';

  if (!match) {
    // Line-of-purples gap — report complementary λ on the opposite ray.
    match = findLocusMatch(angle + Math.PI);
    type = 'complementary';
  }

  if (!match) {
    return { type: 'achromatic', wavelengthNm: null, purity: 0 };
  }

  const ux = dx / dist;
  const uy = dy / dist;
  let rayEndDist: number;
  if (type === 'complementary') {
    // Purity toward the purple-line boundary (not the opposite spectral point).
    rayEndDist = distanceToPurpleLine(ux, uy) ?? Math.sqrt(
      (match.x - CIE_D65_WHITE.x) ** 2 + (match.y - CIE_D65_WHITE.y) ** 2,
    );
  } else {
    rayEndDist = Math.sqrt(
      (match.x - CIE_D65_WHITE.x) ** 2 + (match.y - CIE_D65_WHITE.y) ** 2,
    );
  }

  const purity = Math.max(0, Math.min(100, (dist / Math.max(rayEndDist, 1e-12)) * 100));

  return {
    type,
    wavelengthNm: Math.round(match.nm * 10) / 10,
    purity: Math.round(purity * 10) / 10,
  };
}

/** Hex (`#rgb` / `#rrggbb`) → dominant wavelength (API parity with ColorUtils). */
export function hexToDominantWavelength(hex: string): DominantWavelengthResult {
  const raw = hex.trim().replace(/^#/, '');
  let full = raw;
  if (raw.length === 3) {
    full = raw
      .split('')
      .map((ch) => ch + ch)
      .join('');
  }
  if (!/^[0-9a-fA-F]{6}$/.test(full)) {
    return { type: 'achromatic', wavelengthNm: null, purity: 0 };
  }
  return rgbToDominantWavelength([
    parseInt(full.slice(0, 2), 16) / 255,
    parseInt(full.slice(2, 4), 16) / 255,
    parseInt(full.slice(4, 6), 16) / 255,
  ]);
}
