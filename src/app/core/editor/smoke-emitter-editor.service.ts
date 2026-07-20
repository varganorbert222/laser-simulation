import { Injectable, computed, inject } from '@angular/core';
import {
  collectComponentValues,
  fieldStateJson,
  restoreWorldFromSerialized,
  selectionHasComponent,
  setSmokeEmitterCommand,
  type SmokeEmitter,
} from '../../../engine';
import { EngineHostService } from '../services/engine-host.service';
import { SelectionService } from './selection.service';

@Injectable({ providedIn: 'root' })
export class SmokeEmitterEditorService {
  private readonly engine = inject(EngineHostService);
  private readonly selection = inject(SelectionService);

  readonly selectedSmoke = computed(() => {
    this.engine.epoch();
    const ids = this.selection.selectedIds();
    const world = this.engine.world();
    if (!selectionHasComponent(world, ids, 'SmokeEmitter')) return null;
    return collectComponentValues(world, ids, 'SmokeEmitter')[0] ?? null;
  });

  readonly selectedSmokeMixed = computed(() => {
    this.engine.epoch();
    const ids = this.selection.selectedIds();
    const world = this.engine.world();
    if (!selectionHasComponent(world, ids, 'SmokeEmitter')) return false;
    return fieldStateJson(collectComponentValues(world, ids, 'SmokeEmitter')).kind === 'mixed';
  });

  updateSmoke(patch: Partial<SmokeEmitter>, opts?: { coalesce?: boolean }): void {
    const ids = this.selection.selectedIds().filter((id) =>
      this.engine.world().has(id, 'SmokeEmitter'),
    );
    if (!ids.length) return;
    const world = this.engine.world();

    const merge = (before: SmokeEmitter): SmokeEmitter => ({
      ...structuredClone(before),
      ...patch,
    });

    if (ids.length === 1) {
      const id = ids[0]!;
      const before = world.get(id, 'SmokeEmitter');
      if (!before) return;
      const after = merge(before);
      if (opts?.coalesce) {
        this.engine.coalesceSnapshot({
          key: `SmokeEmitter:${id}`,
          label: 'Füstszóró',
          before,
          after,
          apply: (v) => {
            world.set(id, 'SmokeEmitter', structuredClone(v));
          },
        });
        return;
      }
      this.engine.executeCommand(setSmokeEmitterCommand(world, id, before, after));
      return;
    }

    const beforeSnap = world.cloneSerializable();
    for (const id of ids) {
      const before = world.get(id, 'SmokeEmitter');
      if (!before) continue;
      world.set(id, 'SmokeEmitter', merge(before));
    }
    const afterSnap = world.cloneSerializable();
    this.engine.commitApplied({
      label: 'Füstszóró',
      execute: () => restoreWorldFromSerialized(world, afterSnap),
      undo: () => restoreWorldFromSerialized(world, beforeSnap),
    });
  }
}
