/**
 * Editable power → display HDR response curve.
 *
 * X: log optical power 1 mW … 500 kW (same map as the power slider).
 * Y: linear HDR intensity 0 … HDR_CEILING (before volumetric ACES).
 *
 * Evaluation input is luminous product P(mW)·V_mix(λ); at V=1 this equals
 * power in mW, so t = sliderTFromPowerW(luminous/1000).
 *
 * Default = scientific (CIE V(λ)-weighted luminous product + Stevens γ≈0.7),
 * matching Laser Beam and Dot Relative Brightness Comparison — not a theatrical
 * “lightsaber” exaggeration.
 */
import { POWER_W_MAX, clampPowerW, powerWFromSliderT, sliderTFromPowerW } from './power';

/** Soft HDR ceiling for GPU / ACES headroom. */
export const DISPLAY_RESPONSE_HDR_MAX = 96;

/**
 * HDR scale at luminous ref (1 W @ V≈1) for the scientific default curve.
 * Absolute display units; ACES + fog still shape the final look.
 */
export const DISPLAY_SCIENCE_HDR_AT_REF = 16;

/**
 * Stevens-like exponent on luminous ratio (research / display literature ≈ 0.7).
 * Applied to P·V_mix — preserves wavelength ordering from CIE V(λ).
 */
export const DISPLAY_SCIENCE_POWER_GAMMA = 0.7;

/** Luminous product ref: 1 W at V=1 → 1000 mW·V. */
export const DISPLAY_SCIENCE_LUMINOUS_REF = 1000;

/** @deprecated Theatrical lightsaber HDR at 1 W — kept for older imports. */
export const DISPLAY_RESPONSE_SABER_HDR = 48;

export interface DisplayResponsePoint {
  /** Log-power parameter in [0, 1] (see sliderTFromPowerW). */
  t: number;
  /** Display HDR intensity in [0, DISPLAY_RESPONSE_HDR_MAX]. */
  hdr: number;
}

export interface DisplayResponseCurve {
  points: DisplayResponsePoint[];
}

export const DISPLAY_RESPONSE_POINT_MIN = 2;
export const DISPLAY_RESPONSE_POINT_MAX = 12;

/** Powers (W) used to seed the default scientific curve. */
const DEFAULT_SAMPLE_POWERS_W = [
  0.001, 0.005, 0.05, 0.1, 1, 1_000, 100_000, 500_000,
] as const;

/**
 * Scientific display map: HDR ∝ (P·V / ref)^γ with soft GPU ceiling.
 * Same luminous product as relative dot brightness; γ≈0.7 for perceived growth.
 */
export function scientificDisplayLuminousToneMap(luminousProduct: number): number {
  const x = Math.max(0, luminousProduct) / DISPLAY_SCIENCE_LUMINOUS_REF;
  const raw = DISPLAY_SCIENCE_HDR_AT_REF * Math.pow(x, DISPLAY_SCIENCE_POWER_GAMMA);
  const c = DISPLAY_RESPONSE_HDR_MAX;
  // Soft asymptote → ceiling (multi-kW still climbs; no hard plateau at 1 W).
  return c * (1 - Math.exp(-raw / Math.max(1e-9, c)));
}

/** @deprecated Use scientificDisplayLuminousToneMap — alias for callers. */
export function analyticDisplayLuminousToneMap(luminousProduct: number): number {
  return scientificDisplayLuminousToneMap(luminousProduct);
}

export function clampHdr(hdr: number): number {
  if (!Number.isFinite(hdr)) return 0;
  return Math.min(DISPLAY_RESPONSE_HDR_MAX, Math.max(0, hdr));
}

export function clampCurveT(t: number): number {
  if (!Number.isFinite(t)) return 0;
  return Math.min(1, Math.max(0, t));
}

/** Normalize / sort / clamp control points. */
export function normalizeDisplayResponseCurve(
  curve: DisplayResponseCurve | Partial<DisplayResponseCurve> | null | undefined,
): DisplayResponseCurve {
  const raw = Array.isArray(curve?.points) ? curve!.points : [];
  const cleaned = raw
    .map((p) => ({
      t: clampCurveT(typeof p?.t === 'number' ? p.t : 0),
      hdr: clampHdr(typeof p?.hdr === 'number' ? p.hdr : 0),
    }))
    .sort((a, b) => a.t - b.t);

  for (let i = 1; i < cleaned.length; i++) {
    if (cleaned[i].t <= cleaned[i - 1].t) {
      cleaned[i].t = Math.min(1, cleaned[i - 1].t + 1e-4);
    }
  }

  if (cleaned.length < DISPLAY_RESPONSE_POINT_MIN) {
    return createDefaultDisplayResponseCurve();
  }

  if (cleaned.length > DISPLAY_RESPONSE_POINT_MAX) {
    const out: DisplayResponsePoint[] = [cleaned[0]];
    const mid = DISPLAY_RESPONSE_POINT_MAX - 2;
    for (let i = 1; i <= mid; i++) {
      const idx = Math.round((i * (cleaned.length - 1)) / (mid + 1));
      out.push(cleaned[idx]);
    }
    out.push(cleaned[cleaned.length - 1]);
    return normalizeDisplayResponseCurve({ points: out });
  }

  return { points: cleaned };
}

/**
 * Default = current scientific model (CIE V-weighted luminous + γ=0.7).
 * “Alapgörbe” / reset restores this — not the theatrical lightsaber curve.
 */
export function createDefaultDisplayResponseCurve(): DisplayResponseCurve {
  const points: DisplayResponsePoint[] = DEFAULT_SAMPLE_POWERS_W.map((powerW) => {
    const luminous = Math.max(0, powerW) * 1000; // V=1
    return {
      t: sliderTFromPowerW(powerW),
      hdr: scientificDisplayLuminousToneMap(luminous),
    };
  });
  return { points };
}

/**
 * Evaluate HDR from luminous product using piecewise-linear interpolation in log-t.
 */
export function evaluateDisplayResponse(
  luminousProduct: number,
  curve: DisplayResponseCurve,
): number {
  const pts = normalizeDisplayResponseCurve(curve).points;
  if (pts.length === 0) return 0;

  const powerW = clampPowerW(Math.max(0, luminousProduct) / 1000);
  const t = sliderTFromPowerW(Math.max(0.001, powerW));

  if (t <= pts[0].t) {
    if (pts[0].t <= 1e-9) return pts[0].hdr;
    return clampHdr(pts[0].hdr * (t / Math.max(pts[0].t, 1e-12)));
  }
  const last = pts[pts.length - 1];
  if (t >= last.t) return last.hdr;

  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    if (t >= a.t && t <= b.t) {
      const span = b.t - a.t;
      const u = span > 1e-12 ? (t - a.t) / span : 0;
      return clampHdr(a.hdr + (b.hdr - a.hdr) * u);
    }
  }
  return last.hdr;
}

/** Label helper for UI ticks (W at a log-t). */
export function powerWAtCurveT(t: number): number {
  return powerWFromSliderT(clampCurveT(t));
}

export function curveTAtPowerW(powerW: number): number {
  return sliderTFromPowerW(clampPowerW(powerW));
}

export { POWER_W_MAX };
