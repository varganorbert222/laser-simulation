import type { ComponentName, EntityId, UserAddableComponent } from '../ecs/components';
import {
  defaultEnvironmentPiece,
  defaultFluidVolume,
  defaultFogVolume,
  defaultLightEmitter,
  defaultMediaVolume,
  defaultSmokeEmitter,
  defaultSunLightEmitter,
} from '../ecs/components';
import { defaultSurfaceMaterial } from '../physics/optics/surface-material';
import { refreshSceneSunBinding, wouldSuppressAdditionalSun } from '../physics/optics/scene-sun';
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
import { fromEulerYXZ } from '../math/quat';
import { vec3 } from '../math/vec3';

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
    case 'FogVolume':
      world.add(entityId, 'FogVolume', defaultFogVolume());
      break;
    case 'FluidVolume':
      world.add(entityId, 'FluidVolume', defaultFluidVolume());
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

/** Fog machine: FogVolume + SmokeEmitter (no MediaVolume). */
export function createSmokeEmitterCommand(
  world: World,
  name: string,
  parentId: EntityId | null,
): Command {
  return worldMutationCommand('Füstszóró', world, () => {
    const id = createSceneEntity(world, { name, parentId });
    const fog = defaultFogVolume();
    world.add(id, 'FogVolume', {
      ...fog,
      halfExtents: vec3(2, 2.5, 2),
      boundaryMode: 'closed',
      maxDensity: 1,
    });
    world.add(id, 'SmokeEmitter', defaultSmokeEmitter());
    applySelection(world, id);
  });
}

/**
 * Optional unique scene Sun (directional key light). Extra suns stay in the
 * hierarchy but are suppressed from rendering — caller should warn the user.
 */
export function createSunEntityCommand(
  world: World,
  name: string,
  parentId: EntityId | null,
): { command: Command; suppressed: boolean } {
  const suppressed = wouldSuppressAdditionalSun(world);
  const command = worldMutationCommand('Nap', world, () => {
    const id = createSceneEntity(world, { name, parentId });
    // Point roughly toward −Y/−Z like the educational env sun.
    world.set(id, 'Transform', {
      position: vec3(0, 8, 0),
      rotation: fromEulerYXZ(0, -Math.PI * 0.65, 0),
      scale: vec3(1, 1, 1),
    });
    world.add(id, 'LightEmitter', defaultSunLightEmitter());
    refreshSceneSunBinding(world);
    applySelection(world, id);
  });
  return { command, suppressed };
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
