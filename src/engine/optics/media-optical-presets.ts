/**
 * Universal media presets: layer + optical fields.
 *
 * Layers:
 *   outdoor / interior (climate dual-channel) — interior insulating by default
 *   particulate (fog/smoke/dust/haze) — always additive Tyndall/Mie
 */

import {
  climateOpticalRates,
  climatePresetDefaults,
  isClimatePreset,
  isMediaLayer,
  isMediaPresetId,
  migrateLegacyPresetId,
  type MediaLayer,
  type MediaPresetId,
} from './atmosphere-climate';
import type { ScatterModel } from './scatter-model';
import {
  clampMieAnisotropy,
  clampParticleSizeNm,
  defaultMieAnisotropy,
  defaultParticleSizeNm,
} from './scatter-model';

/** @deprecated Prefer MediaPresetId — kept as alias for saves / UI. */
export type MediaKind = MediaPresetId;

export const MEDIA_KINDS: readonly MediaKind[] = [
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
];

export interface MediaOpticalDefaults {
  preset: MediaPresetId;
  layer: MediaLayer;
  insulating: boolean;
  scatter: number;
  scatterMie: number;
  absorption: number;
  scatterModel: ScatterModel;
  particleSizeNm: number;
  mieAnisotropy: number;
  density: number;
  color: [number, number, number];
  fbmScale: number;
  fbmTimeScale: number;
  noiseThresholdLow: number;
  noiseThresholdHigh: number;
  relativeHumidity: number;
  temperatureC: number;
  turbulence: number;
}

function particulateDefaults(
  preset: MediaPresetId,
  scatter: number,
  absorption: number,
  particleSizeNm: number,
  color: [number, number, number],
  fbmScale: number,
  fbmTimeScale: number,
  noiseLow: number,
  noiseHigh: number,
): MediaOpticalDefaults {
  return {
    preset,
    layer: 'particulate',
    insulating: false,
    scatter,
    scatterMie: 0,
    absorption,
    scatterModel: 'tyndall',
    particleSizeNm,
    mieAnisotropy: defaultMieAnisotropy('tyndall', particleSizeNm),
    density: 1,
    color,
    fbmScale,
    fbmTimeScale,
    noiseThresholdLow: noiseLow,
    noiseThresholdHigh: noiseHigh,
    relativeHumidity: 0.5,
    temperatureC: 20,
    turbulence: 0,
  };
}

function climateDefaults(preset: MediaPresetId): MediaOpticalDefaults {
  const c = climatePresetDefaults(preset)!;
  const rates = climateOpticalRates(preset, c.relativeHumidity, c.temperatureC);
  return {
    preset,
    layer: c.layer,
    insulating: c.insulating,
    scatter: rates.scatterRayleigh,
    scatterMie: rates.scatterMie,
    absorption: rates.absorption,
    scatterModel: 'rayleigh',
    particleSizeNm: rates.particleSizeNm,
    mieAnisotropy: rates.mieAnisotropy,
    density: c.density,
    color: [c.color[0], c.color[1], c.color[2]],
    fbmScale: c.fbmScale,
    fbmTimeScale: c.fbmTimeScale,
    noiseThresholdLow: c.noiseThresholdLow,
    noiseThresholdHigh: c.noiseThresholdHigh,
    relativeHumidity: c.relativeHumidity,
    temperatureC: c.temperatureC,
    turbulence: rates.turbulence,
  };
}

export const MEDIA_OPTICS_FOG = particulateDefaults(
  'fog',
  0.0257,
  0.0003,
  1000,
  [0.88, 0.92, 1],
  0.4,
  0.12,
  0.18,
  0.85,
);

export const MEDIA_OPTICS_SMOKE = particulateDefaults(
  'smoke',
  0.1,
  0.055,
  250,
  [0.78, 0.74, 0.7],
  0.55,
  0.22,
  0.12,
  0.78,
);

export const MEDIA_OPTICS_DUST = particulateDefaults(
  'dust',
  0.044,
  0.006,
  1000,
  [0.86, 0.8, 0.68],
  0.35,
  0.08,
  0.22,
  0.88,
);

export const MEDIA_OPTICS_HAZE = particulateDefaults(
  'haze',
  0.008,
  0.0004,
  400,
  [0.9, 0.92, 0.95],
  0.3,
  0.08,
  0.15,
  0.9,
);

/** @deprecated alias — clear night outdoor climate. */
export const MEDIA_OPTICS_ATMOSPHERE = climateDefaults('clearNight');

const BY_PRESET: Record<MediaPresetId, MediaOpticalDefaults> = {
  clearNight: climateDefaults('clearNight'),
  clearDay: climateDefaults('clearDay'),
  spring: climateDefaults('spring'),
  summerHumid: climateDefaults('summerHumid'),
  autumnMist: climateDefaults('autumnMist'),
  winterDry: climateDefaults('winterDry'),
  room: climateDefaults('room'),
  lab: climateDefaults('lab'),
  hall: climateDefaults('hall'),
  fog: MEDIA_OPTICS_FOG,
  smoke: MEDIA_OPTICS_SMOKE,
  dust: MEDIA_OPTICS_DUST,
  haze: MEDIA_OPTICS_HAZE,
};

export function isMediaKind(value: unknown): value is MediaKind {
  return migrateLegacyPresetId(value) != null || isMediaPresetId(value);
}

export function resolveMediaPresetId(value: unknown): MediaPresetId {
  return migrateLegacyPresetId(value) ?? (isMediaPresetId(value) ? value : 'fog');
}

export function mediaOpticalDefaults(kind: MediaKind | string): MediaOpticalDefaults {
  const id = resolveMediaPresetId(kind);
  return BY_PRESET[id] ?? MEDIA_OPTICS_FOG;
}

export type MediaOpticalFields = {
  kind: MediaKind;
  preset: MediaPresetId;
  layer: MediaLayer;
  insulating: boolean;
  scatter: number;
  scatterMie: number;
  absorption: number;
  scatterModel: ScatterModel;
  particleSizeNm: number;
  mieAnisotropy: number;
  density: number;
  color: [number, number, number];
  fbmScale: number;
  fbmTimeScale: number;
  noiseThresholdLow: number;
  noiseThresholdHigh: number;
  relativeHumidity: number;
  temperatureC: number;
  turbulence: number;
};

export function opticalFieldsForMediaKind(kind: MediaKind | string): MediaOpticalFields {
  const o = mediaOpticalDefaults(kind);
  return {
    kind: o.preset,
    preset: o.preset,
    layer: o.layer,
    insulating: o.insulating,
    scatter: o.scatter,
    scatterMie: o.scatterMie,
    absorption: o.absorption,
    scatterModel: o.scatterModel,
    particleSizeNm: clampParticleSizeNm(o.particleSizeNm),
    mieAnisotropy: clampMieAnisotropy(o.mieAnisotropy),
    density: o.density,
    color: [o.color[0], o.color[1], o.color[2]],
    fbmScale: o.fbmScale,
    fbmTimeScale: o.fbmTimeScale,
    noiseThresholdLow: o.noiseThresholdLow,
    noiseThresholdHigh: o.noiseThresholdHigh,
    relativeHumidity: o.relativeHumidity,
    temperatureC: o.temperatureC,
    turbulence: o.turbulence,
  };
}

export function opticalFieldsFromClimate(
  preset: MediaPresetId | string,
  relativeHumidity: number,
  temperatureC: number,
  density = 1,
): MediaOpticalFields {
  const id = resolveMediaPresetId(preset);
  if (!isClimatePreset(id)) {
    return { ...opticalFieldsForMediaKind(id), density };
  }
  const base = opticalFieldsForMediaKind(id);
  const rates = climateOpticalRates(id, relativeHumidity, temperatureC);
  return {
    ...base,
    scatter: rates.scatterRayleigh,
    scatterMie: rates.scatterMie,
    absorption: rates.absorption,
    particleSizeNm: rates.particleSizeNm,
    mieAnisotropy: rates.mieAnisotropy,
    relativeHumidity,
    temperatureC,
    turbulence: rates.turbulence,
    density,
  };
}

export function defaultMediaVolumeForKind(kind: MediaKind | string = 'fog'): MediaOpticalFields & {
  halfExtents: [number, number, number];
} {
  const fields = opticalFieldsForMediaKind(kind);
  const half: [number, number, number] =
    fields.layer === 'outdoor' ? [40, 12, 40] : fields.layer === 'interior' ? [6, 3, 6] : [4, 2, 4];
  return { ...fields, halfExtents: half };
}

/**
 * Toggle Rayleigh ↔ Tyndall on a *particulate* volume without changing layer/preset.
 * (Climate volumes use RH/T dual-channel — switch layer in the UI, not this helper.)
 */
export function opticalFieldsForScatterModel(
  model: ScatterModel,
  currentKind: MediaKind | string = 'fog',
): MediaOpticalFields {
  const cur = resolveMediaPresetId(currentKind);
  const particulate: MediaPresetId =
    cur === 'smoke' || cur === 'dust' || cur === 'fog' || cur === 'haze' ? cur : 'fog';
  const base = opticalFieldsForMediaKind(particulate);

  if (model === 'tyndall') {
    return base;
  }

  // Rayleigh regime on the same particulate preset — do not jump to outdoor climate
  // (that hid the scatter-model dropdown and trapped the UI on climate controls).
  const particleSizeNm = defaultParticleSizeNm('rayleigh');
  return {
    ...base,
    scatterModel: 'rayleigh',
    scatter: MEDIA_OPTICS_ATMOSPHERE.scatter,
    scatterMie: 0,
    absorption: MEDIA_OPTICS_ATMOSPHERE.absorption,
    particleSizeNm: clampParticleSizeNm(particleSizeNm),
    mieAnisotropy: defaultMieAnisotropy('rayleigh', particleSizeNm),
  };
}

export function scatterModelForMediaKind(kind: MediaKind | string): ScatterModel {
  return mediaOpticalDefaults(kind).scatterModel;
}

export function layerForMediaKind(kind: MediaKind | string): MediaLayer {
  return mediaOpticalDefaults(kind).layer;
}

export function isInsulatingMediaKind(kind: MediaKind | string): boolean {
  return mediaOpticalDefaults(kind).insulating;
}

export function singleScatteringAlbedo(scatter: number, absorption: number): number {
  const s = Math.max(0, scatter);
  const a = Math.max(0, absorption);
  const t = s + a;
  if (t < 1e-12) return 1;
  return s / t;
}

export {
  defaultPresetForLayer,
  isAtmosphereClimateKind,
  isClimatePreset,
  isMediaLayer,
  isMediaPresetId,
  migrateLegacyPresetId,
  presetsForLayer,
  sampleLayeredMediaRates,
} from './atmosphere-climate';
export type {
  AtmosphereClimateKind,
  LayeredMediaSampleInput,
  LayeredMediaSampleResult,
  MediaLayer,
  MediaPresetId,
} from './atmosphere-climate';
