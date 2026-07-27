import { clampRange } from '../math/clamp';
import {
  isFluidGridRes,
  type FluidGridRes,
} from '../physics/fluid/presets';
import {
  defaultLensFlareLightsTune,
  defaultLensFlareSunTune,
  normalizeLensFlareGroupTune,
  type LensFlareGroupTune,
} from './lens-flare';

/**
 * Graphics-settings ladder (modern game Options UI).
 * Per-section + overall; overall becomes {@link QualityPresetSelection} `'custom'`
 * when any section diverges.
 */
export type QualityLadder = 'low' | 'medium' | 'high' | 'ultra';

/** Ladder or Custom when values no longer match a packed preset. */
export type QualityPresetSelection = QualityLadder | 'custom';

/** Light→Medium volumetric self-shadow quality (Camera→Medium T is always on). */
export type ShadowQuality = 'off' | 'low' | 'medium' | 'high';

/**
 * Output / display profile (Unity Camera.allowHDR + tonemapper headroom).
 * Working color space is always linear HDR (Unity Linear / Unreal working space).
 * This only changes the final compose stage:
 * - `hdr` — weaker tonemap; sky/IBL may write values >1 (physical sun)
 * - `sdr` — clamp sources + strong tonemap for LDR display
 * Display gamma ({@link Quality.outputGamma}) is applied after tonemap for both
 * (Babylon image processing is off — canvas is LDR).
 */
export type ColorProfile = 'hdr' | 'sdr';

/**
 * @deprecated Legacy Unity-style working-space toggle. Migrated to {@link Quality.outputGamma}.
 * Kept for old scene saves only. Working space is always linear.
 */
export type ColorSpaceMode = 'linear' | 'gamma';

/** Full-frame compose tonemap operator (Unity/Unreal tonemapper). */
export type TonemapMode = 'aces' | 'reinhard' | 'hable';

/** True when sky/IBL may emit >1 into the HDR scene buffer (follows display profile). */
export function skyAllowsHdrColors(profile: ColorProfile): boolean {
  return profile === 'hdr';
}

/** Fluid solver advection scheme (quality ladder). */
export type FluidAdvectionMode = 'semiLagrangian' | 'macCormack' | 'bfecc';

/** Vorticity confinement intensity (quality ladder). */
export type FluidVorticityMode = 'off' | 'medium' | 'high';

export interface Quality {
  /** Overall / global preset — `'custom'` if sections disagree. */
  overallPreset: QualityPresetSelection;
  volumetricsPreset: QualityPresetSelection;
  shadowPreset: QualityPresetSelection;
  presentationPreset: QualityPresetSelection;
  fluidsPreset: QualityPresetSelection;
  /**
   * @deprecated Alias of {@link overallPreset} for older saves / call sites.
   * Normalized to match overallPreset.
   */
  preset: QualityPresetSelection;
  stepSize: number;
  maxSteps: number;
  densityThreshold: number;
  transmittanceCut: number;
  /**
   * Light→Medium transmittance along light→sample.
   * off / local-σ·d / secondary AABB march (2–4) / secondary (6–8).
   */
  shadowQuality: ShadowQuality;
  renderScale: number;
  /** Post-process FXAA (+ pipeline MSAA when on). Default true. */
  antiAliasing: boolean;
  /**
   * Theatrical GlowLayer / bloom (presentation only — not part of the physics path).
   * Default false for physically plausible baseline.
   */
  theatricalGlow: boolean;
  /**
   * Screen-space lens flare (camera optical model on HDR compose, pre-tonemap).
   * Per-light opt-in via LightEmitter.lensFlareEnabled. Default true on Medium+.
   */
  lensFlare: boolean;
  /**
   * Look params for scene lights (laser / lamp / spot / omni). Project-level —
   * not part of the Low→Ultra presentation ladder.
   */
  lensFlareLights: LensFlareGroupTune;
  /**
   * Look params for the sun / sky key light. Project-level —
   * not part of the Low→Ultra presentation ladder.
   */
  lensFlareSun: LensFlareGroupTune;
  /** Full-frame compose tonemap (project-level presentation). Default `'aces'`. */
  tonemapMode: TonemapMode;
  /**
   * HDR vs SDR color profile (project-level; not part of Low→Ultra ladder).
   * Default {@link ColorProfile} `'hdr'`.
   */
  colorProfile: ColorProfile;
  /**
   * Display gamma applied after tonemap (2.2 / 2.4 / custom). Default `2.2`.
   * Needed because Babylon image processing is disabled (LDR canvas encode).
   */
  outputGamma: number;
  /** Fluid NS grid resolution per axis (32|48|64|96). */
  fluidGridRes: FluidGridRes;
  fluidJacobiIterations: number;
  fluidAdvectionMode: FluidAdvectionMode;
  fluidVorticityMode: FluidVorticityMode;
  /** Smoke solver dissipation target from Fluids ladder. */
  fluidDissipation: number;
  /** Water optics: Snell refraction in raymarch / surface PP. */
  fluidEnableRefraction: boolean;
  /** Water optics: max free-surface crossings (0–3). */
  fluidMaxSurfaceBounces: number;
  /** Water surface PP sample count. */
  fluidSurfaceSamples: number;
}

export interface QualityRenderScaleConfig {
  /** Lowest preset (Low) — default 0.25 = 25% */
  renderScaleMin: number;
  /** Highest preset (Ultra) — default 0.5 = 50% */
  renderScaleMax: number;
}

export const QUALITY_LADDER_ORDER: readonly QualityLadder[] = [
  'low',
  'medium',
  'high',
  'ultra',
];

export interface VolumetricsTune {
  stepSize: number;
  maxSteps: number;
  densityThreshold: number;
  transmittanceCut: number;
  renderScale: number;
}

export interface PresentationTune {
  antiAliasing: boolean;
  theatricalGlow: boolean;
  lensFlare: boolean;
  tonemapMode: TonemapMode;
}

/** Fluids (NS solver + water optics) packed presets — AAA Low→Ultra. */
export interface FluidsTune {
  fluidGridRes: FluidGridRes;
  fluidJacobiIterations: number;
  fluidAdvectionMode: FluidAdvectionMode;
  fluidVorticityMode: FluidVorticityMode;
  fluidDissipation: number;
  fluidEnableRefraction: boolean;
  fluidMaxSurfaceBounces: number;
  fluidSurfaceSamples: number;
}

let scaleConfig: QualityRenderScaleConfig = {
  renderScaleMin: 0.25,
  renderScaleMax: 0.5,
};

export function getQualityRenderScaleConfig(): Readonly<QualityRenderScaleConfig> {
  return scaleConfig;
}

export function configureQualityRenderScale(partial: Partial<QualityRenderScaleConfig>): void {
  const min = partial.renderScaleMin ?? scaleConfig.renderScaleMin;
  const max = partial.renderScaleMax ?? scaleConfig.renderScaleMax;
  scaleConfig = {
    renderScaleMin: clampRenderScale(Math.min(min, max)),
    renderScaleMax: clampRenderScale(Math.max(min, max)),
  };
}

export function renderScaleForPreset(preset: QualityLadder): number {
  const index = QUALITY_LADDER_ORDER.indexOf(preset);
  const t = index <= 0 ? 0 : index / (QUALITY_LADDER_ORDER.length - 1);
  const { renderScaleMin, renderScaleMax } = scaleConfig;
  return renderScaleMin + (renderScaleMax - renderScaleMin) * t;
}

export function clampRenderScale(v: number): number {
  return clampRange(v, 0.05, 1, 0.25);
}

/** Volumetrics (raymarch) packed presets — renderScale filled from global scale config. */
export function volumetricsTuneForPreset(preset: QualityLadder): VolumetricsTune {
  const base: Record<QualityLadder, Omit<VolumetricsTune, 'renderScale'>> = {
    low: {
      stepSize: 0.25,
      maxSteps: 64,
      densityThreshold: 0.01,
      transmittanceCut: 0.05,
    },
    medium: {
      stepSize: 0.15,
      maxSteps: 128,
      densityThreshold: 0.005,
      transmittanceCut: 0.02,
    },
    high: {
      stepSize: 0.1,
      maxSteps: 256,
      densityThreshold: 0.002,
      transmittanceCut: 0.01,
    },
    ultra: {
      stepSize: 0.06,
      maxSteps: 512,
      densityThreshold: 0.001,
      transmittanceCut: 0.005,
    },
  };
  return { ...base[preset], renderScale: renderScaleForPreset(preset) };
}

/** Shadow section ladder → ShadowQuality enum. */
export function shadowQualityForPreset(preset: QualityLadder): ShadowQuality {
  switch (preset) {
    case 'low':
      return 'off';
    case 'medium':
      return 'low';
    case 'high':
      return 'medium';
    case 'ultra':
      return 'high';
    default:
      return 'low';
  }
}

export function shadowPresetMatching(q: ShadowQuality): QualityPresetSelection {
  switch (q) {
    case 'off':
      return 'low';
    case 'low':
      return 'medium';
    case 'medium':
      return 'high';
    case 'high':
      return 'ultra';
    default:
      return 'custom';
  }
}

export function presentationTuneForPreset(preset: QualityLadder): PresentationTune {
  switch (preset) {
    case 'low':
      return { antiAliasing: false, theatricalGlow: false, lensFlare: false, tonemapMode: 'reinhard' };
    case 'medium':
      return { antiAliasing: true, theatricalGlow: false, lensFlare: true, tonemapMode: 'aces' };
    case 'high':
      return { antiAliasing: true, theatricalGlow: false, lensFlare: true, tonemapMode: 'aces' };
    case 'ultra':
      return { antiAliasing: true, theatricalGlow: true, lensFlare: true, tonemapMode: 'aces' };
    default:
      return { antiAliasing: true, theatricalGlow: false, lensFlare: true, tonemapMode: 'aces' };
  }
}

/**
 * Fluids AAA ladder (grid + Jacobi + advection + vorticity + smoke dissipation + water optics).
 * Refraction / bounces / surface samples apply to water only at consume sites.
 */
export function fluidsTuneForPreset(preset: QualityLadder): FluidsTune {
  const table: Record<QualityLadder, FluidsTune> = {
    low: {
      fluidGridRes: 32,
      fluidJacobiIterations: 12,
      fluidAdvectionMode: 'semiLagrangian',
      fluidVorticityMode: 'off',
      fluidDissipation: 0.03,
      fluidEnableRefraction: false,
      fluidMaxSurfaceBounces: 0,
      fluidSurfaceSamples: 1,
    },
    medium: {
      fluidGridRes: 48,
      fluidJacobiIterations: 18,
      fluidAdvectionMode: 'macCormack',
      fluidVorticityMode: 'medium',
      fluidDissipation: 0.015,
      fluidEnableRefraction: true,
      fluidMaxSurfaceBounces: 1,
      fluidSurfaceSamples: 2,
    },
    high: {
      fluidGridRes: 64,
      fluidJacobiIterations: 24,
      fluidAdvectionMode: 'bfecc',
      fluidVorticityMode: 'high',
      fluidDissipation: 0.008,
      fluidEnableRefraction: true,
      fluidMaxSurfaceBounces: 2,
      fluidSurfaceSamples: 4,
    },
    ultra: {
      fluidGridRes: 96,
      fluidJacobiIterations: 32,
      fluidAdvectionMode: 'bfecc',
      fluidVorticityMode: 'high',
      fluidDissipation: 0.003,
      fluidEnableRefraction: true,
      fluidMaxSurfaceBounces: 3,
      fluidSurfaceSamples: 6,
    },
  };
  return { ...table[preset] };
}

/** GLSL `uAdvectionMode`: 0 Semi, 1 MacCormack, 2 BFECC. */
export function fluidAdvectionModeIndex(mode: FluidAdvectionMode): number {
  switch (mode) {
    case 'semiLagrangian':
      return 0;
    case 'macCormack':
      return 1;
    case 'bfecc':
      return 2;
    default:
      return 1;
  }
}

/** Absolute vorticity strength for smoke when entity uses quality mode. */
export function fluidVorticityStrengthForMode(mode: FluidVorticityMode): number {
  switch (mode) {
    case 'off':
      return 0;
    case 'medium':
      return 1.8;
    case 'high':
      return 3.2;
    default:
      return 0;
  }
}

export function normalizeFluidAdvectionMode(
  v: unknown,
  fallback: FluidAdvectionMode = 'macCormack',
): FluidAdvectionMode {
  if (v === 'semiLagrangian' || v === 'macCormack' || v === 'bfecc') return v;
  return fallback;
}

export function normalizeFluidVorticityMode(
  v: unknown,
  fallback: FluidVorticityMode = 'medium',
): FluidVorticityMode {
  if (v === 'off' || v === 'medium' || v === 'high') return v;
  return fallback;
}

export function clampFluidMaxSurfaceBounces(v: number, fallback = 2): number {
  return Math.round(clampRange(v, 0, 3, fallback));
}

export function clampFluidSurfaceSamples(v: number, fallback = 2): number {
  return Math.round(clampRange(v, 1, 16, fallback));
}

export function clampFluidJacobiIterations(v: number, fallback = 18): number {
  return Math.round(clampRange(v, 4, 64, fallback));
}

export function normalizeFluidGridResQuality(
  v: unknown,
  fallback: FluidGridRes = 48,
): FluidGridRes {
  return isFluidGridRes(v) ? v : fallback;
}

/** GPU secondary-march step count for Light→Medium (shader hard-cap 8). */
export function shadowStepsForQuality(q: ShadowQuality): number {
  switch (q) {
    case 'off':
      return 0;
    case 'low':
      return 1;
    case 'medium':
      return 4;
    case 'high':
      return 8;
    default:
      return 1;
  }
}

/** Encode shadowQuality for the volumetric uniform (0=off … 3=high). */
export function shadowQualityIndex(q: ShadowQuality): number {
  switch (q) {
    case 'off':
      return 0;
    case 'low':
      return 1;
    case 'medium':
      return 2;
    case 'high':
      return 3;
    default:
      return 1;
  }
}

export function normalizeShadowQuality(v: unknown): ShadowQuality {
  if (v === 'off' || v === 'low' || v === 'medium' || v === 'high') return v;
  return 'low';
}

export function normalizeColorProfile(
  v: unknown,
  fallback: ColorProfile = 'hdr',
): ColorProfile {
  if (v === 'hdr' || v === 'sdr') return v;
  return fallback;
}

export function normalizeTonemapMode(
  v: unknown,
  fallback: TonemapMode = 'aces',
): TonemapMode {
  if (v === 'aces' || v === 'reinhard' || v === 'hable') return v;
  return fallback;
}

/** Clamp editable display gamma (1 = pass-through, typical 2.2 / 2.4). */
export function clampOutputGamma(v: number, fallback = 2.2): number {
  return clampRange(v, 1, 3, fallback);
}

/**
 * @deprecated Prefer {@link clampOutputGamma}. Maps legacy Linear/Gamma saves.
 * - `linear` → gamma 2.2 (encode on)
 * - `gamma` → gamma 1.0 (legacy pass-through)
 */
export function normalizeColorSpace(
  v: unknown,
  fallback: ColorSpaceMode = 'linear',
): ColorSpaceMode {
  if (v === 'linear' || v === 'gamma') return v;
  return fallback;
}

/** Resolve output gamma from new field or legacy `colorSpace`. */
export function resolveOutputGamma(
  raw: { outputGamma?: unknown; colorSpace?: unknown } | null | undefined,
  fallback = 2.2,
): number {
  if (typeof raw?.outputGamma === 'number' && Number.isFinite(raw.outputGamma)) {
    return clampOutputGamma(raw.outputGamma, fallback);
  }
  const legacy = normalizeColorSpace(raw?.colorSpace, 'linear');
  return legacy === 'gamma' ? 1 : fallback;
}

export function isQualityLadder(v: unknown): v is QualityLadder {
  return v === 'low' || v === 'medium' || v === 'high' || v === 'ultra';
}

export function normalizeQualityPresetSelection(
  v: unknown,
  fallback: QualityPresetSelection = 'medium',
): QualityPresetSelection {
  if (v === 'custom' || isQualityLadder(v)) return v;
  return fallback;
}

function near(a: number, b: number, eps = 1e-4): boolean {
  return Math.abs(a - b) <= eps;
}

export function matchVolumetricsPreset(q: {
  stepSize: number;
  maxSteps: number;
  densityThreshold: number;
  transmittanceCut: number;
  renderScale: number;
}): QualityPresetSelection {
  for (const id of QUALITY_LADDER_ORDER) {
    const t = volumetricsTuneForPreset(id);
    if (
      near(q.stepSize, t.stepSize) &&
      q.maxSteps === t.maxSteps &&
      near(q.densityThreshold, t.densityThreshold) &&
      near(q.transmittanceCut, t.transmittanceCut) &&
      near(q.renderScale, t.renderScale, 0.01)
    ) {
      return id;
    }
  }
  return 'custom';
}

export function matchPresentationPreset(q: PresentationTune): QualityPresetSelection {
  for (const id of QUALITY_LADDER_ORDER) {
    const t = presentationTuneForPreset(id);
    if (
      q.antiAliasing === t.antiAliasing &&
      q.theatricalGlow === t.theatricalGlow &&
      q.lensFlare === t.lensFlare &&
      q.tonemapMode === t.tonemapMode
    ) {
      return id;
    }
  }
  return 'custom';
}

export function matchFluidsPreset(q: FluidsTune): QualityPresetSelection {
  for (const id of QUALITY_LADDER_ORDER) {
    const t = fluidsTuneForPreset(id);
    if (
      q.fluidGridRes === t.fluidGridRes &&
      q.fluidJacobiIterations === t.fluidJacobiIterations &&
      q.fluidAdvectionMode === t.fluidAdvectionMode &&
      q.fluidVorticityMode === t.fluidVorticityMode &&
      near(q.fluidDissipation, t.fluidDissipation) &&
      q.fluidEnableRefraction === t.fluidEnableRefraction &&
      q.fluidMaxSurfaceBounces === t.fluidMaxSurfaceBounces &&
      q.fluidSurfaceSamples === t.fluidSurfaceSamples
    ) {
      return id;
    }
  }
  return 'custom';
}

/** Overall = shared ladder iff every section agrees; else custom. */
export function resolveOverallPreset(
  sections: readonly QualityPresetSelection[],
): QualityPresetSelection {
  if (sections.length === 0) return 'custom';
  if (sections.some((s) => s === 'custom')) return 'custom';
  const first = sections[0]!;
  return sections.every((s) => s === first) ? first : 'custom';
}

export function refreshQualityPresets(
  q: Quality,
  skyPreset?: QualityPresetSelection,
): Quality {
  const volumetricsPreset = matchVolumetricsPreset(q);
  const shadowPreset = shadowPresetMatching(q.shadowQuality);
  const presentationPreset = matchPresentationPreset(q);
  const fluidsPreset = matchFluidsPreset(q);
  const sections: QualityPresetSelection[] = [
    volumetricsPreset,
    shadowPreset,
    presentationPreset,
    fluidsPreset,
  ];
  if (skyPreset !== undefined) sections.push(skyPreset);
  const overallPreset = resolveOverallPreset(sections);
  return {
    ...q,
    volumetricsPreset,
    shadowPreset,
    presentationPreset,
    fluidsPreset,
    overallPreset,
    preset: overallPreset,
  };
}

/**
 * Build a full Quality packed from one ladder (all sections aligned).
 * Color profile / gamma are project-level — pass {@link preserve} to keep them
 * when switching Low→Ultra (Unity Quality Settings do not reset Color Space).
 */
export function createQuality(
  preset: QualityLadder = 'medium',
  preserve?: Pick<
    Partial<Quality>,
    'colorProfile' | 'outputGamma' | 'lensFlareLights' | 'lensFlareSun'
  >,
): Quality {
  const vol = volumetricsTuneForPreset(preset);
  const pres = presentationTuneForPreset(preset);
  const fluids = fluidsTuneForPreset(preset);
  return {
    overallPreset: preset,
    volumetricsPreset: preset,
    shadowPreset: preset,
    presentationPreset: preset,
    fluidsPreset: preset,
    preset,
    ...vol,
    shadowQuality: shadowQualityForPreset(preset),
    ...pres,
    ...fluids,
    colorProfile: normalizeColorProfile(preserve?.colorProfile, 'hdr'),
    outputGamma: clampOutputGamma(
      typeof preserve?.outputGamma === 'number' ? preserve.outputGamma : 2.2,
      2.2,
    ),
    lensFlareLights: normalizeLensFlareGroupTune(
      preserve?.lensFlareLights,
      defaultLensFlareLightsTune(),
    ),
    lensFlareSun: normalizeLensFlareGroupTune(
      preserve?.lensFlareSun,
      defaultLensFlareSunTune(),
    ),
  };
}

/** Apply only volumetrics ladder; recompute overall (sky optional). */
export function applyVolumetricsPreset(
  q: Quality,
  preset: QualityLadder,
  skyPreset?: QualityPresetSelection,
): Quality {
  const vol = volumetricsTuneForPreset(preset);
  return refreshQualityPresets(
    {
      ...q,
      ...vol,
      volumetricsPreset: preset,
    },
    skyPreset,
  );
}

export function applyShadowPreset(
  q: Quality,
  preset: QualityLadder,
  skyPreset?: QualityPresetSelection,
): Quality {
  return refreshQualityPresets(
    {
      ...q,
      shadowQuality: shadowQualityForPreset(preset),
      shadowPreset: preset,
    },
    skyPreset,
  );
}

export function applyPresentationPreset(
  q: Quality,
  preset: QualityLadder,
  skyPreset?: QualityPresetSelection,
): Quality {
  const pres = presentationTuneForPreset(preset);
  return refreshQualityPresets(
    {
      ...q,
      ...pres,
      presentationPreset: preset,
    },
    skyPreset,
  );
}

export function applyFluidsPreset(
  q: Quality,
  preset: QualityLadder,
  skyPreset?: QualityPresetSelection,
): Quality {
  const fluids = fluidsTuneForPreset(preset);
  return refreshQualityPresets(
    {
      ...q,
      ...fluids,
      fluidsPreset: preset,
    },
    skyPreset,
  );
}

/** Normalize partial / legacy Quality (old `preset`-only saves). */
export function normalizeQualityResource(
  raw: (Partial<Quality> & { preset?: QualityPresetSelection }) | null | undefined,
): Quality {
  const legacyLadder = isQualityLadder(raw?.preset) ? raw!.preset : undefined;
  const overallHint = normalizeQualityPresetSelection(
    raw?.overallPreset ?? raw?.preset,
    legacyLadder ?? 'medium',
  );
  const baseLadder: QualityLadder =
    overallHint === 'custom' ? (legacyLadder ?? 'medium') : overallHint;
  const base = createQuality(baseLadder);

  const merged: Quality = {
    ...base,
    ...raw,
    stepSize: typeof raw?.stepSize === 'number' ? raw.stepSize : base.stepSize,
    maxSteps: typeof raw?.maxSteps === 'number' ? Math.round(raw.maxSteps) : base.maxSteps,
    densityThreshold:
      typeof raw?.densityThreshold === 'number' ? raw.densityThreshold : base.densityThreshold,
    transmittanceCut:
      typeof raw?.transmittanceCut === 'number' ? raw.transmittanceCut : base.transmittanceCut,
    renderScale:
      typeof raw?.renderScale === 'number'
        ? clampRenderScale(raw.renderScale)
        : base.renderScale,
    shadowQuality: normalizeShadowQuality(raw?.shadowQuality ?? base.shadowQuality),
    antiAliasing:
      typeof raw?.antiAliasing === 'boolean' ? raw.antiAliasing : base.antiAliasing,
    theatricalGlow:
      typeof raw?.theatricalGlow === 'boolean' ? raw.theatricalGlow : base.theatricalGlow,
    lensFlare: typeof raw?.lensFlare === 'boolean' ? raw.lensFlare : base.lensFlare,
    lensFlareLights: normalizeLensFlareGroupTune(
      raw?.lensFlareLights as Partial<LensFlareGroupTune> | undefined,
      base.lensFlareLights,
    ),
    lensFlareSun: normalizeLensFlareGroupTune(
      raw?.lensFlareSun as Partial<LensFlareGroupTune> | undefined,
      base.lensFlareSun,
    ),
    tonemapMode: normalizeTonemapMode(raw?.tonemapMode, base.tonemapMode),
    colorProfile: normalizeColorProfile(raw?.colorProfile, base.colorProfile),
    outputGamma: resolveOutputGamma(
      raw as { outputGamma?: unknown; colorSpace?: unknown } | undefined,
      base.outputGamma,
    ),
    fluidGridRes: normalizeFluidGridResQuality(raw?.fluidGridRes, base.fluidGridRes),
    fluidJacobiIterations:
      typeof raw?.fluidJacobiIterations === 'number'
        ? clampFluidJacobiIterations(raw.fluidJacobiIterations, base.fluidJacobiIterations)
        : base.fluidJacobiIterations,
    fluidAdvectionMode: normalizeFluidAdvectionMode(
      raw?.fluidAdvectionMode,
      base.fluidAdvectionMode,
    ),
    fluidVorticityMode: normalizeFluidVorticityMode(
      raw?.fluidVorticityMode,
      base.fluidVorticityMode,
    ),
    fluidDissipation:
      typeof raw?.fluidDissipation === 'number'
        ? clampRange(raw.fluidDissipation, 0, 1, base.fluidDissipation)
        : base.fluidDissipation,
    fluidEnableRefraction:
      typeof raw?.fluidEnableRefraction === 'boolean'
        ? raw.fluidEnableRefraction
        : base.fluidEnableRefraction,
    fluidMaxSurfaceBounces:
      typeof raw?.fluidMaxSurfaceBounces === 'number'
        ? clampFluidMaxSurfaceBounces(raw.fluidMaxSurfaceBounces, base.fluidMaxSurfaceBounces)
        : base.fluidMaxSurfaceBounces,
    fluidSurfaceSamples:
      typeof raw?.fluidSurfaceSamples === 'number'
        ? clampFluidSurfaceSamples(raw.fluidSurfaceSamples, base.fluidSurfaceSamples)
        : base.fluidSurfaceSamples,
    overallPreset: overallHint,
    volumetricsPreset: normalizeQualityPresetSelection(
      raw?.volumetricsPreset,
      base.volumetricsPreset,
    ),
    shadowPreset: normalizeQualityPresetSelection(raw?.shadowPreset, base.shadowPreset),
    presentationPreset: normalizeQualityPresetSelection(
      raw?.presentationPreset,
      base.presentationPreset,
    ),
    fluidsPreset: normalizeQualityPresetSelection(raw?.fluidsPreset, base.fluidsPreset),
    preset: overallHint,
  };

  // Re-derive section labels from actual values so Custom sticks when fields diverge.
  return refreshQualityPresets(merged);
}
