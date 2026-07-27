import type {
  EntityId,
  FluidVolume,
  FogVolume,
  LightEmitter,
  MediaVolume,
  SmokeEmitter,
} from '../ecs/components';
import type { SurfaceMaterial } from '../physics/optics/surface-material';
import { refreshSceneSunBinding } from '../physics/optics/scene-sun';
import type { World } from '../ecs/world';
import type { Command } from './stack';
import { snapshotCommand } from './stack';

function extentsChanged(
  a: readonly [number, number, number] | undefined,
  b: readonly [number, number, number],
): boolean {
  if (!a) return true;
  return a[0] !== b[0] || a[1] !== b[1] || a[2] !== b[2];
}

/** Write FogVolume; bump epoch only when AABB size changes (mesh rebuild). */
export function writeFogVolume(world: World, entityId: EntityId, value: FogVolume): void {
  const prev = world.get(entityId, 'FogVolume');
  const next = structuredClone(value);
  if (extentsChanged(prev?.halfExtents, next.halfExtents)) {
    world.set(entityId, 'FogVolume', next);
  } else {
    world.setQuiet(entityId, 'FogVolume', next);
  }
}

/** Write FluidVolume (SPH water); bump epoch when AABB or tank wall mode changes (mesh rebuild). */
export function writeFluidVolume(world: World, entityId: EntityId, value: FluidVolume): void {
  const prev = world.get(entityId, 'FluidVolume');
  const next = structuredClone(value);
  const wallChanged = (prev?.wallMode ?? 'none') !== next.wallMode;
  if (extentsChanged(prev?.halfExtents, next.halfExtents) || wallChanged) {
    world.set(entityId, 'FluidVolume', next);
  } else {
    world.setQuiet(entityId, 'FluidVolume', next);
  }
}

/** Write MediaVolume; bump only when AABB size changes. */
export function writeMediaVolume(world: World, entityId: EntityId, value: MediaVolume): void {
  const prev = world.get(entityId, 'MediaVolume');
  const next = structuredClone(value);
  if (extentsChanged(prev?.halfExtents, next.halfExtents)) {
    world.set(entityId, 'MediaVolume', next);
  } else {
    world.setQuiet(entityId, 'MediaVolume', next);
  }
}

/** Light params — SurfaceLightSync / volumetrics read live each frame. */
export function writeLightEmitter(world: World, entityId: EntityId, value: LightEmitter): void {
  world.setQuiet(entityId, 'LightEmitter', structuredClone(value));
  refreshSceneSunBinding(world);
}

/** Smoke emitter has no mesh — pack only. */
export function writeSmokeEmitter(world: World, entityId: EntityId, value: SmokeEmitter): void {
  world.setQuiet(entityId, 'SmokeEmitter', structuredClone(value));
}

/**
 * Surface look — SceneMeshSync.refreshSurfaceMaterials updates StandardMaterial in place.
 * No structural mesh rebuild.
 */
export function writeSurfaceMaterial(
  world: World,
  entityId: EntityId,
  value: SurfaceMaterial,
): void {
  world.setQuiet(entityId, 'SurfaceMaterial', structuredClone(value));
}

export function setLightEmitterCommand(
  world: World,
  entityId: EntityId,
  before: LightEmitter,
  after: LightEmitter,
): Command {
  return snapshotCommand(
    'Fény paraméterek',
    structuredClone(before),
    structuredClone(after),
    (v) => writeLightEmitter(world, entityId, v),
  );
}

export function setSurfaceMaterialCommand(
  world: World,
  entityId: EntityId,
  before: SurfaceMaterial,
  after: SurfaceMaterial,
): Command {
  return snapshotCommand(
    'Felület anyag',
    structuredClone(before),
    structuredClone(after),
    (v) => writeSurfaceMaterial(world, entityId, v),
  );
}

export function setMediaVolumeCommand(
  world: World,
  entityId: EntityId,
  before: MediaVolume,
  after: MediaVolume,
): Command {
  return snapshotCommand('Közeg', structuredClone(before), structuredClone(after), (v) => {
    writeMediaVolume(world, entityId, v);
  });
}

export function setSmokeEmitterCommand(
  world: World,
  entityId: EntityId,
  before: SmokeEmitter,
  after: SmokeEmitter,
): Command {
  return snapshotCommand('Füstszóró', structuredClone(before), structuredClone(after), (v) => {
    writeSmokeEmitter(world, entityId, v);
  });
}

export function setFluidVolumeCommand(
  world: World,
  entityId: EntityId,
  before: FluidVolume,
  after: FluidVolume,
): Command {
  return snapshotCommand('Víz', structuredClone(before), structuredClone(after), (v) => {
    writeFluidVolume(world, entityId, v);
  });
}

export function setFogVolumeCommand(
  world: World,
  entityId: EntityId,
  before: FogVolume,
  after: FogVolume,
): Command {
  return snapshotCommand('Füst', structuredClone(before), structuredClone(after), (v) => {
    writeFogVolume(world, entityId, v);
  });
}
