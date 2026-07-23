/** Light emission mode parameters (domain types — no science readout dependency). */

import { clampM2, m2FromParallelness } from './laser';

/**
 * Emitter kinds:
 * - omni_lamp / point — isotropic soft lamp
 * - spotlight / flashlight — cone (flashlight = softer, wider defaults)
 * - parallel / directional — finite tube / collimated beam
 * - sun — unique scene key light (directional; drives env sun + Babylon DirectionalLight)
 * - laser — Gaussian TEM₀₀
 */
export type LightMode =
  | 'omni_lamp'
  | 'spotlight'
  | 'flashlight'
  | 'parallel'
  | 'sun'
  | 'laser';

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

/** Sun key light — direction from entity −Z; angular size for soft rim (educational). */
export interface SunParams {
  /** Apparent angular diameter (deg). Softens the directional lobe slightly. */
  angularDiameterDeg: number;
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
  | { mode: 'flashlight'; spot: SpotParams }
  | { mode: 'parallel'; parallel: ParallelParams }
  | { mode: 'sun'; sun: SunParams }
  | { mode: 'laser'; laser: LaserParams };

export const ALL_LIGHT_MODES: readonly LightMode[] = [
  'laser',
  'flashlight',
  'spotlight',
  'omni_lamp',
  'parallel',
  'sun',
] as const;

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

export function defaultSpotParams(): SpotParams {
  return { innerConeDeg: 8, outerConeDeg: 18, apertureSharpness: 4 };
}

/** Flashlight ≈ soft / wider spot (or “diffuse laser” cone). */
export function defaultFlashlightParams(): SpotParams {
  return { innerConeDeg: 12, outerConeDeg: 40, apertureSharpness: 2 };
}

export function defaultParallelParams(): ParallelParams {
  return { beamRadiusM: 0.04, residualMrad: 1 };
}

export function defaultOmniParams(): OmniParams {
  return { softRadiusM: 0.35, falloff: 2 };
}

export function defaultSunParams(): SunParams {
  return { angularDiameterDeg: 0.53 };
}

export function isSunMode(mode: LightMode): boolean {
  return mode === 'sun';
}

function clamp01(v: number, fallback = 0): number {
  if (!Number.isFinite(v)) return fallback;
  return Math.min(1, Math.max(0, v));
}

function clampPositive(v: number, fallback: number, min = 0): number {
  if (!Number.isFinite(v)) return fallback;
  return Math.max(min, v);
}

function normalizeSpotParams(raw: Partial<SpotParams> | null | undefined, d: SpotParams): SpotParams {
  if (!raw || typeof raw !== 'object') return d;
  const inner = clampPositive(
    typeof raw.innerConeDeg === 'number' ? raw.innerConeDeg : d.innerConeDeg,
    d.innerConeDeg,
    0.5,
  );
  const outer = Math.max(
    inner + 0.5,
    clampPositive(
      typeof raw.outerConeDeg === 'number' ? raw.outerConeDeg : d.outerConeDeg,
      d.outerConeDeg,
      1,
    ),
  );
  return {
    innerConeDeg: Math.min(80, inner),
    outerConeDeg: Math.min(90, outer),
    apertureSharpness: clampPositive(
      typeof raw.apertureSharpness === 'number' ? raw.apertureSharpness : d.apertureSharpness,
      d.apertureSharpness,
      0.5,
    ),
  };
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
    w0M: Math.min(
      0.05,
      clampPositive(typeof raw.w0M === 'number' ? raw.w0M : d.w0M, d.w0M, 1e-4),
    ),
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

export function normalizeSunParams(raw: Partial<SunParams> | null | undefined): SunParams {
  const d = defaultSunParams();
  if (!raw || typeof raw !== 'object') return d;
  return {
    angularDiameterDeg: Math.min(
      5,
      clampPositive(
        typeof raw.angularDiameterDeg === 'number' ? raw.angularDiameterDeg : d.angularDiameterDeg,
        d.angularDiameterDeg,
        0.05,
      ),
    ),
  };
}

/** Build default ModeParams for a light kind. */
export function defaultModeParams(mode: LightMode): ModeParams {
  switch (mode) {
    case 'omni_lamp':
      return { mode: 'omni_lamp', omni: defaultOmniParams() };
    case 'spotlight':
      return { mode: 'spotlight', spot: defaultSpotParams() };
    case 'flashlight':
      return { mode: 'flashlight', spot: defaultFlashlightParams() };
    case 'parallel':
      return { mode: 'parallel', parallel: defaultParallelParams() };
    case 'sun':
      return { mode: 'sun', sun: defaultSunParams() };
    case 'laser':
    default:
      return { mode: 'laser', laser: defaultLaserParams() };
  }
}

export function normalizeModeParamsPublic(
  raw: ModeParams | (Partial<ModeParams> & { mode?: string }) | undefined,
  fallback: ModeParams,
): ModeParams {
  if (!raw || typeof raw !== 'object' || !('mode' in raw) || !raw.mode) return fallback;
  const mode = raw.mode as LightMode;
  switch (mode) {
    case 'laser':
      return {
        mode: 'laser',
        laser: normalizeLaserParams(
          (raw as { laser?: Parameters<typeof normalizeLaserParams>[0] }).laser,
        ),
      };
    case 'spotlight':
      return {
        mode: 'spotlight',
        spot: normalizeSpotParams(
          (raw as { spot?: Partial<SpotParams> }).spot,
          defaultSpotParams(),
        ),
      };
    case 'flashlight':
      return {
        mode: 'flashlight',
        spot: normalizeSpotParams(
          (raw as { spot?: Partial<SpotParams> }).spot,
          defaultFlashlightParams(),
        ),
      };
    case 'omni_lamp': {
      const o = (raw as { omni?: Partial<OmniParams> }).omni;
      const d = defaultOmniParams();
      return {
        mode: 'omni_lamp',
        omni: {
          softRadiusM: clampPositive(
            typeof o?.softRadiusM === 'number' ? o.softRadiusM : d.softRadiusM,
            d.softRadiusM,
            0.01,
          ),
          falloff: clampPositive(
            typeof o?.falloff === 'number' ? o.falloff : d.falloff,
            d.falloff,
            0.5,
          ),
        },
      };
    }
    case 'parallel': {
      const p = (raw as { parallel?: Partial<ParallelParams> }).parallel;
      const d = defaultParallelParams();
      return {
        mode: 'parallel',
        parallel: {
          beamRadiusM: clampPositive(
            typeof p?.beamRadiusM === 'number' ? p.beamRadiusM : d.beamRadiusM,
            d.beamRadiusM,
            0.001,
          ),
          residualMrad: clampPositive(
            typeof p?.residualMrad === 'number' ? p.residualMrad : d.residualMrad,
            d.residualMrad,
            0,
          ),
        },
      };
    }
    case 'sun':
      return {
        mode: 'sun',
        sun: normalizeSunParams((raw as { sun?: Partial<SunParams> }).sun),
      };
    default:
      return fallback;
  }
}
