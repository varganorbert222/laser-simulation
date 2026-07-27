import {
  collectComponentValues,
  fieldStateJson,
  normalizeEditorSelection,
  selectionHasComponent,
  type Command,
  type ComponentMap,
  type ComponentName,
  type EntityId,
  type World,
} from '@engine';
import type { EngineHostService } from '../services/engine-host.service';

/**
 * Resolve entities to patch for a component.
 * Prefer explicit ids (bound inspector targets); fall back to live EditorSelection
 * so blur/teardown events still land on the entities the user was editing when the
 * Angular selection signal has already moved on.
 */
export function resolvePatchTargetIds(
  world: World,
  component: ComponentName,
  preferredIds?: readonly EntityId[] | null,
): EntityId[] {
  const prefer = (preferredIds ?? []).filter((id) => world.has(id, component));
  if (prefer.length) return prefer;
  const sel = normalizeEditorSelection(world.resources.EditorSelection);
  return sel.entityIds.filter((id) => world.has(id, component));
}

/** Component values for a selection that all share `name`, or null if not. */
function selectionComponentValues<K extends ComponentName>(
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
  /**
   * Optional writer for coalesce / multi paths. Defaults to `world.set`.
   * Use for components that should avoid structural epoch bumps (e.g. FluidVolume).
   */
  writeComponent?: (world: World, id: EntityId, value: ComponentMap[K]) => void;
  /** Runs after component writes (and inside single-id coalesce apply). */
  afterApply?: (world: World) => void;
  /**
   * How to record multi-id edits when not coalescing.
   * - `execute` (default): `executeCommand` (applies `after` again — safe / idempotent)
   * - `applied`: `commitApplied` (world already mutated)
   */
  multiRecord?: 'execute' | 'applied';
};

type MultiEntry<K extends ComponentName> = {
  entityId: EntityId;
  before: ComponentMap[K];
  after: ComponentMap[K];
};

/**
 * Patch a component on one or more selected entities with shared undo/coalesce wiring.
 * Multi-entity undo restores only the patched component values (no full-world restore).
 */
export function patchSelectedComponents<K extends ComponentName>(
  opts: PatchSelectedComponentsOpts<K>,
): void {
  const { engine, ids, component, label, merge } = opts;
  if (!ids.length) return;

  const world = engine.world();
  const multiLabel = opts.multiLabel ?? `${label} (${ids.length})`;
  const write =
    opts.writeComponent ??
    ((w: World, entityId: EntityId, value: ComponentMap[K]) => {
      w.set(entityId, component, structuredClone(value));
    });

  if (ids.length === 1) {
    const id = ids[0]!;
    const before = world.get(id, component);
    if (!before) return;
    const after = merge(before);
    if (JSON.stringify(before) === JSON.stringify(after)) return;

    if (opts.coalesce) {
      engine.coalesceSnapshot({
        key: opts.coalesceKey ?? `${component}:${id}`,
        label,
        before: structuredClone(before),
        after,
        apply: (v) => {
          write(world, id, v);
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
          write(world, id, after);
          opts.afterApply?.(world);
        },
        undo: () => {
          write(world, id, before);
          opts.afterApply?.(world);
        },
      });
    }
    opts.afterApply?.(world);
    return;
  }

  const entries: MultiEntry<K>[] = [];
  for (const id of ids) {
    const before = world.get(id, component);
    if (!before) continue;
    const after = merge(before);
    entries.push({
      entityId: id,
      before: structuredClone(before),
      after: structuredClone(after),
    });
    write(world, id, after);
  }
  opts.afterApply?.(world);
  if (!entries.length) return;

  const applyEntries = (list: MultiEntry<K>[], which: 'before' | 'after') => {
    for (const e of list) {
      write(world, e.entityId, which === 'before' ? e.before : e.after);
    }
    opts.afterApply?.(world);
  };

  if (opts.coalesce) {
    engine.coalesceSnapshot({
      key: opts.coalesceKey ?? `${component}:multi:${ids.join(',')}`,
      label: multiLabel,
      before: entries.map((e) => e.before),
      after: entries.map((e) => e.after),
      apply: (values) => {
        values.forEach((v, i) => {
          const id = entries[i]?.entityId;
          if (id) write(world, id, v);
        });
        opts.afterApply?.(world);
      },
    });
    return;
  }

  const command: Command = {
    label: multiLabel,
    execute: () => applyEntries(entries, 'after'),
    undo: () => applyEntries(entries, 'before'),
  };
  if (opts.multiRecord === 'applied') {
    engine.commitApplied(command);
  } else {
    engine.executeCommand(command);
  }
}
