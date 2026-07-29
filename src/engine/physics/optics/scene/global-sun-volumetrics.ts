/**
 * Screen-wide sun volumetrics (god-rays / air scatter) independent of MediaVolume AABBs.
 * Look presets = optical style; quality presets = march cost / fidelity (Low→Ultra).
 */
import { clampRange, clampUnit } from '../../../math/clamp';
import type { QualityLadder, QualityPresetSelection } from '../../../render/quality';
import { QUALITY_LADDER_ORDER, isQualityLadder } from '../../../render/quality';

/** Named optical looks (parameter packs). */
export type GlobalSunLookPresetId =
  | 'clearAir'
  | 'softHaze'
  | 'godRays'
  | 'denseMist'
  | 'custom';

export type GlobalSunQualityPreset = QualityPresetSelection;

/** Optical fields shared by look presets (not quality). */
export interface GlobalSunLookTune {
  intensity: number;
  density: number;
  scatter: number;
  absorption: number;
  mieG: number;
  mieWeight: number;
  shaftPower: number;
  hemiFill: number;
  multiScatter: number;
}

/** Cost / fidelity fields for the Low→Ultra ladder. */
export interface GlobalSunQualityTune {
  /** Max distance along the view ray (world units). */
  maxDistance: number;
  /**
   * Multiplier on Quality.stepSize for the global sun march.
   * Higher = cheaper / coarser; lower = finer shafts.
   */
  stepScale: number;
}

export interface GlobalSunVolumetrics extends GlobalSunLookTune, GlobalSunQualityTune {
  /** Master toggle — when off, only volume-bound env scatter runs. */
  enabled: boolean;
  lookPreset: GlobalSunLookPresetId;
  qualityPreset: GlobalSunQualityPreset;
}

export const GLOBAL_SUN_LOOK_PRESET_IDS: readonly Exclude<GlobalSunLookPresetId, 'custom'>[] = [
  'clearAir',
  'softHaze',
  'godRays',
  'denseMist',
];

const LOOK_TUNES: Record<Exclude<GlobalSunLookPresetId, 'custom'>, GlobalSunLookTune> = {
  /** Thin mountain air — subtle shafts, mostly Rayleigh. */
  clearAir: {
    intensity: 0.85,
    density: 0.01,
    scatter: 0.7,
    absorption: 0.03,
    mieG: 0.55,
    mieWeight: 0.45,
    shaftPower: 3,
    hemiFill: 0.45,
    multiScatter: 0.18,
  },
  /** Soft daytime haze — more fill, gentler cones. */
  softHaze: {
    intensity: 1,
    density: 0.018,
    scatter: 0.82,
    absorption: 0.06,
    mieG: 0.62,
    mieWeight: 0.65,
    shaftPower: 3.5,
    hemiFill: 0.5,
    multiScatter: 0.32,
  },
  /** Dramatic god-rays — tight forward Mie, strong intensity. */
  godRays: {
    intensity: 1.35,
    density: 0.022,
    scatter: 0.95,
    absorption: 0.05,
    mieG: 0.82,
    mieWeight: 0.88,
    shaftPower: 8,
    hemiFill: 0.22,
    multiScatter: 0.2,
  },
  /** Dense mist / foggy air — thick, soft, more absorption. */
  denseMist: {
    intensity: 1.1,
    density: 0.045,
    scatter: 0.9,
    absorption: 0.14,
    mieG: 0.58,
    mieWeight: 0.7,
    shaftPower: 2.5,
    hemiFill: 0.55,
    multiScatter: 0.48,
  },
};

const QUALITY_TUNES: Record<QualityLadder, GlobalSunQualityTune> = {
  low: { maxDistance: 48, stepScale: 2 },
  medium: { maxDistance: 96, stepScale: 1 },
  high: { maxDistance: 160, stepScale: 0.75 },
  ultra: { maxDistance: 256, stepScale: 0.5 },
};

export function isGlobalSunLookPresetId(v: unknown): v is GlobalSunLookPresetId {
  return (
    v === 'clearAir' ||
    v === 'softHaze' ||
    v === 'godRays' ||
    v === 'denseMist' ||
    v === 'custom'
  );
}

export function normalizeGlobalSunLookPreset(v: unknown): GlobalSunLookPresetId {
  return isGlobalSunLookPresetId(v) ? v : 'softHaze';
}

export function normalizeGlobalSunQualityPreset(v: unknown): GlobalSunQualityPreset {
  if (v === 'custom' || isQualityLadder(v)) return v;
  return 'medium';
}

export function globalSunLookTuneForPreset(
  preset: Exclude<GlobalSunLookPresetId, 'custom'>,
): GlobalSunLookTune {
  return { ...LOOK_TUNES[preset] };
}

export function globalSunQualityTuneForPreset(preset: QualityLadder): GlobalSunQualityTune {
  return { ...QUALITY_TUNES[preset] };
}

function near(a: number, b: number, eps = 1e-4): boolean {
  return Math.abs(a - b) <= eps;
}

export function matchGlobalSunLookPreset(look: GlobalSunLookTune): GlobalSunLookPresetId {
  for (const id of GLOBAL_SUN_LOOK_PRESET_IDS) {
    const t = LOOK_TUNES[id];
    if (
      near(look.intensity, t.intensity) &&
      near(look.density, t.density) &&
      near(look.scatter, t.scatter) &&
      near(look.absorption, t.absorption) &&
      near(look.mieG, t.mieG) &&
      near(look.mieWeight, t.mieWeight) &&
      near(look.shaftPower, t.shaftPower) &&
      near(look.hemiFill, t.hemiFill) &&
      near(look.multiScatter, t.multiScatter)
    ) {
      return id;
    }
  }
  return 'custom';
}

export function matchGlobalSunQualityPreset(q: GlobalSunQualityTune): GlobalSunQualityPreset {
  for (const id of QUALITY_LADDER_ORDER) {
    const t = QUALITY_TUNES[id];
    if (near(q.maxDistance, t.maxDistance, 0.5) && near(q.stepScale, t.stepScale)) {
      return id;
    }
  }
  return 'custom';
}

export function createDefaultGlobalSunVolumetrics(): GlobalSunVolumetrics {
  return normalizeGlobalSunVolumetrics({
    enabled: true,
    lookPreset: 'softHaze',
    qualityPreset: 'medium',
    ...LOOK_TUNES.softHaze,
    ...QUALITY_TUNES.medium,
  });
}

export function applyGlobalSunLookPreset(
  current: GlobalSunVolumetrics,
  preset: Exclude<GlobalSunLookPresetId, 'custom'>,
): GlobalSunVolumetrics {
  return normalizeGlobalSunVolumetrics({
    ...current,
    lookPreset: preset,
    ...globalSunLookTuneForPreset(preset),
  });
}

export function applyGlobalSunQualityPreset(
  current: GlobalSunVolumetrics,
  preset: QualityLadder,
): GlobalSunVolumetrics {
  return normalizeGlobalSunVolumetrics({
    ...current,
    qualityPreset: preset,
    ...globalSunQualityTuneForPreset(preset),
  });
}

/** Align quality ladder with overall graphics preset (preserves look). */
export function createGlobalSunVolumetricsForQuality(
  preset: QualityLadder,
  base?: GlobalSunVolumetrics,
): GlobalSunVolumetrics {
  const prev = base ?? createDefaultGlobalSunVolumetrics();
  return applyGlobalSunQualityPreset(prev, preset);
}

export function normalizeGlobalSunVolumetrics(
  raw: Partial<GlobalSunVolumetrics> | null | undefined,
): GlobalSunVolumetrics {
  const baseLook = LOOK_TUNES.softHaze;
  const baseQuality = QUALITY_TUNES.medium;
  if (!raw || typeof raw !== 'object') {
    return {
      enabled: true,
      lookPreset: 'softHaze',
      qualityPreset: 'medium',
      ...baseLook,
      ...baseQuality,
    };
  }

  const lookPresetRaw = normalizeGlobalSunLookPreset(raw.lookPreset);
  const qualityPresetRaw = normalizeGlobalSunQualityPreset(raw.qualityPreset);
  const lookFallback =
    lookPresetRaw === 'custom' ? baseLook : LOOK_TUNES[lookPresetRaw];
  const qualityFallback =
    qualityPresetRaw === 'custom' ? baseQuality : QUALITY_TUNES[qualityPresetRaw];

  const look: GlobalSunLookTune = {
    intensity: clampRange(
      typeof raw.intensity === 'number' ? raw.intensity : lookFallback.intensity,
      0,
      4,
      lookFallback.intensity,
    ),
    density: clampRange(
      typeof raw.density === 'number' ? raw.density : lookFallback.density,
      0,
      0.2,
      lookFallback.density,
    ),
    scatter: clampRange(
      typeof raw.scatter === 'number' ? raw.scatter : lookFallback.scatter,
      0,
      2,
      lookFallback.scatter,
    ),
    absorption: clampRange(
      typeof raw.absorption === 'number' ? raw.absorption : lookFallback.absorption,
      0,
      2,
      lookFallback.absorption,
    ),
    mieG: clampRange(
      typeof raw.mieG === 'number' ? raw.mieG : lookFallback.mieG,
      -0.95,
      0.95,
      lookFallback.mieG,
    ),
    mieWeight: clampUnit(
      typeof raw.mieWeight === 'number' ? raw.mieWeight : lookFallback.mieWeight,
      lookFallback.mieWeight,
    ),
    shaftPower: clampRange(
      typeof raw.shaftPower === 'number' ? raw.shaftPower : lookFallback.shaftPower,
      1,
      16,
      lookFallback.shaftPower,
    ),
    hemiFill: clampUnit(
      typeof raw.hemiFill === 'number' ? raw.hemiFill : lookFallback.hemiFill,
      lookFallback.hemiFill,
    ),
    multiScatter: clampUnit(
      typeof raw.multiScatter === 'number' ? raw.multiScatter : lookFallback.multiScatter,
      lookFallback.multiScatter,
    ),
  };

  const quality: GlobalSunQualityTune = {
    maxDistance: clampRange(
      typeof raw.maxDistance === 'number' ? raw.maxDistance : qualityFallback.maxDistance,
      8,
      512,
      qualityFallback.maxDistance,
    ),
    stepScale: clampRange(
      typeof raw.stepScale === 'number' ? raw.stepScale : qualityFallback.stepScale,
      0.25,
      4,
      qualityFallback.stepScale,
    ),
  };

  return {
    enabled: typeof raw.enabled === 'boolean' ? raw.enabled : true,
    lookPreset: matchGlobalSunLookPreset(look),
    qualityPreset: matchGlobalSunQualityPreset(quality),
    ...look,
    ...quality,
  };
}
