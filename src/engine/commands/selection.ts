import type { EntityId } from '../ecs/components';
import type { World } from '../ecs/world';
import {
  normalizeEditorSelection,
  type EditorSelection,
} from '../ecs/resources';
import type { Command } from './stack';

export type SelectionMode = 'replace' | 'toggle' | 'add' | 'range';

export interface ApplySelectionOptions {
  mode?: SelectionMode;
  /** Flat outliner order used for Shift+range (inclusive). */
  rangeOrder?: readonly EntityId[];
}

function syncSelectableFlags(world: World, selected: ReadonlySet<string>): void {
  for (const id of world.query('Selectable')) {
    const sel = world.get(id, 'Selectable');
    if (sel) sel.selected = selected.has(id);
  }
}

function writeSelection(world: World, next: EditorSelection): void {
  world.resources.EditorSelection = {
    entityId: next.entityId,
    entityIds: [...next.entityIds],
  };
  syncSelectableFlags(world, new Set(next.entityIds));
  world.bump();
}

/** Snapshot current selection (for undo). */
export function snapshotSelection(world: World): EditorSelection {
  return normalizeEditorSelection(world.resources.EditorSelection);
}

/**
 * Source of truth: `EditorSelection.entityId` (primary) + `entityIds`.
 * `Selectable.selected` is a sync mirror.
 *
 * Overloads:
 * - `applySelection(world, id)` — replace with single id (or clear if null)
 * - `applySelection(world, ids, opts)` — multi with mode
 * - `applySelection(world, selection)` — restore full snapshot
 */
export function applySelection(
  world: World,
  target: EntityId | EntityId[] | EditorSelection | null,
  opts?: ApplySelectionOptions,
): void {
  if (target !== null && typeof target === 'object' && !Array.isArray(target) && 'entityIds' in target) {
    writeSelection(world, normalizeEditorSelection(target));
    return;
  }

  const mode = opts?.mode ?? 'replace';
  const current = normalizeEditorSelection(world.resources.EditorSelection);

  if (target === null) {
    writeSelection(world, { entityId: null, entityIds: [] });
    return;
  }

  if (typeof target === 'string') {
    if (mode === 'toggle') {
      const set = new Set(current.entityIds);
      if (set.has(target)) {
        set.delete(target);
        const ids = [...set];
        const primary =
          current.entityId === target
            ? (ids[ids.length - 1] ?? null)
            : current.entityId && set.has(current.entityId)
              ? current.entityId
              : (ids[ids.length - 1] ?? null);
        writeSelection(world, { entityId: primary, entityIds: ids });
      } else {
        set.add(target);
        writeSelection(world, { entityId: target, entityIds: [...set] });
      }
      return;
    }
    if (mode === 'add') {
      const set = new Set(current.entityIds);
      set.add(target);
      writeSelection(world, { entityId: target, entityIds: [...set] });
      return;
    }
    if (mode === 'range' && opts?.rangeOrder?.length) {
      const order = opts.rangeOrder;
      const anchor = current.entityId ?? target;
      const i0 = order.indexOf(anchor);
      const i1 = order.indexOf(target);
      if (i0 < 0 || i1 < 0) {
        writeSelection(world, { entityId: target, entityIds: [target] });
        return;
      }
      const lo = Math.min(i0, i1);
      const hi = Math.max(i0, i1);
      const ids = order.slice(lo, hi + 1);
      writeSelection(world, { entityId: target, entityIds: [...ids] });
      return;
    }
    writeSelection(world, { entityId: target, entityIds: [target] });
    return;
  }

  // EntityId[]
  const ids = [...new Set(target.filter(Boolean))];
  if (ids.length === 0) {
    writeSelection(world, { entityId: null, entityIds: [] });
    return;
  }
  writeSelection(world, {
    entityId: ids[ids.length - 1]!,
    entityIds: ids,
  });
}

/** Remove a destroyed entity from selection without clearing others. */
export function pruneSelectionEntity(world: World, entityId: EntityId): void {
  const cur = normalizeEditorSelection(world.resources.EditorSelection);
  if (!cur.entityIds.includes(entityId) && cur.entityId !== entityId) return;
  const ids = cur.entityIds.filter((id) => id !== entityId);
  const primary =
    cur.entityId === entityId ? (ids[ids.length - 1] ?? null) : cur.entityId;
  writeSelection(world, {
    entityId: primary && ids.includes(primary) ? primary : (ids[ids.length - 1] ?? null),
    entityIds: ids,
  });
}

export function setSelectionCommand(
  world: World,
  entityId: EntityId | null,
): Command {
  const before = snapshotSelection(world);
  return {
    label: 'Kijelölés',
    execute: () => applySelection(world, entityId),
    undo: () => applySelection(world, before),
  };
}
