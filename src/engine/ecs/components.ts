import type { Mat4 } from '../math/mat4';
import type { Quat } from '../math/quat';
import type { Vec3 } from '../math/vec3';
import type { ModeParams } from '../optics/modes';
import {
  defaultModeParams,
  normalizeModeParamsPublic,
} from '../optics/modes';
import {
  apertureCouplingFromLegacyMaterial,
  clampUnit,
  defaultSurfaceMaterial,
  normalizeSurfaceMaterial,
  type LegacyFixtureSurfaceMaterial,
  type SurfaceMaterial,
} from '../optics/surface-material';
import {
  defaultOpticsSpill,
  normalizeOpticsSpill,
  type OpticsSpillParams,
} from '../optics/optics-spill';
import { clampPowerW } from '../optics/power';
import {
  defaultHdrAppearance,
  estimateIntensityLmFromSpectral,
  normalizeHdrAppearance,
} from '../optics/light-appearance';
import { wavelengthToRgb } from '../optics/wavelength';
import {
  clampMieAnisotropy,
  clampParticleSizeForModel,
  defaultMieAnisotropy,
  defaultParticleSizeNm,
  isScatterModel,
  type ScatterModel,
} from '../optics/scatter-model';
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
} from '../optics/media-optical-presets';
import {
  clampRelativeHumidity,
  clampTemperatureC,
} from '../optics/atmosphere-climate';
import {
  SMOKE_CONE_ANGLE_DEG_MAX,
  SMOKE_CONE_ANGLE_DEG_MIN,
  SMOKE_EMISSION_RATE_MAX,
  SMOKE_EMISSION_RATE_MIN,
  SMOKE_PLUME_LENGTH_M_MAX,
  SMOKE_PLUME_LENGTH_M_MIN,
} from '../optics/smoke-plume';

export type { ScatterModel } from '../optics/scatter-model';
export type { OpticsSpillParams } from '../optics/optics-spill';
export type {
  SurfaceFinishPreset,
  SurfaceMaterial,
} from '../optics/surface-material';
export type { MediaKind, MediaLayer, MediaPresetId } from '../optics/media-optical-presets';

export type EntityId = string;

export interface Name {
  value: string;
}

export interface Parent {
  entityId: EntityId | null;
}

/** Order among siblings under the same parent (Blender/Unity outliner). */
export interface SiblingOrder {
  index: number;
}

export interface Transform {
  position: Vec3;
  rotation: Quat;
  scale: Vec3;
}

/** Runtime-only world matrix — never serialized. */
export interface WorldXform {
  matrix: Mat4;
  dirty: boolean;
}

export interface FixtureRef {
  fixtureId: string;
}

export interface EnvironmentPiece {
  kind: 'ground' | 'prop' | 'sky';
  catalogId?: string;
}

export interface LightEmitter {
  wavelengthNm: number;
  powerW: number;
  enabled: boolean;
  params: ModeParams;
  /**
   * HDR lamp filter (0–1). Used when mode ≠ laser; lasers ignore this.
   * Unity Light.color analogue.
   */
  colorRgb: [number, number, number];
  /**
   * Photometric intensity in lumens (Unity-like Intensity). Non-laser only.
   */
  intensityLm: number;
  /** When true, chromaticity comes from colorTemperatureK (Unity useColorTemperature). */
  useColorTemperature: boolean;
  /** Correlated color temperature in kelvin (typically 1000–20000). */
  colorTemperatureK: number;
  /**
   * Presentation-only multipliers (theatrical glow / bloom). Ignored on the
   * scientific radiance path when theatricalGlow is off; surfaceGain is unused
   * (always treated as 1 for physical surface irradiance).
   */
  surfaceGain: number;
  glowGain: number;
  bloomGain: number;
  /**
   * Exit-pupil → housing coupling for theatrical housing glow only (0–1).
   */
  apertureCoupling: number;
  /**
   * Residual optical power fraction outside the designed beam (energy-conserving).
   * Core × (1 − f); wide residual lobe gets fraction f.
   */
  spill: OpticsSpillParams;
}

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

/**
 * Fog machine / smoke emitter — pairs with MediaVolume (particulate) on the same entity.
 * Nozzle = local +Z (same convention as LightEmitter).
 */
export interface SmokeEmitter {
  enabled: boolean;
  /** Multiplies plume density (0 = off). Typical 0–3. */
  emissionRate: number;
  /** Spray cone half-angle in degrees. */
  coneAngleDeg: number;
  /** Soft axial falloff length (m). */
  plumeLengthM: number;
}

export interface Selectable {
  selected: boolean;
}

/** Eye-toggle in outliner — hide mesh helpers in viewport. */
export interface ViewportHidden {
  hidden: boolean;
}

/** Protect scene root from accidental delete. */
export interface EditorFlags {
  locked?: boolean;
  isSceneRoot?: boolean;
}

export interface ComponentMap {
  Name: Name;
  Parent: Parent;
  SiblingOrder: SiblingOrder;
  Transform: Transform;
  WorldXform: WorldXform;
  FixtureRef: FixtureRef;
  EnvironmentPiece: EnvironmentPiece;
  SurfaceMaterial: SurfaceMaterial;
  LightEmitter: LightEmitter;
  MediaVolume: MediaVolume;
  SmokeEmitter: SmokeEmitter;
  Selectable: Selectable;
  ViewportHidden: ViewportHidden;
  EditorFlags: EditorFlags;
}

export type ComponentName = keyof ComponentMap;

/** Components the user can add/remove from the inspector. */
export const USER_ADDABLE_COMPONENTS = [
  'LightEmitter',
  'MediaVolume',
  'EnvironmentPiece',
  'FixtureRef',
  'SurfaceMaterial',
] as const satisfies readonly ComponentName[];

export type UserAddableComponent = (typeof USER_ADDABLE_COMPONENTS)[number];

export const SERIALIZABLE_COMPONENTS: readonly ComponentName[] = [
  'Name',
  'Parent',
  'SiblingOrder',
  'Transform',
  'FixtureRef',
  'EnvironmentPiece',
  'SurfaceMaterial',
  'LightEmitter',
  'MediaVolume',
  'SmokeEmitter',
  'Selectable',
  'ViewportHidden',
  'EditorFlags',
] as const;

export function defaultTransform(): Transform {
  return {
    position: [0, 0, 0],
    rotation: [0, 0, 0, 1],
    scale: [1, 1, 1],
  };
}

export function defaultLightEmitter(): LightEmitter {
  const hdr = defaultHdrAppearance('laser');
  return {
    wavelengthNm: 532,
    powerW: 1,
    enabled: true,
    params: defaultModeParams('laser'),
    colorRgb: hdr.colorRgb,
    intensityLm: hdr.intensityLm,
    useColorTemperature: hdr.useColorTemperature,
    colorTemperatureK: hdr.colorTemperatureK,
    surfaceGain: 1,
    glowGain: 1,
    bloomGain: 1,
    apertureCoupling: 0.4,
    spill: defaultOpticsSpill(),
  };
}

export function defaultSunLightEmitter(): LightEmitter {
  const hdr = defaultHdrAppearance('sun');
  return {
    wavelengthNm: 560,
    powerW: 100,
    enabled: true,
    params: defaultModeParams('sun'),
    colorRgb: hdr.colorRgb,
    intensityLm: hdr.intensityLm,
    useColorTemperature: hdr.useColorTemperature,
    colorTemperatureK: hdr.colorTemperatureK,
    surfaceGain: 1,
    glowGain: 0.2,
    bloomGain: 0.4,
    apertureCoupling: 1,
    spill: defaultOpticsSpill(),
  };
}

export function defaultLightEmitterForMode(
  mode: import('../optics/modes').LightMode,
): LightEmitter {
  if (mode === 'sun') return defaultSunLightEmitter();
  const base = defaultLightEmitter();
  if (mode === 'laser') {
    return { ...base, params: defaultModeParams('laser') };
  }
  const hdr = defaultHdrAppearance(mode);
  return {
    ...base,
    params: defaultModeParams(mode),
    colorRgb: hdr.colorRgb,
    intensityLm: hdr.intensityLm,
    useColorTemperature: hdr.useColorTemperature,
    colorTemperatureK: hdr.colorTemperatureK,
  };
}

export function defaultMediaVolume(): MediaVolume {
  return defaultMediaVolumeForKind('fog');
}

export function defaultSmokeEmitter(): SmokeEmitter {
  return {
    enabled: true,
    emissionRate: 1,
    coneAngleDeg: 25,
    plumeLengthM: 4,
  };
}

function clampSmokeEmissionRate(v: number): number {
  if (!Number.isFinite(v)) return 1;
  return Math.min(SMOKE_EMISSION_RATE_MAX, Math.max(SMOKE_EMISSION_RATE_MIN, v));
}

function clampSmokeConeAngleDeg(v: number): number {
  if (!Number.isFinite(v)) return 25;
  return Math.min(SMOKE_CONE_ANGLE_DEG_MAX, Math.max(SMOKE_CONE_ANGLE_DEG_MIN, v));
}

function clampSmokePlumeLengthM(v: number): number {
  if (!Number.isFinite(v)) return 4;
  return Math.min(SMOKE_PLUME_LENGTH_M_MAX, Math.max(SMOKE_PLUME_LENGTH_M_MIN, v));
}

export function normalizeSmokeEmitter(
  raw: Partial<SmokeEmitter> & Record<string, unknown>,
): SmokeEmitter {
  const d = defaultSmokeEmitter();
  return {
    enabled: typeof raw.enabled === 'boolean' ? raw.enabled : d.enabled,
    emissionRate:
      typeof raw.emissionRate === 'number' ? clampSmokeEmissionRate(raw.emissionRate) : d.emissionRate,
    coneAngleDeg:
      typeof raw.coneAngleDeg === 'number' ? clampSmokeConeAngleDeg(raw.coneAngleDeg) : d.coneAngleDeg,
    plumeLengthM:
      typeof raw.plumeLengthM === 'number' ? clampSmokePlumeLengthM(raw.plumeLengthM) : d.plumeLengthM,
  };
}

function clampGain(v: number, fallback: number): number {
  if (!Number.isFinite(v)) return fallback;
  return Math.min(8, Math.max(0, v));
}

/** Fill missing fields when loading older saves. */
export function normalizeLightEmitter(
  raw: Partial<LightEmitter> & Record<string, unknown>,
): LightEmitter {
  const d = defaultLightEmitter();
  const legacyMat = raw['surfaceMaterial'] as LegacyFixtureSurfaceMaterial | undefined;
  const apertureCoupling =
    typeof raw.apertureCoupling === 'number'
      ? clampUnit(raw.apertureCoupling, d.apertureCoupling)
      : apertureCouplingFromLegacyMaterial(legacyMat, d.apertureCoupling);

  const surfaceGain = clampGain(
    typeof raw.surfaceGain === 'number'
      ? raw.surfaceGain
      : typeof raw['surfaceIntensity'] === 'number'
        ? (raw['surfaceIntensity'] as number)
        : d.surfaceGain,
    d.surfaceGain,
  );
  const glowGain = clampGain(
    typeof raw.glowGain === 'number'
      ? raw.glowGain
      : typeof raw['glowIntensity'] === 'number'
        ? (raw['glowIntensity'] as number)
        : d.glowGain,
    d.glowGain,
  );
  const bloomGain = clampGain(
    typeof raw.bloomGain === 'number'
      ? raw.bloomGain
      : typeof raw['bloomIntensity'] === 'number'
        ? (raw['bloomIntensity'] as number)
        : d.bloomGain,
    d.bloomGain,
  );

  const params = normalizeModeParams(raw.params as ModeParams | undefined, d.params);
  const wavelengthNm =
    typeof raw.wavelengthNm === 'number' ? raw.wavelengthNm : d.wavelengthNm;
  const powerW = clampPowerW(typeof raw.powerW === 'number' ? raw.powerW : d.powerW);
  const modeFallback = defaultHdrAppearance(params.mode);
  const migratedHdr =
    typeof raw.intensityLm === 'number' || Array.isArray(raw.colorRgb)
      ? normalizeHdrAppearance(
          {
            colorRgb: raw.colorRgb as [number, number, number] | undefined,
            intensityLm: raw.intensityLm as number | undefined,
            useColorTemperature: raw.useColorTemperature as boolean | undefined,
            colorTemperatureK: raw.colorTemperatureK as number | undefined,
          },
          modeFallback,
        )
      : normalizeHdrAppearance(
          {
            colorRgb: wavelengthToRgb(wavelengthNm) as [number, number, number],
            intensityLm: estimateIntensityLmFromSpectral(powerW, wavelengthNm),
            useColorTemperature: false,
            colorTemperatureK: modeFallback.colorTemperatureK,
          },
          modeFallback,
        );

  return {
    wavelengthNm,
    powerW,
    enabled: typeof raw.enabled === 'boolean' ? raw.enabled : d.enabled,
    params,
    colorRgb: migratedHdr.colorRgb,
    intensityLm: migratedHdr.intensityLm,
    useColorTemperature: migratedHdr.useColorTemperature,
    colorTemperatureK: migratedHdr.colorTemperatureK,
    surfaceGain,
    glowGain,
    bloomGain,
    apertureCoupling,
    spill: normalizeOpticsSpill(
      raw.spill as Partial<OpticsSpillParams> | null | undefined,
    ),
  };
}

function normalizeModeParams(
  raw: ModeParams | undefined,
  fallback: ModeParams,
): ModeParams {
  return normalizeModeParamsPublic(raw, fallback);
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

export function defaultEnvironmentPiece(): EnvironmentPiece {
  return { kind: 'prop' };
}
