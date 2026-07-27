import type { EntityId, Transform } from '../ecs/components';
import type { World } from '../ecs/world';
import { clone as cloneQuat } from '../math/quat';
import { clone as cloneVec3 } from '../math/vec3';
import type { Command } from './stack';
import { snapshotCommand } from './stack';

/** Write local Transform without structural epoch bump (mesh sync updates TRS in place). */
export function writeTransform(world: World, entityId: EntityId, value: Transform): void {
  world.setQuiet(entityId, 'Transform', {
    position: cloneVec3(value.position),
    rotation: cloneQuat(value.rotation),
    scale: cloneVec3(value.scale),
  });
}

/** Name is hierarchy/UI only — no mesh topology. */
export function writeName(world: World, entityId: EntityId, value: string): void {
  world.setQuiet(entityId, 'Name', { value });
}

/** Visibility is toggled via applyPresentationMode — no mesh recreate. */
export function writeViewportHidden(world: World, entityId: EntityId, hidden: boolean): void {
  world.setQuiet(entityId, 'ViewportHidden', { hidden });
}

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
    (t) => writeTransform(world, entityId, t),
  );
}

/** Apply absolute transforms to many entities in one undo step. */
export function setTransformsCommand(
  world: World,
  entries: ReadonlyArray<{ entityId: EntityId; before: Transform; after: Transform }>,
): Command | null {
  if (!entries.length) return null;
  const snap = entries.map((e) => ({
    entityId: e.entityId,
    before: structuredClone(e.before),
    after: structuredClone(e.after),
  }));
  const applyAll = (which: 'before' | 'after') => {
    for (const e of snap) {
      writeTransform(world, e.entityId, which === 'before' ? e.before : e.after);
    }
  };
  return {
    label: entries.length > 1 ? `Transform (${entries.length})` : 'Transform',
    execute: () => applyAll('after'),
    undo: () => applyAll('before'),
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
    execute: () => writeName(world, entityId, after),
    undo: () => writeName(world, entityId, before),
  };
}

export function setNamesCommand(
  world: World,
  entries: ReadonlyArray<{ entityId: EntityId; before: string; after: string }>,
): Command | null {
  if (!entries.length) return null;
  const beforeSnap = entries.map((e) => ({ entityId: e.entityId, value: e.before }));
  const afterSnap = entries.map((e) => ({ entityId: e.entityId, value: e.after }));
  const apply = (list: ReadonlyArray<{ entityId: EntityId; value: string }>) => {
    for (const e of list) writeName(world, e.entityId, e.value);
  };
  return {
    label: entries.length > 1 ? `Átnevezés (${entries.length})` : 'Átnevezés',
    execute: () => apply(afterSnap),
    undo: () => apply(beforeSnap),
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
    execute: () => writeViewportHidden(world, entityId, hidden),
    undo: () => writeViewportHidden(world, entityId, before),
  };
}
