import type { EntityId, Transform } from '../ecs/components';
import type { World } from '../ecs/world';
import type { Quat } from '../math/quat';
import { clone as cloneQuat } from '../math/quat';
import type { Vec3 } from '../math/vec3';
import { clone as cloneVec3 } from '../math/vec3';
import { restoreWorldFromSerialized } from '../save/serialize';
import type { Command } from './stack';
import { snapshotCommand } from './stack';

export function setTransformCommand(
  world: World,
  entityId: EntityId,
  before: Transform,
  after: Transform,
): Command {
  return snapshotCommand(
    'Transform',
    structuredClone(before),
    structuredClone(after),
    (t) => {
      world.set(entityId, 'Transform', {
        position: cloneVec3(t.position),
        rotation: cloneQuat(t.rotation),
        scale: cloneVec3(t.scale),
      });
    },
  );
}

/** Apply absolute transforms to many entities in one undo step. */
export function setTransformsCommand(
  world: World,
  entries: ReadonlyArray<{ entityId: EntityId; before: Transform; after: Transform }>,
): Command | null {
  if (!entries.length) return null;
  const before = world.cloneSerializable();
  for (const e of entries) {
    world.set(e.entityId, 'Transform', {
      position: cloneVec3(e.after.position),
      rotation: cloneQuat(e.after.rotation),
      scale: cloneVec3(e.after.scale),
    });
  }
  const after = world.cloneSerializable();
  return {
    label: entries.length > 1 ? `Transform (${entries.length})` : 'Transform',
    execute: () => restoreWorldFromSerialized(world, after),
    undo: () => restoreWorldFromSerialized(world, before),
  };
}

export function setPositionCommand(
  world: World,
  entityId: EntityId,
  before: Vec3,
  after: Vec3,
): Command {
  return {
    label: 'Pozíció',
    execute: () => {
      const t = world.get(entityId, 'Transform');
      if (!t) return;
      world.set(entityId, 'Transform', { ...t, position: cloneVec3(after) });
    },
    undo: () => {
      const t = world.get(entityId, 'Transform');
      if (!t) return;
      world.set(entityId, 'Transform', { ...t, position: cloneVec3(before) });
    },
  };
}

export function setRotationCommand(
  world: World,
  entityId: EntityId,
  before: Quat,
  after: Quat,
): Command {
  return {
    label: 'Forgatás',
    execute: () => {
      const t = world.get(entityId, 'Transform');
      if (!t) return;
      world.set(entityId, 'Transform', { ...t, rotation: cloneQuat(after) });
    },
    undo: () => {
      const t = world.get(entityId, 'Transform');
      if (!t) return;
      world.set(entityId, 'Transform', { ...t, rotation: cloneQuat(before) });
    },
  };
}

export function setNameCommand(
  world: World,
  entityId: EntityId,
  before: string,
  after: string,
): Command {
  return {
    label: 'Átnevezés',
    execute: () => {
      world.set(entityId, 'Name', { value: after });
    },
    undo: () => {
      world.set(entityId, 'Name', { value: before });
    },
  };
}

export function setNamesCommand(
  world: World,
  entries: ReadonlyArray<{ entityId: EntityId; before: string; after: string }>,
): Command | null {
  if (!entries.length) return null;
  const beforeSnap = world.cloneSerializable();
  for (const e of entries) {
    world.set(e.entityId, 'Name', { value: e.after });
  }
  const afterSnap = world.cloneSerializable();
  return {
    label: entries.length > 1 ? `Átnevezés (${entries.length})` : 'Átnevezés',
    execute: () => restoreWorldFromSerialized(world, afterSnap),
    undo: () => restoreWorldFromSerialized(world, beforeSnap),
  };
}

export function setViewportHiddenCommand(
  world: World,
  entityId: EntityId,
  hidden: boolean,
): Command {
  const before = world.get(entityId, 'ViewportHidden')?.hidden ?? false;
  return {
    label: 'Láthatóság',
    execute: () => {
      world.set(entityId, 'ViewportHidden', { hidden });
    },
    undo: () => {
      world.set(entityId, 'ViewportHidden', { hidden: before });
    },
  };
}
