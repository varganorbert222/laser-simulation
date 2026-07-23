import { Injectable, computed, inject } from '@angular/core';
import { setMediaVolumeCommand, type MediaVolume } from '@engine';
import { EngineHostService } from '../services/engine-host.service';
import { SelectionService } from './selection.service';
import {
  patchSelectedComponents,
  selectionComponentMixed,
  selectionComponentPrimary,
} from './patch-component';

@Injectable({ providedIn: 'root' })
export class MediaEditorService {
  private readonly engine = inject(EngineHostService);
  private readonly selection = inject(SelectionService);

  readonly selectedMedia = computed(() => {
    this.engine.epoch();
    return selectionComponentPrimary(
      this.engine.world(),
      this.selection.selectedIds(),
      'MediaVolume',
    );
  });

  readonly selectedMediaMixed = computed(() => {
    this.engine.epoch();
    return selectionComponentMixed(
      this.engine.world(),
      this.selection.selectedIds(),
      'MediaVolume',
    );
  });

  setMediaDensity(density: number): void {
    this.updateMedia({ density }, { coalesce: true });
  }

  updateMedia(patch: Partial<MediaVolume>, opts?: { coalesce?: boolean }): void {
    const ids = this.selection.selectedIds().filter((id) =>
      this.engine.world().has(id, 'MediaVolume'),
    );
    patchSelectedComponents({
      engine: this.engine,
      ids,
      component: 'MediaVolume',
      label: 'Közeg',
      coalesce: opts?.coalesce,
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
