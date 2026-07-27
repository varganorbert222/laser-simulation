/**
 * Named water look presets for FluidVolume (optics + free-surface waves).
 */
import type { Vec3 } from '../../math/vec3';
import { vec3 } from '../../math/vec3';

export type WaterPresetId = 'aquarium' | 'lake' | 'sea' | 'custom';

export const WATER_PRESET_IDS = [
  'aquarium',
  'lake',
  'sea',
  'custom',
] as const satisfies readonly WaterPresetId[];

export interface WaterPresetParams {
  ior: number;
  opticalDensity: number;
  color: Vec3;
  scatter: number;
  absorption: number;
  causticStrength: number;
  foamStrength: number;
  waveAmplitude: number;
  waveFrequency: number;
  waveSteepness: number;
  /** Optional default liquid fill fraction (0–1). */
  fillFraction?: number;
}

type NamedWaterPresetId = Exclude<WaterPresetId, 'custom'>;

/** Named presets only — `custom` is free-form (falls back to aquarium via applyWaterPreset). */
export const WATER_PRESETS: Record<NamedWaterPresetId, WaterPresetParams> = {
  /** Indoor tank: IOR ~1.333, low absorb, clear blue, tiny waves. */
  aquarium: {
    ior: 1.333,
    opticalDensity: 0.35,
    color: vec3(0.15, 0.45, 0.7),
    scatter: 0.08,
    absorption: 0.12,
    causticStrength: 0.85,
    foamStrength: 0.55,
    waveAmplitude: 0.004,
    waveFrequency: 2.4,
    waveSteepness: 0.18,
    fillFraction: 0.55,
  },
  /** Freshwater lake: greenish, medium absorb / waves. */
  lake: {
    ior: 1.333,
    opticalDensity: 0.55,
    color: vec3(0.12, 0.42, 0.28),
    scatter: 0.16,
    absorption: 0.35,
    causticStrength: 0.75,
    foamStrength: 0.4,
    waveAmplitude: 0.022,
    waveFrequency: 1.15,
    waveSteepness: 0.38,
    fillFraction: 0.65,
  },
  /** Open sea: IOR ~1.34, higher absorb, blue-green, larger waves. */
  sea: {
    ior: 1.34,
    opticalDensity: 0.75,
    color: vec3(0.05, 0.32, 0.42),
    scatter: 0.22,
    absorption: 0.55,
    causticStrength: 1.2,
    foamStrength: 0.65,
    waveAmplitude: 0.055,
    waveFrequency: 0.85,
    waveSteepness: 0.55,
    fillFraction: 0.7,
  },
};

export function isWaterPresetId(v: unknown): v is WaterPresetId {
  return v === 'aquarium' || v === 'lake' || v === 'sea' || v === 'custom';
}

function cloneParams(p: WaterPresetParams): WaterPresetParams {
  return {
    ...p,
    color: vec3(p.color[0], p.color[1], p.color[2]),
  };
}

/** Resolve a preset id to optical / wave params (`custom` → aquarium base). */
export function applyWaterPreset(presetId: WaterPresetId): WaterPresetParams {
  if (presetId === 'custom') {
    return cloneParams(WATER_PRESETS.aquarium);
  }
  return cloneParams(WATER_PRESETS[presetId]);
}
