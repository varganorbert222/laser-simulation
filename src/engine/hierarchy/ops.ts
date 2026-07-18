import type { ComponentMap, ComponentName, EntityId } from '../ecs/components';
import type { World } from '../ecs/world';
import { applySelection } from '../commands/selection';
import { createSceneEntity } from './entity-factory';
import {
  nextSiblingIndex,
  wouldCreateCycle,
  type HierarchyDropPosition,
} from './tree';

function siblingsOf(world: World, parentId: EntityId | null): EntityId[] {
  return world
    .allEntities()
    .filter((id) => (world.get(id, 'Parent')?.entityId ?? null) === parentId)
    .sort((a, b) => {
      const oa = world.get(a, 'SiblingOrder')?.index ?? 0;
      const ob = world.get(b, 'SiblingOrder')?.index ?? 0;
      return oa - ob;
    });
}

function reindex(world: World, parentId: EntityId | null): void {
  siblingsOf(world, parentId).forEach((id, index) => {
    world.set(id, 'SiblingOrder', { index });
  });
}

/**
 * Reparent / reorder like Blender outliner.
 * `before`/`after` → same parent as target; `inside` → child of target.
 */
export function applyHierarchyReorder(
  world: World,
  sourceId: EntityId,
  targetId: EntityId,
  position: HierarchyDropPosition,
): boolean {
  if (sourceId === targetId) return false;
  if (world.get(sourceId, 'EditorFlags')?.isSceneRoot) return false;

  const targetParent = world.get(targetId, 'Parent')?.entityId ?? null;
  let newParent: EntityId | null;
  if (position === 'inside') {
    newParent = targetId;
  } else {
    newParent = targetParent;
  }

  if (wouldCreateCycle(world, sourceId, newParent)) return false;

  const oldParent = world.get(sourceId, 'Parent')?.entityId ?? null;
  world.set(sourceId, 'Parent', { entityId: newParent });

  const siblings = siblingsOf(world, newParent).filter((id) => id !== sourceId);
  let insertAt = siblings.length;
  if (position === 'before') {
    insertAt = siblings.indexOf(targetId);
    if (insertAt < 0) insertAt = siblings.length;
  } else if (position === 'after') {
    insertAt = siblings.indexOf(targetId);
    if (insertAt < 0) insertAt = siblings.length;
    else insertAt += 1;
  } else {
    insertAt = siblings.length;
  }

  siblings.splice(insertAt, 0, sourceId);
  siblings.forEach((id, index) => world.set(id, 'SiblingOrder', { index }));

  if (oldParent !== newParent) {
    reindex(world, oldParent);
  }
  world.bump();
  return true;
}

export function deleteEntityRecursive(world: World, id: EntityId): boolean {
  if (world.get(id, 'EditorFlags')?.locked || world.get(id, 'EditorFlags')?.isSceneRoot) {
    return false;
  }
  const toDelete: EntityId[] = [];
  const walk = (cur: EntityId) => {
    toDelete.push(cur);
    for (const child of world.allEntities()) {
      if (world.get(child, 'Parent')?.entityId === cur) walk(child);
    }
  };
  walk(id);
  const parentId = world.get(id, 'Parent')?.entityId ?? null;
  for (const d of [...toDelete].reverse()) {
    world.destroyEntity(d);
  }
  reindex(world, parentId);
  return true;
}

/** Portable subtree snapshot for copy / cut / paste / duplicate. */
export interface HierarchyClipboardNode {
  name: string;
  components: Partial<ComponentMap>;
  children: HierarchyClipboardNode[];
}

const CLIPBOARD_COMPONENTS: readonly ComponentName[] = [
  'Transform',
  'FixtureRef',
  'EnvironmentPiece',
  'SurfaceMaterial',
  'LightEmitter',
  'MediaVolume',
  'ViewportHidden',
];

function childrenOf(world: World, parentId: EntityId): EntityId[] {
  return siblingsOf(world, parentId);
}

/** Capture entity + descendants (no scene-root / no EditorFlags.isSceneRoot). */
export function captureEntitySubtree(
  world: World,
  rootId: EntityId,
): HierarchyClipboardNode | null {
  if (!world.hasEntity(rootId)) return null;
  if (world.get(rootId, 'EditorFlags')?.isSceneRoot) return null;

  const capture = (id: EntityId): HierarchyClipboardNode => {
    const components: Partial<ComponentMap> = {};
    for (const name of CLIPBOARD_COMPONENTS) {
      const value = world.get(id, name);
      if (value !== undefined) {
        (components as Record<string, unknown>)[name] = structuredClone(value);
      }
    }
    return {
      name: world.get(id, 'Name')?.value ?? id,
      components,
      children: childrenOf(world, id).map(capture),
    };
  };

  return capture(rootId);
}

/**
 * Instantiate a captured subtree under parentId.
 * Returns the new root entity id, or null on failure.
 */
export function pasteEntitySubtree(
  world: World,
  node: HierarchyClipboardNode,
  parentId: EntityId | null,
  opts?: { nameSuffix?: string; offsetPosition?: boolean },
): EntityId | null {
  if (parentId && !world.hasEntity(parentId)) return null;

  const pasteOne = (n: HierarchyClipboardNode, parent: EntityId | null, isRoot: boolean): EntityId => {
    const label =
      isRoot && opts?.nameSuffix ? `${n.name}${opts.nameSuffix}` : n.name;
    const id = createSceneEntity(world, { name: label, parentId: parent });

    for (const name of CLIPBOARD_COMPONENTS) {
      const value = n.components[name];
      if (value === undefined) continue;
      if (name === 'Transform' && isRoot && opts?.offsetPosition) {
        const t = structuredClone(value) as ComponentMap['Transform'];
        t.position = [t.position[0] + 0.25, t.position[1], t.position[2] + 0.25];
        world.set(id, 'Transform', t);
        continue;
      }
      world.set(id, name, structuredClone(value) as ComponentMap[typeof name]);
    }

    for (const child of n.children) {
      pasteOne(child, id, false);
    }
    return id;
  };

  const newRoot = pasteOne(node, parentId, true);
  applySelection(world, newRoot);
  return newRoot;
}

/** Paste multiple clipboard roots (forest) under the same parent. */
export function pasteEntityForest(
  world: World,
  nodes: HierarchyClipboardNode[],
  parentId: EntityId | null,
  opts?: { nameSuffix?: string; offsetPosition?: boolean },
): EntityId[] {
  const created: EntityId[] = [];
  for (const node of nodes) {
    const id = pasteEntitySubtree(world, node, parentId, opts);
    if (id) created.push(id);
  }
  if (created.length) applySelection(world, created);
  return created;
}

/** Capture several roots as a clipboard forest (skips descendants of other selected roots). */
export function captureEntityForest(
  world: World,
  ids: readonly EntityId[],
): HierarchyClipboardNode[] {
  const idSet = new Set(ids);
  const roots = ids.filter((id) => {
    let cur = world.get(id, 'Parent')?.entityId ?? null;
    while (cur) {
      if (idSet.has(cur)) return false;
      cur = world.get(cur, 'Parent')?.entityId ?? null;
    }
    return !world.get(id, 'EditorFlags')?.isSceneRoot;
  });
  const out: HierarchyClipboardNode[] = [];
  for (const id of roots) {
    const snap = captureEntitySubtree(world, id);
    if (snap) out.push(snap);
  }
  return out;
}

/** Reparent multiple sources onto the same drop target (order preserved). */
export function applyHierarchyReorderMulti(
  world: World,
  sourceIds: readonly EntityId[],
  targetId: EntityId,
  position: HierarchyDropPosition,
): boolean {
  const unique = [...new Set(sourceIds)].filter(
    (id) => id !== targetId && !world.get(id, 'EditorFlags')?.isSceneRoot,
  );
  if (!unique.length) return false;
  let any = false;
  for (const sourceId of unique) {
    if (applyHierarchyReorder(world, sourceId, targetId, position)) any = true;
  }
  return any;
}

/** Duplicate subtree as sibling under the same parent (slight transform offset). */
export function duplicateEntitySubtree(world: World, sourceId: EntityId): EntityId | null {
  const snap = captureEntitySubtree(world, sourceId);
  if (!snap) return null;
  const parentId = world.get(sourceId, 'Parent')?.entityId ?? null;
  return pasteEntitySubtree(world, snap, parentId, {
    nameSuffix: ' (másolat)',
    offsetPosition: true,
  });
}

export { nextSiblingIndex };
