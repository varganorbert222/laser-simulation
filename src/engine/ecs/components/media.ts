import type { Vec3 } from '../../math/vec3';
import {
  clampMieAnisotropy,
  clampParticleSizeForModel,
  defaultMieAnisotropy,
  defaultParticleSizeNm,
  isScatterModel,
  type ScatterModel,
} from '../../physics/optics/scatter-model';
import {
  defaultMediaVolumeForKind,
  isClimatePreset,
  isMediaKind,
  opticalFieldsForMediaKind,
  opticalFieldsFromClimate,
  resolveMediaPresetId,
  scatterModelForMediaKind,
  type MediaKind,
  type MediaLayer,
  type MediaPresetId,
} from '../../physics/optics/media-optical-presets';
import {
  clampRelativeHumidity,
  clampTemperatureC,
} from '../../physics/optics/atmosphere-climate';

export type { ScatterModel } from '../../physics/optics/scatter-model';
export type { MediaKind, MediaLayer, MediaPresetId } from '../../physics/optics/media-optical-presets';

export interface MediaVolume {
  /** Preset identity (legacy field name `kind`). */
  kind: MediaKind;
  preset: MediaPresetId;
  layer: MediaLayer;
  /** Interior climates exclude outdoor climate inside their AABB. */
  insulating: boolean;
  /**
   * Dimensionless concentration multiplier (1 = literature σ at reference fill).
   * Local fill = density × FBM noise.
   */
  density: number;
  /** Fog tint RGB (0–1), multiplies scattered light in volume. */
  color: Vec3;
  /** AABB half-size in world metres (before entity scale). */
  halfExtents: Vec3;
  fbmScale: number;
  fbmTimeScale: number;
  noiseThresholdLow: number;
  noiseThresholdHigh: number;
  /**
   * Id of a baked noise asset from the Noise library (null = flat 0.5 fallback).
   * 2D / 3D texture type comes from the asset.
   */
  noiseAssetId: string | null;
  /**
   * Volume scatter coefficient σ_s [m⁻¹].
   * Particulate: Tyndall channel. Climate: Rayleigh channel.
   */
  scatter: number;
  /** Dual-channel Mie σ_s [m⁻¹] for climate layers. */
  scatterMie: number;
  absorption: number;
  scatterModel: ScatterModel;
  particleSizeNm: number;
  mieAnisotropy: number;
  relativeHumidity: number;
  temperatureC: number;
  turbulence: number;
}

export function defaultMediaVolume(): MediaVolume {
  return defaultMediaVolumeForKind('fog');
}

/** Fill missing fields when loading older saves. Migrates legacy kinds → presets. */
export function normalizeMediaVolume(
  raw: Partial<MediaVolume> & Record<string, unknown>,
): MediaVolume {
  const d = defaultMediaVolume();
  const half =
    Array.isArray(raw.halfExtents) && raw.halfExtents.length === 3
      ? ([raw.halfExtents[0], raw.halfExtents[1], raw.halfExtents[2]] as Vec3)
      : d.halfExtents;
  const color =
    Array.isArray(raw.color) && raw.color.length === 3
      ? ([raw.color[0], raw.color[1], raw.color[2]] as Vec3)
      : d.color;

  let kind: MediaKind = d.kind;
  if (isMediaKind(raw.kind) || typeof raw.kind === 'string') {
    kind = resolveMediaPresetId(raw.kind);
  } else if (typeof raw.preset === 'string') {
    kind = resolveMediaPresetId(raw.preset);
  } else if (isScatterModel(raw.scatterModel)) {
    kind = raw.scatterModel === 'rayleigh' ? 'clearNight' : 'fog';
  }

  const scatterModel = scatterModelForMediaKind(kind);
  const relativeHumidity = clampRelativeHumidity(
    typeof raw.relativeHumidity === 'number' ? raw.relativeHumidity : d.relativeHumidity,
  );
  const temperatureC = clampTemperatureC(
    typeof raw.temperatureC === 'number' ? raw.temperatureC : d.temperatureC,
  );
  const density = typeof raw.density === 'number' ? raw.density : d.density;

  if (isClimatePreset(kind)) {
    const climate = opticalFieldsFromClimate(kind, relativeHumidity, temperatureC, density);
    return {
      ...climate,
      kind: climate.preset,
      halfExtents: half,
      color:
        Array.isArray(raw.color) && raw.color.length === 3
          ? color
          : ([climate.color[0], climate.color[1], climate.color[2]] as Vec3),
      fbmScale: typeof raw.fbmScale === 'number' ? raw.fbmScale : climate.fbmScale,
      fbmTimeScale: typeof raw.fbmTimeScale === 'number' ? raw.fbmTimeScale : climate.fbmTimeScale,
      noiseThresholdLow:
        typeof raw.noiseThresholdLow === 'number'
          ? raw.noiseThresholdLow
          : climate.noiseThresholdLow,
      noiseThresholdHigh:
        typeof raw.noiseThresholdHigh === 'number'
          ? raw.noiseThresholdHigh
          : climate.noiseThresholdHigh,
      insulating:
        typeof raw.insulating === 'boolean' ? raw.insulating : climate.insulating,
      noiseAssetId:
        typeof raw.noiseAssetId === 'string' && raw.noiseAssetId.length > 0
          ? raw.noiseAssetId
          : null,
    };
  }

  const fromPreset = opticalFieldsForMediaKind(kind);
  // Preserve explicit Rayleigh override on particulate presets (UI scatter-model toggle).
  const effectiveModel =
    isScatterModel(raw.scatterModel) && raw.scatterModel === 'rayleigh'
      ? 'rayleigh'
      : scatterModel;
  const particleSizeNm = clampParticleSizeForModel(
    effectiveModel,
    typeof raw.particleSizeNm === 'number'
      ? raw.particleSizeNm
      : defaultParticleSizeNm(effectiveModel),
  );
  const mieAnisotropy = clampMieAnisotropy(
    typeof raw.mieAnisotropy === 'number'
      ? raw.mieAnisotropy
      : defaultMieAnisotropy(effectiveModel, particleSizeNm),
  );

  return {
    kind: fromPreset.preset,
    preset: fromPreset.preset,
    layer: fromPreset.layer,
    insulating: typeof raw.insulating === 'boolean' ? raw.insulating : false,
    density,
    color,
    halfExtents: half,
    fbmScale: typeof raw.fbmScale === 'number' ? raw.fbmScale : fromPreset.fbmScale,
    fbmTimeScale: typeof raw.fbmTimeScale === 'number' ? raw.fbmTimeScale : fromPreset.fbmTimeScale,
    noiseThresholdLow:
      typeof raw.noiseThresholdLow === 'number'
        ? raw.noiseThresholdLow
        : fromPreset.noiseThresholdLow,
    noiseThresholdHigh:
      typeof raw.noiseThresholdHigh === 'number'
        ? raw.noiseThresholdHigh
        : fromPreset.noiseThresholdHigh,
    noiseAssetId:
      typeof raw.noiseAssetId === 'string' && raw.noiseAssetId.length > 0
        ? raw.noiseAssetId
        : null,
    scatter: typeof raw.scatter === 'number' ? raw.scatter : fromPreset.scatter,
    scatterMie: 0,
    absorption: typeof raw.absorption === 'number' ? raw.absorption : fromPreset.absorption,
    scatterModel: effectiveModel,
    particleSizeNm,
    mieAnisotropy,
    relativeHumidity,
    temperatureC,
    turbulence: 0,
  };
}
