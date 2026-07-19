/** Light emission mode parameters (domain types — no science readout dependency). */

import { clampM2, m2FromParallelness } from './laser';

export type LightMode = 'omni_lamp' | 'spotlight' | 'parallel' | 'laser';

export interface OmniParams {
  softRadiusM: number;
  falloff: number;
}

export interface SpotParams {
  innerConeDeg: number;
  outerConeDeg: number;
  apertureSharpness: number;
}

export interface ParallelParams {
  beamRadiusM: number;
  residualMrad: number;
}

/**
 * Plausible laser / diode beam parameters.
 * M² ≥ 1 (TEM00 ideal). Elliptic diodes use ellipticRatio = wy/wx.
 */
export interface LaserParams {
  w0M: number;
  /** Beam quality factor M² (≥1). Diffraction-limited TEM00 = 1. */
  m2: number;
  /** Optional probe distance for w(z) readout (m). */
  probeDistanceM: number;
  /** Ellipticity wy/wx (1 = circular). Diode lasers often 1.5–3. */
  ellipticRatio: number;
  /**
   * Waist offset along the beam axis (m). Positive = focus downstream of emitter.
   */
  waistOffsetM: number;
  /** Multimode mix toward top-hat (0 = pure Gaussian, 1 = flat-top). */
  topHatMix: number;
  /** Spherical aberration blur amount 0–1. */
  sphericalAberration: number;
  /** Coma offset amount 0–1. */
  coma: number;
  /** Astigmatism 0–1: splits x/y waist planes. */
  astigmatism: number;
}

export type ModeParams =
  | { mode: 'omni_lamp'; omni: OmniParams }
  | { mode: 'spotlight'; spot: SpotParams }
  | { mode: 'parallel'; parallel: ParallelParams }
  | { mode: 'laser'; laser: LaserParams };

export function defaultLaserParams(): LaserParams {
  return {
    w0M: 0.01,
    m2: 1.45,
    probeDistanceM: 5,
    ellipticRatio: 1,
    waistOffsetM: 0,
    topHatMix: 0,
    sphericalAberration: 0,
    coma: 0,
    astigmatism: 0,
  };
}

function clamp01(v: number, fallback = 0): number {
  if (!Number.isFinite(v)) return fallback;
  return Math.min(1, Math.max(0, v));
}

function clampPositive(v: number, fallback: number, min = 0): number {
  if (!Number.isFinite(v)) return fallback;
  return Math.max(min, v);
}

/** Normalize laser params; migrates legacy `parallelness` → `m2`. */
export function normalizeLaserParams(
  raw: Partial<LaserParams> & { parallelness?: number } | null | undefined,
): LaserParams {
  const d = defaultLaserParams();
  if (!raw || typeof raw !== 'object') return d;

  let m2 = d.m2;
  if (typeof raw.m2 === 'number' && Number.isFinite(raw.m2)) {
    m2 = clampM2(raw.m2);
  } else if (typeof raw.parallelness === 'number') {
    m2 = m2FromParallelness(raw.parallelness);
  }

  return {
    w0M: clampPositive(typeof raw.w0M === 'number' ? raw.w0M : d.w0M, d.w0M, 1e-4),
    m2,
    probeDistanceM: clampPositive(
      typeof raw.probeDistanceM === 'number' ? raw.probeDistanceM : d.probeDistanceM,
      d.probeDistanceM,
      0.01,
    ),
    ellipticRatio: Math.min(
      8,
      clampPositive(
        typeof raw.ellipticRatio === 'number' ? raw.ellipticRatio : d.ellipticRatio,
        d.ellipticRatio,
        0.2,
      ),
    ),
    waistOffsetM:
      typeof raw.waistOffsetM === 'number' && Number.isFinite(raw.waistOffsetM)
        ? Math.min(50, Math.max(-50, raw.waistOffsetM))
        : d.waistOffsetM,
    topHatMix: clamp01(typeof raw.topHatMix === 'number' ? raw.topHatMix : d.topHatMix),
    sphericalAberration: clamp01(
      typeof raw.sphericalAberration === 'number' ? raw.sphericalAberration : d.sphericalAberration,
    ),
    coma: clamp01(typeof raw.coma === 'number' ? raw.coma : d.coma),
    astigmatism: clamp01(typeof raw.astigmatism === 'number' ? raw.astigmatism : d.astigmatism),
  };
}
