import type { Mat4 } from '../math/mat4';
import type { Quat } from '../math/quat';
import type { Vec3 } from '../math/vec3';
import type { ModeParams } from '../optics/modes';
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
  clampMieAnisotropy,
  clampParticleSizeNm,
  defaultMieAnisotropy,
  defaultParticleSizeNm,
  isScatterModel,
  type ScatterModel,
} from '../optics/scatter-model';

export type { ScatterModel } from '../optics/scatter-model';
export type { OpticsSpillParams } from '../optics/optics-spill';
export type {
  SurfaceFinishPreset,
  SurfaceMaterial,
  FixtureFinishPreset,
} from '../optics/surface-material';

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
  /** Multiplier for Babylon surface Spot/Point intensity. */
  surfaceGain: number;
  /** Multiplier for fixture housing emissive / GlowLayer. */
  glowGain: number;
  /** Multiplier for bloom contribution. */
  bloomGain: number;
  /**
   * Exit-pupil → housing coupling (baffling / aperture efficiency complement), 0–1.
   * Scales fixture housing glow together with glowGain.
   */
  apertureCoupling: number;
  /**
   * Soft secondary light from the fixture optics (stray / internal reflection /
   * aperture spill) — visible around or under the main beam in fog.
   */
  spill: OpticsSpillParams;
}

export type MediaKind = 'fog' | 'smoke' | 'dust';

export interface MediaVolume {
  kind: MediaKind;
  /** Base extinction / scatter density scale. */
  density: number;
  /** Fog tint RGB (0–1), multiplies scattered light in volume. */
  color: Vec3;
  /** AABB half-size in world metres (before entity scale). */
  halfExtents: Vec3;
  /** FBM spatial frequency. */
  fbmScale: number;
  /** FBM scroll speed along Y. */
  fbmTimeScale: number;
  /** Noise soft-threshold low (smoothstep edge0). */
  noiseThresholdLow: number;
  /** Noise soft-threshold high (smoothstep edge1). */
  noiseThresholdHigh: number;
  /** Volume scatter coefficient σ_s. */
  scatter: number;
  /** Volume absorption coefficient σ_a (σ_t ≈ scatter + absorption). */
  absorption: number;
  /**
   * Scatter regime: Tyndall (colloidal beam cone, weak λ dependence) or
   * Rayleigh (molecular, ∝ λ⁻⁴).
   */
  scatterModel: ScatterModel;
  /** Characteristic particle diameter (nm) — educational; drives mild Tyndall blend. */
  particleSizeNm: number;
  /**
   * Mie / Henyey–Greenstein anisotropy g (−1…+1).
   * Forward scattering (g→1) makes the beam bright looking into it, dark from behind.
   */
  mieAnisotropy: number;
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
  return {
    wavelengthNm: 532,
    powerW: 1,
    enabled: true,
    params: {
      mode: 'laser',
      laser: { w0M: 0.01, parallelness: 0.85, probeDistanceM: 5 },
    },
    surfaceGain: 1,
    glowGain: 1,
    bloomGain: 1,
    apertureCoupling: 0.4,
    spill: defaultOpticsSpill(),
  };
}

export function defaultMediaVolume(): MediaVolume {
  return {
    kind: 'fog',
    density: 0.7,
    color: [0.85, 0.9, 1],
    halfExtents: [4, 2, 4],
    fbmScale: 0.45,
    fbmTimeScale: 0.15,
    noiseThresholdLow: 0.2,
    noiseThresholdHigh: 0.8,
    scatter: 0.9,
    absorption: 0.2,
    // Fog / haze / smoke are colloidal → Tyndall (white-ish beam cone).
    scatterModel: 'tyndall',
    particleSizeNm: defaultParticleSizeNm('tyndall'),
    mieAnisotropy: defaultMieAnisotropy('tyndall', defaultParticleSizeNm('tyndall')),
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

  return {
    wavelengthNm: typeof raw.wavelengthNm === 'number' ? raw.wavelengthNm : d.wavelengthNm,
    powerW: clampPowerW(typeof raw.powerW === 'number' ? raw.powerW : d.powerW),
    enabled: typeof raw.enabled === 'boolean' ? raw.enabled : d.enabled,
    params: (raw.params as LightEmitter['params']) ?? d.params,
    surfaceGain,
    glowGain,
    bloomGain,
    apertureCoupling,
    spill: normalizeOpticsSpill(
      raw.spill as Partial<OpticsSpillParams> | null | undefined,
    ),
  };
}

/** Fill missing fields when loading older saves. */
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
  const kind =
    raw.kind === 'smoke' || raw.kind === 'dust' || raw.kind === 'fog' ? raw.kind : d.kind;
  const scatterModel = isScatterModel(raw.scatterModel) ? raw.scatterModel : d.scatterModel;
  const particleSizeNm = clampParticleSizeNm(
    typeof raw.particleSizeNm === 'number' ? raw.particleSizeNm : defaultParticleSizeNm(scatterModel),
  );
  return {
    kind,
    density: typeof raw.density === 'number' ? raw.density : d.density,
    color,
    halfExtents: half,
    fbmScale: typeof raw.fbmScale === 'number' ? raw.fbmScale : d.fbmScale,
    fbmTimeScale: typeof raw.fbmTimeScale === 'number' ? raw.fbmTimeScale : d.fbmTimeScale,
    noiseThresholdLow:
      typeof raw.noiseThresholdLow === 'number' ? raw.noiseThresholdLow : d.noiseThresholdLow,
    noiseThresholdHigh:
      typeof raw.noiseThresholdHigh === 'number' ? raw.noiseThresholdHigh : d.noiseThresholdHigh,
    scatter: typeof raw.scatter === 'number' ? raw.scatter : d.scatter,
    absorption: typeof raw.absorption === 'number' ? raw.absorption : d.absorption,
    scatterModel,
    particleSizeNm,
    mieAnisotropy: clampMieAnisotropy(
      typeof raw.mieAnisotropy === 'number'
        ? raw.mieAnisotropy
        : defaultMieAnisotropy(scatterModel, particleSizeNm),
    ),
  };
}

export function defaultEnvironmentPiece(): EnvironmentPiece {
  return { kind: 'prop' };
}
