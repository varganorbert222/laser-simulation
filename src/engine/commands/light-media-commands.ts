import type { EntityId, LightEmitter, MediaVolume, SmokeEmitter } from '../ecs/components';
import type { SurfaceMaterial } from '../physics/optics/surface-material';
import { refreshSceneSunBinding } from '../physics/optics/scene-sun';
import type { World } from '../ecs/world';
import type { Command } from './stack';
import { snapshotCommand } from './stack';

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
    (v) => {
      world.set(entityId, 'LightEmitter', structuredClone(v));
      refreshSceneSunBinding(world);
    },
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
    (v) => {
      world.set(entityId, 'SurfaceMaterial', structuredClone(v));
    },
  );
}

export function setMediaVolumeCommand(
  world: World,
  entityId: EntityId,
  before: MediaVolume,
  after: MediaVolume,
): Command {
  return snapshotCommand('Közeg', structuredClone(before), structuredClone(after), (v) => {
    world.set(entityId, 'MediaVolume', structuredClone(v));
  });
}

export function setSmokeEmitterCommand(
  world: World,
  entityId: EntityId,
  before: SmokeEmitter,
  after: SmokeEmitter,
): Command {
  return snapshotCommand('Füstszóró', structuredClone(before), structuredClone(after), (v) => {
    world.set(entityId, 'SmokeEmitter', structuredClone(v));
  });
}
