import {
  collectComponentValues,
  fieldStateJson,
  restoreWorldFromSerialized,
  selectionHasComponent,
  type Command,
  type ComponentMap,
  type ComponentName,
  type EntityId,
  type World,
} from '@engine';
import type { EngineHostService } from '../services/engine-host.service';

/** Component values for a selection that all share `name`, or null if not. */
export function selectionComponentValues<K extends ComponentName>(
  world: World,
  ids: readonly EntityId[],
  name: K,
): ComponentMap[K][] | null {
  if (!selectionHasComponent(world, ids, name)) return null;
  return collectComponentValues(world, ids, name);
}

/** True when every selected entity has `name` but JSON values differ. */
export function selectionComponentMixed(
  world: World,
  ids: readonly EntityId[],
  name: ComponentName,
): boolean {
  if (!selectionHasComponent(world, ids, name)) return false;
  return fieldStateJson(collectComponentValues(world, ids, name)).kind === 'mixed';
}

/** Primary (first) component value when the selection uniformly has `name`. */
export function selectionComponentPrimary<K extends ComponentName>(
  world: World,
  ids: readonly EntityId[],
  name: K,
): ComponentMap[K] | null {
  return selectionComponentValues(world, ids, name)?.[0] ?? null;
}

export type PatchSelectedComponentsOpts<K extends ComponentName> = {
  engine: EngineHostService;
  ids: readonly EntityId[];
  component: K;
  /** Undo label for single-entity edits. */
  label: string;
  /** Undo label for multi-entity edits; defaults to `${label} (${ids.length})`. */
  multiLabel?: string;
  coalesce?: boolean;
  /** Override coalesce key (defaults to `Component:id` / `Component:multi:ids`). */
  coalesceKey?: string;
  merge: (before: ComponentMap[K]) => ComponentMap[K];
  /** Preferred single-entity undo command factory. */
  singleCommand?: (
    world: World,
    id: EntityId,
    before: ComponentMap[K],
    after: ComponentMap[K],
  ) => Command;
  /** Runs after component writes (and inside single-id coalesce apply). */
  afterApply?: (world: World) => void;
  /**
   * How to record multi-id edits when not coalescing.
   * - `execute` (default): `executeCommand` with restore snapshots
   * - `applied`: `commitApplied` (world already mutated)
   */
  multiRecord?: 'execute' | 'applied';
};

/**
 * Patch a component on one or more selected entities with shared undo/coalesce wiring.
 */
export function patchSelectedComponents<K extends ComponentName>(
  opts: PatchSelectedComponentsOpts<K>,
): void {
  const { engine, ids, component, label, merge } = opts;
  if (!ids.length) return;

  const world = engine.world();
  const multiLabel = opts.multiLabel ?? `${label} (${ids.length})`;

  if (ids.length === 1) {
    const id = ids[0]!;
    const before = world.get(id, component);
    if (!before) return;
    const after = merge(before);

    if (opts.coalesce) {
      engine.coalesceSnapshot({
        key: opts.coalesceKey ?? `${component}:${id}`,
        label,
        before,
        after,
        apply: (v) => {
          world.set(id, component, structuredClone(v));
          opts.afterApply?.(world);
        },
      });
      return;
    }

    if (opts.singleCommand) {
      engine.executeCommand(opts.singleCommand(world, id, before, after));
    } else {
      engine.executeCommand({
        label,
        execute: () => {
          world.set(id, component, structuredClone(after));
          opts.afterApply?.(world);
        },
        undo: () => {
          world.set(id, component, structuredClone(before));
          opts.afterApply?.(world);
        },
      });
    }
    opts.afterApply?.(world);
    return;
  }

  const beforeSnap = world.cloneSerializable();
  for (const id of ids) {
    const before = world.get(id, component);
    if (!before) continue;
    world.set(id, component, merge(before));
  }
  opts.afterApply?.(world);
  const afterSnap = world.cloneSerializable();

  if (opts.coalesce) {
    engine.coalesceSnapshot({
      key: opts.coalesceKey ?? `${component}:multi:${ids.join(',')}`,
      label: multiLabel,
      before: beforeSnap,
      after: afterSnap,
      apply: (v) => restoreWorldFromSerialized(world, v),
    });
    return;
  }

  const command: Command = {
    label: multiLabel,
    execute: () => restoreWorldFromSerialized(world, afterSnap),
    undo: () => restoreWorldFromSerialized(world, beforeSnap),
  };
  if (opts.multiRecord === 'applied') {
    engine.commitApplied(command);
  } else {
    engine.executeCommand(command);
  }
}
