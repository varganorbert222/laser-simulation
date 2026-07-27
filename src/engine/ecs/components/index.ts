import type { EnvironmentPiece, FixtureRef, Name, Parent, SiblingOrder, Transform, WorldXform } from './identity';
import type { LightEmitter } from './light';
import type { MediaVolume } from './media';
import type { SmokeEmitter } from './smoke';
import type { FogVolume } from './fog';
import type { FluidVolume } from './fluid';
import type { SurfaceMaterial } from './surface';
import type { EditorFlags, Selectable, ViewportHidden } from './flags';

export type { ScatterModel } from './media';
export type { OpticsSpillParams } from './light';
export type { SurfaceFinishPreset, SurfaceMaterial } from './surface';
export type { MediaKind, MediaLayer, MediaPresetId } from './media';
export type { FogBoundaryMode, FogGridRes } from './fog';

export type {
  EntityId,
  Name,
  Parent,
  SiblingOrder,
  Transform,
  WorldXform,
  FixtureRef,
  EnvironmentPiece,
} from './identity';
export { defaultTransform, defaultEnvironmentPiece } from './identity';

export type { LightEmitter } from './light';
export {
  defaultLightEmitter,
  defaultSunLightEmitter,
  defaultLightEmitterForMode,
  normalizeLightEmitter,
} from './light';

export type { MediaVolume } from './media';
export { defaultMediaVolume, normalizeMediaVolume } from './media';

export type { SmokeEmitter } from './smoke';
export { defaultSmokeEmitter, normalizeSmokeEmitter } from './smoke';

export type { FogVolume } from './fog';
export { defaultFogVolume, normalizeFogVolume, fogVolumeFromLegacyFluid } from './fog';

export type { FluidVolume, FluidWallMode, WaterPresetId } from './fluid';
export {
  FLUID_WALL_MODES,
  defaultFluidVolume,
  fluidParticleCount,
  isFluidWallMode,
  normalizeFluidVolume,
  surfaceMaterialForFluidWall,
} from './fluid';

export type { Selectable, ViewportHidden, EditorFlags } from './flags';

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
  FogVolume: FogVolume;
  FluidVolume: FluidVolume;
  Selectable: Selectable;
  ViewportHidden: ViewportHidden;
  EditorFlags: EditorFlags;
}

export type ComponentName = keyof ComponentMap;

/** Components the user can add/remove from the inspector. */
export const USER_ADDABLE_COMPONENTS = [
  'LightEmitter',
  'MediaVolume',
  'FogVolume',
  'FluidVolume',
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
  'FogVolume',
  'FluidVolume',
  'Selectable',
  'ViewportHidden',
  'EditorFlags',
] as const;
