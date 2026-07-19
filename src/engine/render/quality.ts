/**
 * Unified quality presets: raymarch tune + volumetric render scale + AA.
 */
export type QualityPreset = 'low' | 'medium' | 'high' | 'ultra';

export interface Quality {
  preset: QualityPreset;
  stepSize: number;
  maxSteps: number;
  densityThreshold: number;
  transmittanceCut: number;
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
  low: { stepSize: 0.25, maxSteps: 64, densityThreshold: 0.01, transmittanceCut: 0.05 },
  medium: { stepSize: 0.15, maxSteps: 128, densityThreshold: 0.005, transmittanceCut: 0.02 },
  high: { stepSize: 0.1, maxSteps: 256, densityThreshold: 0.002, transmittanceCut: 0.01 },
  ultra: { stepSize: 0.06, maxSteps: 512, densityThreshold: 0.001, transmittanceCut: 0.005 },
};

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
    renderScaleMin: clampScale(Math.min(min, max)),
    renderScaleMax: clampScale(Math.max(min, max)),
  };
  refreshQualityPresets();
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

export const QUALITY_PRESETS: Record<QualityPreset, Omit<Quality, 'preset'>> = {
  low: omitPreset(createQuality('low')),
  medium: omitPreset(createQuality('medium')),
  high: omitPreset(createQuality('high')),
  ultra: omitPreset(createQuality('ultra')),
};

export function refreshQualityPresets(): void {
  (Object.keys(QUALITY_TUNE) as QualityPreset[]).forEach((preset) => {
    QUALITY_PRESETS[preset] = omitPreset(createQuality(preset));
  });
}

function omitPreset(q: Quality): Omit<Quality, 'preset'> {
  const { preset: _p, ...rest } = q;
  return rest;
}

function clampScale(v: number): number {
  if (!Number.isFinite(v)) return 0.25;
  return Math.min(1, Math.max(0.05, v));
}
