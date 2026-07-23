/**
 * Atmosphere / climate optics: RH + temperature → dual-channel Rayleigh + Mie.
 *
 * Layer model (see media-optical-presets):
 *   outdoor  — global air (additive with other outdoor, replaced by interior)
 *   interior — insulating room climate (wins over outdoor inside AABB)
 *   particulate — fog/smoke/dust (always additive)
 *
 * Outdoor clear night includes an aerosol haze floor so 150 mW green beams
 * remain visible at room/yard scale (molecular Rayleigh alone is too weak).
 */

import type { Vec3 } from '../math/vec3';
import { clampMieAnisotropy, defaultMieAnisotropy } from './scatter-model';

/** Media stack layer. */
export type MediaLayer = 'outdoor' | 'interior' | 'particulate';

export const MEDIA_LAYERS: readonly MediaLayer[] = ['outdoor', 'interior', 'particulate'];

/** Universal preset IDs (UI + save). */
export type MediaPresetId =
  | 'clearNight'
  | 'clearDay'
  | 'spring'
  | 'summerHumid'
  | 'autumnMist'
  | 'winterDry'
  | 'room'
  | 'lab'
  | 'hall'
  | 'fog'
  | 'smoke'
  | 'dust'
  | 'haze'
  | 'cloud';

/** @deprecated Legacy kind aliases — migrate via normalizeMediaVolume. */
export type LegacyMediaKind =
  | 'atmosphere'
  | 'summer'
  | 'autumn'
  | 'winter'
  | MediaPresetId;

export const MEDIA_PRESET_IDS: readonly MediaPresetId[] = [
  'clearNight',
  'clearDay',
  'spring',
  'summerHumid',
  'autumnMist',
  'winterDry',
  'room',
  'lab',
  'hall',
  'fog',
  'smoke',
  'dust',
  'haze',
  'cloud',
] as const;

/** Clear-air molecular Rayleigh baseline [m⁻¹] (~0.1 km⁻¹). */
export const CLIMATE_BASE_RAYLEIGH_M = 1e-4;

/**
 * Reference outdoor Mie from humidity at RH=100% [m⁻¹].
 * Combined with haze floor for clear-night visibility.
 */
export const CLIMATE_BASE_MIE_AT_RH1_M = 0.0012;

/** Outdoor clear-night aerosol floor [m⁻¹] — educational yard-scale beam visibility. */
export const CLIMATE_OUTDOOR_HAZE_FLOOR_M = 0.0035;

/** Clear-day aerosol floor (lower contrast, more sun). */
export const CLIMATE_DAY_HAZE_FLOOR_M = 0.0012;

/** Extra indoor dust / aerosol floor [m⁻¹] (room, independent of RH). */
export const CLIMATE_ROOM_AEROSOL_M = 0.002;

export const RELATIVE_HUMIDITY_MIN = 0.05;
export const RELATIVE_HUMIDITY_MAX = 1;
export const TEMPERATURE_C_MIN = -20;
export const TEMPERATURE_C_MAX = 45;

/** GPU scatterModel encoding. */
export const GPU_SCATTER_MODEL_RAYLEIGH = 0;
export const GPU_SCATTER_MODEL_TYNDALL = 1;
export const GPU_SCATTER_MODEL_CLIMATE = 2;

/** GPU layerKind encoding. */
export const GPU_LAYER_OUTDOOR = 0;
export const GPU_LAYER_INTERIOR = 1;
export const GPU_LAYER_PARTICULATE = 2;

export interface ClimatePresetDefaults {
  layer: MediaLayer;
  insulating: boolean;
  relativeHumidity: number;
  temperatureC: number;
  /** Indoor dust floor multiplier (1 = room default). */
  roomAerosolScale: number;
  /** Extra outdoor haze floor multiplier (1 = clearNight). */
  hazeFloorScale: number;
  /** Seasonal Mie boost on RH^1.3. */
  kindMieBoost: number;
  molecularScale: number;
  color: Vec3;
  fbmScale: number;
  fbmTimeScale: number;
  noiseThresholdLow: number;
  noiseThresholdHigh: number;
  density: number;
}

export interface ClimateOpticalRates {
  scatterRayleigh: number;
  scatterMie: number;
  absorption: number;
  mieAnisotropy: number;
  particleSizeNm: number;
  turbulence: number;
}

const CLIMATE_PRESETS: Partial<Record<MediaPresetId, ClimatePresetDefaults>> = {
  clearNight: {
    layer: 'outdoor',
    insulating: false,
    relativeHumidity: 0.45,
    temperatureC: 12,
    roomAerosolScale: 0,
    hazeFloorScale: 1,
    kindMieBoost: 1,
    molecularScale: 1,
    color: [0.88, 0.92, 1],
    fbmScale: 0.1,
    fbmTimeScale: 0.015,
    noiseThresholdLow: 0.02,
    noiseThresholdHigh: 0.98,
    density: 1,
  },
  clearDay: {
    layer: 'outdoor',
    insulating: false,
    relativeHumidity: 0.4,
    temperatureC: 22,
    roomAerosolScale: 0,
    hazeFloorScale: CLIMATE_DAY_HAZE_FLOOR_M / CLIMATE_OUTDOOR_HAZE_FLOOR_M,
    kindMieBoost: 0.85,
    molecularScale: 1,
    color: [0.9, 0.94, 1],
    fbmScale: 0.12,
    fbmTimeScale: 0.02,
    noiseThresholdLow: 0.02,
    noiseThresholdHigh: 0.98,
    density: 1,
  },
  spring: {
    layer: 'outdoor',
    insulating: false,
    relativeHumidity: 0.5,
    temperatureC: 14,
    roomAerosolScale: 0.1,
    hazeFloorScale: 0.7,
    kindMieBoost: 1.4,
    molecularScale: 1,
    color: [0.9, 0.93, 0.98],
    fbmScale: 0.18,
    fbmTimeScale: 0.04,
    noiseThresholdLow: 0.04,
    noiseThresholdHigh: 0.96,
    density: 1,
  },
  summerHumid: {
    layer: 'outdoor',
    insulating: false,
    relativeHumidity: 0.78,
    temperatureC: 28,
    roomAerosolScale: 0.15,
    hazeFloorScale: 0.85,
    kindMieBoost: 3.2,
    molecularScale: 0.85,
    color: [0.92, 0.95, 1],
    fbmScale: 0.22,
    fbmTimeScale: 0.06,
    noiseThresholdLow: 0.05,
    noiseThresholdHigh: 0.94,
    density: 1,
  },
  autumnMist: {
    layer: 'outdoor',
    insulating: false,
    relativeHumidity: 0.92,
    temperatureC: 8,
    roomAerosolScale: 0.2,
    hazeFloorScale: 1.1,
    kindMieBoost: 3.5,
    molecularScale: 0.7,
    color: [0.88, 0.91, 0.96],
    fbmScale: 0.28,
    fbmTimeScale: 0.05,
    noiseThresholdLow: 0.08,
    noiseThresholdHigh: 0.92,
    density: 1,
  },
  winterDry: {
    layer: 'outdoor',
    insulating: false,
    relativeHumidity: 0.28,
    temperatureC: -5,
    roomAerosolScale: 0,
    hazeFloorScale: 0.45,
    kindMieBoost: 0.35,
    molecularScale: 1.1,
    color: [0.88, 0.92, 1],
    fbmScale: 0.1,
    fbmTimeScale: 0.015,
    noiseThresholdLow: 0.02,
    noiseThresholdHigh: 0.98,
    density: 1,
  },
  room: {
    layer: 'interior',
    insulating: true,
    relativeHumidity: 0.42,
    temperatureC: 22,
    roomAerosolScale: 1,
    hazeFloorScale: 0,
    kindMieBoost: 1,
    molecularScale: 0.25,
    color: [0.94, 0.93, 0.9],
    fbmScale: 0.35,
    fbmTimeScale: 0.03,
    noiseThresholdLow: 0.1,
    noiseThresholdHigh: 0.9,
    density: 1,
  },
  lab: {
    layer: 'interior',
    insulating: true,
    relativeHumidity: 0.35,
    temperatureC: 21,
    roomAerosolScale: 0.55,
    hazeFloorScale: 0,
    kindMieBoost: 0.8,
    molecularScale: 0.2,
    color: [0.95, 0.95, 0.97],
    fbmScale: 0.25,
    fbmTimeScale: 0.02,
    noiseThresholdLow: 0.08,
    noiseThresholdHigh: 0.92,
    density: 1,
  },
  hall: {
    layer: 'interior',
    insulating: true,
    relativeHumidity: 0.48,
    temperatureC: 20,
    roomAerosolScale: 0.75,
    hazeFloorScale: 0,
    kindMieBoost: 1.1,
    molecularScale: 0.22,
    color: [0.93, 0.92, 0.9],
    fbmScale: 0.3,
    fbmTimeScale: 0.025,
    noiseThresholdLow: 0.1,
    noiseThresholdHigh: 0.9,
    density: 1,
  },
};

export function isMediaLayer(value: unknown): value is MediaLayer {
  return value === 'outdoor' || value === 'interior' || value === 'particulate';
}

export function isMediaPresetId(value: unknown): value is MediaPresetId {
  return typeof value === 'string' && (MEDIA_PRESET_IDS as readonly string[]).includes(value);
}

/** Map legacy kind strings onto current preset IDs. */
export function migrateLegacyPresetId(raw: unknown): MediaPresetId | null {
  if (isMediaPresetId(raw)) return raw;
  switch (raw) {
    case 'atmosphere':
      return 'clearNight';
    case 'summer':
      return 'summerHumid';
    case 'autumn':
      return 'autumnMist';
    case 'winter':
      return 'winterDry';
    default:
      return null;
  }
}

export function isClimatePreset(preset: MediaPresetId): boolean {
  return CLIMATE_PRESETS[preset] != null;
}

export function climatePresetDefaults(preset: MediaPresetId): ClimatePresetDefaults | null {
  return CLIMATE_PRESETS[preset] ?? null;
}

export function clampRelativeHumidity(rh: number): number {
  if (!Number.isFinite(rh)) return 0.4;
  return Math.min(RELATIVE_HUMIDITY_MAX, Math.max(RELATIVE_HUMIDITY_MIN, rh));
}

export function clampTemperatureC(t: number): number {
  if (!Number.isFinite(t)) return 20;
  return Math.min(TEMPERATURE_C_MAX, Math.max(TEMPERATURE_C_MIN, t));
}

export function humidityMieFactor(relativeHumidity: number): number {
  const rh = clampRelativeHumidity(relativeHumidity);
  return Math.pow(rh, 1.3);
}

export function temperatureTurbulence(temperatureC: number): number {
  const t = clampTemperatureC(temperatureC);
  return Math.min(0.35, Math.max(0, (t - 5) * 0.012));
}

/**
 * Dual-channel optical rates for a climate preset + live RH/T.
 */
export function resolveClimatePresetId(raw: unknown): MediaPresetId {
  const id = migrateLegacyPresetId(raw);
  if (id && isClimatePreset(id)) return id;
  return 'clearNight';
}

export function presetsForLayer(layer: MediaLayer): MediaPresetId[] {
  if (layer === 'particulate') {
    return MEDIA_PRESET_IDS.filter((id) => !isClimatePreset(id));
  }
  return MEDIA_PRESET_IDS.filter((id) => climatePresetDefaults(id)?.layer === layer);
}

export function defaultPresetForLayer(layer: MediaLayer): MediaPresetId {
  return presetsForLayer(layer)[0] ?? (layer === 'particulate' ? 'fog' : 'clearNight');
}

export function climateOpticalRates(
  preset: MediaPresetId | string,
  relativeHumidity: number,
  temperatureC: number,
): ClimateOpticalRates {
  const id = resolveClimatePresetId(preset);
  const def = climatePresetDefaults(id) ?? climatePresetDefaults('clearNight')!;
  const rh = clampRelativeHumidity(relativeHumidity);
  const tempC = clampTemperatureC(temperatureC);
  const mieF = humidityMieFactor(rh);

  const roomFloor = CLIMATE_ROOM_AEROSOL_M * Math.max(0, def.roomAerosolScale);
  const hazeFloor = CLIMATE_OUTDOOR_HAZE_FLOOR_M * Math.max(0, def.hazeFloorScale);
  const scatterMie =
    CLIMATE_BASE_MIE_AT_RH1_M * mieF * def.kindMieBoost + roomFloor + hazeFloor;

  const rayleighScale = Math.max(0.15, 1 - 0.45 * mieF) * def.molecularScale;
  const scatterRayleigh = CLIMATE_BASE_RAYLEIGH_M * rayleighScale;

  const absorption = scatterRayleigh * 0.05 + scatterMie * 0.02;
  const particleSizeNm = Math.min(1000, Math.max(50, 80 + mieF * 900));
  const mieAnisotropy = clampMieAnisotropy(
    defaultMieAnisotropy('tyndall', particleSizeNm) * (0.85 + 0.15 * mieF),
  );

  return {
    scatterRayleigh,
    scatterMie,
    absorption,
    mieAnisotropy,
    particleSizeNm,
    turbulence: temperatureTurbulence(tempC),
  };
}

/**
 * CPU mirror of shader layered sampling (climate + particulate).
 * Insulating interiors replace outdoor climate; particulates always add.
 */
export interface LayeredMediaSampleInput {
  layer: MediaLayer;
  insulating: boolean;
  /** AABB half-extents — smaller volume wins among overlapping interiors. */
  halfExtents: [number, number, number];
  scatterRayleigh: number;
  scatterMie: number;
  absorption: number;
  /** Particulate Mie (scatter field). */
  scatterParticulate?: number;
}

export interface LayeredMediaSampleResult {
  scatterRayleigh: number;
  scatterMie: number;
  absorption: number;
  usedInterior: boolean;
}

export function sampleLayeredMediaRates(
  volumes: readonly LayeredMediaSampleInput[],
): LayeredMediaSampleResult {
  let bestInterior: LayeredMediaSampleInput | null = null;
  let bestVol = Number.POSITIVE_INFINITY;
  for (const v of volumes) {
    if (!v.insulating || v.layer !== 'interior') continue;
    const vol = Math.abs(v.halfExtents[0] * v.halfExtents[1] * v.halfExtents[2]);
    if (vol < bestVol) {
      bestVol = vol;
      bestInterior = v;
    }
  }

  let scatterRayleigh = 0;
  let scatterMie = 0;
  let absorption = 0;

  for (const v of volumes) {
    if (v.layer === 'particulate') {
      const mie = v.scatterParticulate ?? v.scatterMie;
      scatterMie += mie;
      absorption += v.absorption;
      continue;
    }
    if (v.layer === 'outdoor' && !bestInterior) {
      scatterRayleigh += v.scatterRayleigh;
      scatterMie += v.scatterMie;
      absorption += v.absorption;
    }
  }

  if (bestInterior) {
    scatterRayleigh += bestInterior.scatterRayleigh;
    scatterMie += bestInterior.scatterMie;
    absorption += bestInterior.absorption;
  }

  return {
    scatterRayleigh,
    scatterMie,
    absorption,
    usedInterior: bestInterior != null,
  };
}

/** @deprecated Use isClimatePreset / migrateLegacyPresetId. */
export type AtmosphereClimateKind =
  | 'atmosphere'
  | 'spring'
  | 'summer'
  | 'autumn'
  | 'winter'
  | 'room';

/** @deprecated Prefer isClimatePreset(resolveMediaPresetId(...)). */
export function isAtmosphereClimateKind(value: unknown): boolean {
  const id = migrateLegacyPresetId(value);
  return id != null && isClimatePreset(id);
}
