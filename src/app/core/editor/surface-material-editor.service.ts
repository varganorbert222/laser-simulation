import { Injectable, computed, inject } from '@angular/core';
import {
  collectComponentValues,
  fieldStateJson,
  normalizeSurfaceMaterial,
  restoreWorldFromSerialized,
  selectionHasComponent,
  setSurfaceMaterialCommand,
  type SurfaceMaterial,
} from '../../../engine';
import { EngineHostService } from '../services/engine-host.service';
import { SelectionService } from './selection.service';

@Injectable({ providedIn: 'root' })
export class SurfaceMaterialEditorService {
  private readonly engine = inject(EngineHostService);
  private readonly selection = inject(SelectionService);

  readonly selectedSurfaceMaterial = computed(() => {
    this.engine.epoch();
    const ids = this.selection.selectedIds();
    const world = this.engine.world();
    if (!selectionHasComponent(world, ids, 'SurfaceMaterial')) return null;
    return collectComponentValues(world, ids, 'SurfaceMaterial')[0] ?? null;
  });

  readonly selectedSurfaceMaterialMixed = computed(() => {
    this.engine.epoch();
    const ids = this.selection.selectedIds();
    const world = this.engine.world();
    if (!selectionHasComponent(world, ids, 'SurfaceMaterial')) return false;
    return fieldStateJson(collectComponentValues(world, ids, 'SurfaceMaterial')).kind === 'mixed';
  });

  updateSurfaceMaterial(patch: Partial<SurfaceMaterial>, opts?: { coalesce?: boolean }): void {
    const ids = this.selection.selectedIds().filter((id) =>
      this.engine.world().has(id, 'SurfaceMaterial'),
    );
    if (!ids.length) return;
    const world = this.engine.world();

    if (ids.length === 1) {
      const id = ids[0]!;
      const before = world.get(id, 'SurfaceMaterial');
      if (!before) return;
      const after = normalizeSurfaceMaterial({ ...before, ...patch });
      if (opts?.coalesce) {
        this.engine.coalesceSnapshot({
          key: `SurfaceMaterial:${id}`,
          label: 'Felület anyag',
          before,
          after,
          apply: (v) => {
            world.set(id, 'SurfaceMaterial', structuredClone(v));
          },
        });
        return;
      }
      this.engine.executeCommand(setSurfaceMaterialCommand(world, id, before, after));
      return;
    }

    const beforeSnap = world.cloneSerializable();
    for (const id of ids) {
      const before = world.get(id, 'SurfaceMaterial');
      if (!before) continue;
      world.set(id, 'SurfaceMaterial', normalizeSurfaceMaterial({ ...before, ...patch }));
    }
    const afterSnap = world.cloneSerializable();
    if (opts?.coalesce) {
      this.engine.coalesceSnapshot({
        key: `SurfaceMaterial:multi:${ids.join(',')}`,
        label: `Felület anyag (${ids.length})`,
        before: beforeSnap,
        after: afterSnap,
        apply: (v) => restoreWorldFromSerialized(world, v),
      });
      return;
    }
    this.engine.executeCommand({
      label: `Felület anyag (${ids.length})`,
      execute: () => restoreWorldFromSerialized(world, afterSnap),
      undo: () => restoreWorldFromSerialized(world, beforeSnap),
    });
  }
}
