import { clampRange } from '../math/clamp';

/**
 * Unified quality presets: raymarch tune + volumetric render scale + AA + shadow.
 */
export type QualityPreset = 'low' | 'medium' | 'high' | 'ultra';

/** Light→Medium volumetric self-shadow quality (Camera→Medium T is always on). */
export type ShadowQuality = 'off' | 'low' | 'medium' | 'high';

export interface Quality {
  preset: QualityPreset;
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

type QualityTune = Omit<
  Quality,
  'preset' | 'renderScale' | 'antiAliasing' | 'theatricalGlow' | 'tonemapMode'
>;

const PRESET_ORDER: readonly QualityPreset[] = ['low', 'medium', 'high', 'ultra'];

const QUALITY_TUNE: Record<QualityPreset, QualityTune> = {
  low: {
    stepSize: 0.25,
    maxSteps: 64,
    densityThreshold: 0.01,
    transmittanceCut: 0.05,
    shadowQuality: 'off',
  },
  medium: {
    stepSize: 0.15,
    maxSteps: 128,
    densityThreshold: 0.005,
    transmittanceCut: 0.02,
    shadowQuality: 'low',
  },
  high: {
    stepSize: 0.1,
    maxSteps: 256,
    densityThreshold: 0.002,
    transmittanceCut: 0.01,
    shadowQuality: 'medium',
  },
  ultra: {
    stepSize: 0.06,
    maxSteps: 512,
    densityThreshold: 0.001,
    transmittanceCut: 0.005,
    shadowQuality: 'high',
  },
};

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

export function renderScaleForPreset(preset: QualityPreset): number {
  const index = PRESET_ORDER.indexOf(preset);
  const t = index <= 0 ? 0 : index / (PRESET_ORDER.length - 1);
  const { renderScaleMin, renderScaleMax } = scaleConfig;
  return renderScaleMin + (renderScaleMax - renderScaleMin) * t;
}

export function createQuality(preset: QualityPreset = 'medium'): Quality {
  return {
    preset,
    ...QUALITY_TUNE[preset],
    renderScale: renderScaleForPreset(preset),
    antiAliasing: true,
    theatricalGlow: false,
    tonemapMode: 'aces',
  };
}

export function clampRenderScale(v: number): number {
  return clampRange(v, 0.05, 1, 0.25);
}
