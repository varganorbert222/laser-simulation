import { Injectable, computed, inject } from '@angular/core';
import {
  collectComponentValues,
  fieldStateJson,
  restoreWorldFromSerialized,
  selectionHasComponent,
  setMediaVolumeCommand,
  type MediaVolume,
} from '../../../engine';
import { EngineHostService } from '../services/engine-host.service';
import { SelectionService } from './selection.service';

@Injectable({ providedIn: 'root' })
export class MediaEditorService {
  private readonly engine = inject(EngineHostService);
  private readonly selection = inject(SelectionService);

  readonly selectedMedia = computed(() => {
    this.engine.epoch();
    const ids = this.selection.selectedIds();
    const world = this.engine.world();
    if (!selectionHasComponent(world, ids, 'MediaVolume')) return null;
    return collectComponentValues(world, ids, 'MediaVolume')[0] ?? null;
  });

  readonly selectedMediaMixed = computed(() => {
    this.engine.epoch();
    const ids = this.selection.selectedIds();
    const world = this.engine.world();
    if (!selectionHasComponent(world, ids, 'MediaVolume')) return false;
    return fieldStateJson(collectComponentValues(world, ids, 'MediaVolume')).kind === 'mixed';
  });

  setMediaDensity(density: number): void {
    this.updateMedia({ density }, { coalesce: true });
  }

  updateMedia(patch: Partial<MediaVolume>, opts?: { coalesce?: boolean }): void {
    const ids = this.selection.selectedIds().filter((id) =>
      this.engine.world().has(id, 'MediaVolume'),
    );
    if (!ids.length) return;
    const world = this.engine.world();

    const merge = (before: MediaVolume): MediaVolume => ({
      ...structuredClone(before),
      ...patch,
      color: patch.color ? ([...patch.color] as MediaVolume['color']) : before.color,
      halfExtents: patch.halfExtents
        ? ([...patch.halfExtents] as MediaVolume['halfExtents'])
        : before.halfExtents,
    });

    if (ids.length === 1) {
      const id = ids[0]!;
      const before = world.get(id, 'MediaVolume');
      if (!before) return;
      const after = merge(before);
      if (opts?.coalesce) {
        this.engine.coalesceSnapshot({
          key: `MediaVolume:${id}`,
          label: 'Közeg',
          before,
          after,
          apply: (v) => {
            world.set(id, 'MediaVolume', structuredClone(v));
          },
        });
        return;
      }
      this.engine.executeCommand(setMediaVolumeCommand(world, id, before, after));
      return;
    }

    const beforeSnap = world.cloneSerializable();
    for (const id of ids) {
      const before = world.get(id, 'MediaVolume');
      if (!before) continue;
      world.set(id, 'MediaVolume', merge(before));
    }
    const afterSnap = world.cloneSerializable();
    if (opts?.coalesce) {
      this.engine.coalesceSnapshot({
        key: `MediaVolume:multi:${ids.join(',')}`,
        label: `Közeg (${ids.length})`,
        before: beforeSnap,
        after: afterSnap,
        apply: (v) => restoreWorldFromSerialized(world, v),
      });
      return;
    }
    this.engine.executeCommand({
      label: `Közeg (${ids.length})`,
      execute: () => restoreWorldFromSerialized(world, afterSnap),
      undo: () => restoreWorldFromSerialized(world, beforeSnap),
    });
  }
}
