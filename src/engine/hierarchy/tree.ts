import type { EntityId } from '../ecs/components';
import type { World } from '../ecs/world';

export type HierarchyKind =
  | 'scene'
  | 'empty'
  | 'light'
  | 'media'
  | 'smoke'
  | 'environment'
  | 'entity';

export interface HierarchyNode {
  id: EntityId;
  label: string;
  kind: HierarchyKind;
  children: HierarchyNode[];
  locked?: boolean;
}

export type HierarchyDropPosition = 'before' | 'after' | 'inside';

export interface HierarchyReorderEvent {
  sourceId: EntityId;
  targetId: EntityId;
  position: HierarchyDropPosition;
}

export interface HierarchyOutlinerState {
  overrides: Map<string, boolean>;
  expanded: Set<string>;
}

export interface HierarchyOutlinerRow {
  node: HierarchyNode;
  depth: number;
  hasChildren: boolean;
  ancestors: HierarchyNode[];
  viewportVisible: boolean;
  selfViewportVisible: boolean;
}

export function createHierarchyOutlinerState(): HierarchyOutlinerState {
  return { overrides: new Map(), expanded: new Set() };
}

export function resolveNodeSelfViewportVisible(
  node: HierarchyNode,
  state: HierarchyOutlinerState,
  worldHidden: (id: string) => boolean,
): boolean {
  const override = state.overrides.get(node.id);
  if (override !== undefined) return override;
  return !worldHidden(node.id);
}

export function resolveViewportVisible(
  node: HierarchyNode,
  ancestors: readonly HierarchyNode[],
  state: HierarchyOutlinerState,
  worldHidden: (id: string) => boolean,
): boolean {
  for (const ancestor of ancestors) {
    if (!resolveNodeSelfViewportVisible(ancestor, state, worldHidden)) return false;
  }
  return resolveNodeSelfViewportVisible(node, state, worldHidden);
}

export function toggleNodeViewportVisibility(
  node: HierarchyNode,
  state: HierarchyOutlinerState,
  worldHidden: (id: string) => boolean,
): boolean {
  const next = !resolveNodeSelfViewportVisible(node, state, worldHidden);
  state.overrides.set(node.id, next);
  return next;
}

export function flattenOutlinerHierarchy(
  nodes: readonly HierarchyNode[],
  state: HierarchyOutlinerState,
  worldHidden: (id: string) => boolean,
  ancestors: HierarchyNode[] = [],
): HierarchyOutlinerRow[] {
  const rows: HierarchyOutlinerRow[] = [];
  for (const node of nodes) {
    const selfViewportVisible = resolveNodeSelfViewportVisible(node, state, worldHidden);
    const viewportVisible = resolveViewportVisible(node, ancestors, state, worldHidden);
    const hasChildren = node.children.length > 0;
    rows.push({
      node,
      depth: ancestors.length,
      hasChildren,
      ancestors: [...ancestors],
      viewportVisible,
      selfViewportVisible,
    });
    if (hasChildren && state.expanded.has(node.id)) {
      rows.push(
        ...flattenOutlinerHierarchy(node.children, state, worldHidden, [...ancestors, node]),
      );
    }
  }
  return rows;
}

export function seedExpandedHierarchyNodes(
  nodes: readonly HierarchyNode[],
  expanded: Set<string>,
): void {
  for (const node of nodes) {
    expanded.add(node.id);
    seedExpandedHierarchyNodes(node.children, expanded);
  }
}

export function entityKind(world: World, id: EntityId): HierarchyKind {
  const flags = world.get(id, 'EditorFlags');
  if (flags?.isSceneRoot) return 'scene';
  if (world.has(id, 'LightEmitter')) return 'light';
  if (world.has(id, 'SmokeEmitter')) return 'smoke';
  if (world.has(id, 'MediaVolume')) return 'media';
  if (world.has(id, 'EnvironmentPiece')) return 'environment';
  if (
    world.has(id, 'Transform') &&
    !world.has(id, 'LightEmitter') &&
    !world.has(id, 'MediaVolume') &&
    !world.has(id, 'SmokeEmitter') &&
    !world.has(id, 'EnvironmentPiece')
  ) {
    return 'empty';
  }
  return 'entity';
}

/** Build Blender-like tree from Parent + SiblingOrder. */
export function buildHierarchyTree(world: World): HierarchyNode[] {
  const byParent = new Map<string | null, EntityId[]>();
  for (const id of world.allEntities()) {
    const parent = world.get(id, 'Parent')?.entityId ?? null;
    const list = byParent.get(parent) ?? [];
    list.push(id);
    byParent.set(parent, list);
  }

  const sortSiblings = (ids: EntityId[]): EntityId[] =>
    [...ids].sort((a, b) => {
      const oa = world.get(a, 'SiblingOrder')?.index ?? 0;
      const ob = world.get(b, 'SiblingOrder')?.index ?? 0;
      if (oa !== ob) return oa - ob;
      return a.localeCompare(b);
    });

  const build = (id: EntityId): HierarchyNode => {
    const children = sortSiblings(byParent.get(id) ?? []).map(build);
    return {
      id,
      label: world.get(id, 'Name')?.value ?? id,
      kind: entityKind(world, id),
      children,
      locked: world.get(id, 'EditorFlags')?.locked ?? false,
    };
  };

  return sortSiblings(byParent.get(null) ?? []).map(build);
}

export function wouldCreateCycle(
  world: World,
  sourceId: EntityId,
  newParentId: EntityId | null,
): boolean {
  if (newParentId === null) return false;
  if (newParentId === sourceId) return true;
  let cur: EntityId | null = newParentId;
  while (cur) {
    if (cur === sourceId) return true;
    cur = world.get(cur, 'Parent')?.entityId ?? null;
  }
  return false;
}

export function nextSiblingIndex(world: World, parentId: EntityId | null): number {
  let max = -1;
  for (const id of world.allEntities()) {
    if ((world.get(id, 'Parent')?.entityId ?? null) === parentId) {
      max = Math.max(max, world.get(id, 'SiblingOrder')?.index ?? 0);
    }
  }
  return max + 1;
}
