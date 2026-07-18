import {
  defaultTransform,
  type EntityId,
  type ComponentMap,
  type ComponentName,
} from '../ecs/components';
import type { World } from '../ecs/world';
import { nextSiblingIndex } from '../hierarchy/tree';
import { identity as matIdentity } from '../math/mat4';

export interface CreateEntityOptions {
  id?: EntityId;
  name: string;
  parentId?: EntityId | null;
  locked?: boolean;
  isSceneRoot?: boolean;
}

/** Every scene node gets Name, Parent, SiblingOrder, Transform, Selectable by default. */
export function createSceneEntity(world: World, opts: CreateEntityOptions): EntityId {
  const parentId = opts.parentId ?? null;
  const id = world.createEntity(opts.id);
  world.add(id, 'Name', { value: opts.name });
  world.add(id, 'Parent', { entityId: parentId });
  world.add(id, 'SiblingOrder', { index: nextSiblingIndex(world, parentId) });
  world.add(id, 'Transform', defaultTransform());
  world.add(id, 'WorldXform', { matrix: matIdentity(), dirty: true });
  world.add(id, 'Selectable', { selected: false });
  world.add(id, 'ViewportHidden', { hidden: false });
  if (opts.locked || opts.isSceneRoot) {
    world.add(id, 'EditorFlags', {
      locked: opts.locked ?? false,
      isSceneRoot: opts.isSceneRoot ?? false,
    });
  }
  return id;
}

export function addComponentToEntity<C extends ComponentName>(
  world: World,
  id: EntityId,
  name: C,
  value: ComponentMap[C],
): void {
  if (!world.hasEntity(id)) return;
  world.add(id, name, value);
}

export function removeComponentFromEntity(
  world: World,
  id: EntityId,
  name: ComponentName,
): void {
  if (name === 'Transform' || name === 'Parent' || name === 'Name' || name === 'SiblingOrder') {
    return;
  }
  world.remove(id, name);
}
