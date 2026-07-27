import { Injectable, computed, inject } from '@angular/core';
import {
  setMediaVolumeCommand,
  writeMediaVolume,
  type EntityId,
  type MediaVolume,
} from '@engine';
import { EngineHostService } from '../services/engine-host.service';
import { SelectionService } from './selection.service';
import {
  patchSelectedComponents,
  resolvePatchTargetIds,
  selectionComponentMixed,
  selectionComponentPrimary,
} from './patch-component';

@Injectable({ providedIn: 'root' })
export class MediaEditorService {
  private readonly engine = inject(EngineHostService);
  private readonly selection = inject(SelectionService);

  readonly selectedMedia = computed(() => {
    this.engine.epoch();
    this.engine.selectionRevision();
    return selectionComponentPrimary(
      this.engine.world(),
      this.selection.selectedIds(),
      'MediaVolume',
    );
  });

  readonly selectedMediaMixed = computed(() => {
    this.engine.epoch();
    this.engine.selectionRevision();
    return selectionComponentMixed(
      this.engine.world(),
      this.selection.selectedIds(),
      'MediaVolume',
    );
  });

  setMediaDensity(density: number): void {
    this.updateMedia({ density }, { coalesce: true });
  }

  updateMedia(
    patch: Partial<MediaVolume>,
    opts?: { coalesce?: boolean; entityIds?: readonly EntityId[] },
  ): void {
    const world = this.engine.world();
    const ids = resolvePatchTargetIds(
      world,
      'MediaVolume',
      opts?.entityIds ?? this.selection.selectedIds(),
    );
    patchSelectedComponents({
      engine: this.engine,
      ids,
      component: 'MediaVolume',
      label: 'Közeg',
      coalesce: opts?.coalesce,
      writeComponent: writeMediaVolume,
      merge: (before) => ({
        ...structuredClone(before),
        ...patch,
        color: patch.color ? ([...patch.color] as MediaVolume['color']) : before.color,
        halfExtents: patch.halfExtents
          ? ([...patch.halfExtents] as MediaVolume['halfExtents'])
          : before.halfExtents,
      }),
      singleCommand: setMediaVolumeCommand,
    });
  }
}
