import { clampRange } from '../math/clamp';

/**
 * Graphics-settings ladder (modern game Options UI).
 * Per-section + overall; overall becomes {@link QualityPresetSelection} `'custom'`
 * when any section diverges.
 */
export type QualityLadder = 'low' | 'medium' | 'high' | 'ultra';

/** Ladder or Custom when values no longer match a packed preset. */
export type QualityPresetSelection = QualityLadder | 'custom';

/** @deprecated Prefer {@link QualityLadder} — kept as alias for call sites. */
export type QualityPreset = QualityLadder;

/** Light→Medium volumetric self-shadow quality (Camera→Medium T is always on). */
export type ShadowQuality = 'off' | 'low' | 'medium' | 'high';

export interface Quality {
  /** Overall / global preset — `'custom'` if sections disagree. */
  overallPreset: QualityPresetSelection;
  volumetricsPreset: QualityPresetSelection;
  shadowPreset: QualityPresetSelection;
  presentationPreset: QualityPresetSelection;
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
  /** Volumetric compose tonemap: aces (default) or reinhard. */
  tonemapMode: 'aces' | 'reinhard';
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
  tonemapMode: 'aces' | 'reinhard';
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
      return { antiAliasing: false, theatricalGlow: false, tonemapMode: 'reinhard' };
    case 'medium':
      return { antiAliasing: true, theatricalGlow: false, tonemapMode: 'aces' };
    case 'high':
      return { antiAliasing: true, theatricalGlow: false, tonemapMode: 'aces' };
    case 'ultra':
      return { antiAliasing: true, theatricalGlow: true, tonemapMode: 'aces' };
    default:
      return { antiAliasing: true, theatricalGlow: false, tonemapMode: 'aces' };
  }
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
      q.tonemapMode === t.tonemapMode
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
  const sections: QualityPresetSelection[] = [
    volumetricsPreset,
    shadowPreset,
    presentationPreset,
  ];
  if (skyPreset !== undefined) sections.push(skyPreset);
  const overallPreset = resolveOverallPreset(sections);
  return {
    ...q,
    volumetricsPreset,
    shadowPreset,
    presentationPreset,
    overallPreset,
    preset: overallPreset,
  };
}

/** Build a full Quality packed from one ladder (all sections aligned). */
export function createQuality(preset: QualityLadder = 'medium'): Quality {
  const vol = volumetricsTuneForPreset(preset);
  const pres = presentationTuneForPreset(preset);
  return {
    overallPreset: preset,
    volumetricsPreset: preset,
    shadowPreset: preset,
    presentationPreset: preset,
    preset,
    ...vol,
    shadowQuality: shadowQualityForPreset(preset),
    ...pres,
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
    tonemapMode:
      raw?.tonemapMode === 'reinhard' || raw?.tonemapMode === 'aces'
        ? raw.tonemapMode
        : base.tonemapMode,
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
    preset: overallHint,
  };

  // Re-derive section labels from actual values so Custom sticks when fields diverge.
  return refreshQualityPresets(merged);
}
