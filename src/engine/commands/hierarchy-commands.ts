import type { ComponentName, EntityId, UserAddableComponent } from '../ecs/components';
import {
  defaultEnvironmentPiece,
  defaultLightEmitter,
  defaultMediaVolume,
} from '../ecs/components';
import { defaultSurfaceMaterial } from '../optics/surface-material';
import type { World } from '../ecs/world';
import { applySelection } from './selection';
import { createSceneEntity } from '../hierarchy/entity-factory';
import {
  applyHierarchyReorder,
  applyHierarchyReorderMulti,
  captureEntityForest,
  deleteEntityRecursive,
  duplicateEntitySubtree,
  pasteEntityForest,
  pasteEntitySubtree,
  type HierarchyClipboardNode,
} from '../hierarchy/ops';
import type { HierarchyDropPosition } from '../hierarchy/tree';
import { restoreWorldFromSerialized } from '../save/serialize';
import type { Command } from './stack';

function worldMutationCommand(label: string, world: World, mutate: () => void): Command {
  const before = world.cloneSerializable();
  mutate();
  const after = world.cloneSerializable();
  return {
    label,
    execute: () => restoreWorldFromSerialized(world, after),
    undo: () => restoreWorldFromSerialized(world, before),
  };
}

function addComponentToEntity(
  world: World,
  entityId: EntityId,
  component: UserAddableComponent,
): boolean {
  if (world.has(entityId, component)) return false;
  switch (component) {
    case 'LightEmitter':
      world.add(entityId, 'LightEmitter', defaultLightEmitter());
      break;
    case 'MediaVolume':
      world.add(entityId, 'MediaVolume', defaultMediaVolume());
      break;
    case 'EnvironmentPiece':
      world.add(entityId, 'EnvironmentPiece', defaultEnvironmentPiece());
      break;
    case 'FixtureRef':
      world.add(entityId, 'FixtureRef', { fixtureId: 'laser_pointer' });
      break;
    case 'SurfaceMaterial':
      world.add(entityId, 'SurfaceMaterial', defaultSurfaceMaterial());
      break;
  }
  return true;
}

export function reorderHierarchyCommand(
  world: World,
  sourceId: EntityId,
  targetId: EntityId,
  position: HierarchyDropPosition,
): Command | null {
  const before = world.cloneSerializable();
  const ok = applyHierarchyReorder(world, sourceId, targetId, position);
  if (!ok) return null;
  const after = world.cloneSerializable();
  return {
    label: 'Hierarchia',
    execute: () => restoreWorldFromSerialized(world, after),
    undo: () => restoreWorldFromSerialized(world, before),
  };
}

export function reorderHierarchyMultiCommand(
  world: World,
  sourceIds: readonly EntityId[],
  targetId: EntityId,
  position: HierarchyDropPosition,
): Command | null {
  const before = world.cloneSerializable();
  const ok = applyHierarchyReorderMulti(world, sourceIds, targetId, position);
  if (!ok) return null;
  const after = world.cloneSerializable();
  return {
    label: 'Hierarchia',
    execute: () => restoreWorldFromSerialized(world, after),
    undo: () => restoreWorldFromSerialized(world, before),
  };
}

export function deleteEntitiesCommand(
  world: World,
  entityIdOrIds: EntityId | readonly EntityId[],
): Command | null {
  const ids = (Array.isArray(entityIdOrIds) ? entityIdOrIds : [entityIdOrIds]).filter(
    (id) => !world.get(id, 'EditorFlags')?.isSceneRoot,
  );
  if (!ids.length) return null;
  const before = world.cloneSerializable();
  let any = false;
  for (const id of ids) {
    if (deleteEntityRecursive(world, id)) any = true;
  }
  if (!any) return null;
  const after = world.cloneSerializable();
  return {
    label: ids.length > 1 ? `Törlés (${ids.length})` : 'Törlés',
    execute: () => restoreWorldFromSerialized(world, after),
    undo: () => restoreWorldFromSerialized(world, before),
  };
}

export function createEmptyEntityCommand(
  world: World,
  name: string,
  parentId: EntityId | null,
): Command {
  return worldMutationCommand('Új objektum', world, () => {
    const id = createSceneEntity(world, { name, parentId });
    applySelection(world, id);
  });
}

export function addComponentCommand(
  world: World,
  entityId: EntityId,
  component: UserAddableComponent,
): Command | null {
  if (world.has(entityId, component)) return null;
  const before = world.cloneSerializable();
  addComponentToEntity(world, entityId, component);
  const after = world.cloneSerializable();
  return {
    label: `Komponens: ${component}`,
    execute: () => restoreWorldFromSerialized(world, after),
    undo: () => restoreWorldFromSerialized(world, before),
  };
}

export function addComponentToSelectionCommand(
  world: World,
  entityIds: readonly EntityId[],
  component: UserAddableComponent,
): Command | null {
  const before = world.cloneSerializable();
  let any = false;
  for (const id of entityIds) {
    if (addComponentToEntity(world, id, component)) any = true;
  }
  if (!any) return null;
  const after = world.cloneSerializable();
  return {
    label: `Komponens: ${component}`,
    execute: () => restoreWorldFromSerialized(world, after),
    undo: () => restoreWorldFromSerialized(world, before),
  };
}

export function removeComponentCommand(
  world: World,
  entityId: EntityId,
  component: ComponentName,
): Command | null {
  if (
    component === 'Transform' ||
    component === 'Parent' ||
    component === 'Name' ||
    component === 'SiblingOrder' ||
    component === 'WorldXform' ||
    component === 'Selectable' ||
    component === 'EditorFlags'
  ) {
    return null;
  }
  if (!world.has(entityId, component)) return null;
  const before = world.cloneSerializable();
  world.remove(entityId, component);
  const after = world.cloneSerializable();
  return {
    label: `Komponens eltávolítás: ${component}`,
    execute: () => restoreWorldFromSerialized(world, after),
    undo: () => restoreWorldFromSerialized(world, before),
  };
}

export function removeComponentFromSelectionCommand(
  world: World,
  entityIds: readonly EntityId[],
  component: ComponentName,
): Command | null {
  if (
    component === 'Transform' ||
    component === 'Parent' ||
    component === 'Name' ||
    component === 'SiblingOrder' ||
    component === 'WorldXform' ||
    component === 'Selectable' ||
    component === 'EditorFlags'
  ) {
    return null;
  }
  const before = world.cloneSerializable();
  let any = false;
  for (const id of entityIds) {
    if (world.has(id, component)) {
      world.remove(id, component);
      any = true;
    }
  }
  if (!any) return null;
  const after = world.cloneSerializable();
  return {
    label: `Komponens eltávolítás: ${component}`,
    execute: () => restoreWorldFromSerialized(world, after),
    undo: () => restoreWorldFromSerialized(world, before),
  };
}

export function duplicateEntityCommand(world: World, entityId: EntityId): Command | null {
  return duplicateEntitiesCommand(world, [entityId]);
}

export function duplicateEntitiesCommand(
  world: World,
  entityIds: readonly EntityId[],
): Command | null {
  const forest = captureEntityForest(world, entityIds);
  if (!forest.length) return null;
  const before = world.cloneSerializable();
  const created: EntityId[] = [];
  for (const id of entityIds) {
    if (world.get(id, 'EditorFlags')?.isSceneRoot) continue;
    const newId = duplicateEntitySubtree(world, id);
    if (newId) created.push(newId);
  }
  if (!created.length) return null;
  applySelection(world, created);
  const after = world.cloneSerializable();
  return {
    label: created.length > 1 ? `Másolat (${created.length})` : 'Másolat',
    execute: () => restoreWorldFromSerialized(world, after),
    undo: () => restoreWorldFromSerialized(world, before),
  };
}

export function pasteEntityCommand(
  world: World,
  clipboard: HierarchyClipboardNode | HierarchyClipboardNode[],
  parentId: EntityId | null,
): Command | null {
  if (parentId && world.get(parentId, 'EditorFlags')?.locked) {
    if (!world.get(parentId, 'EditorFlags')?.isSceneRoot) return null;
  }
  const nodes = Array.isArray(clipboard) ? clipboard : [clipboard];
  if (!nodes.length) return null;
  const before = world.cloneSerializable();
  const created = pasteEntityForest(world, nodes, parentId, {
    nameSuffix: ' (másolat)',
    offsetPosition: true,
  });
  if (!created.length) return null;
  const after = world.cloneSerializable();
  return {
    label: created.length > 1 ? `Beillesztés (${created.length})` : 'Beillesztés',
    execute: () => restoreWorldFromSerialized(world, after),
    undo: () => restoreWorldFromSerialized(world, before),
  };
}

export type { HierarchyClipboardNode };
export { captureEntityForest, pasteEntitySubtree };
