import { Injectable, computed, inject } from '@angular/core';
import {
  setFogVolumeCommand,
  writeFogVolume,
  type EntityId,
  type FogVolume,
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
export class FogEditorService {
  private readonly engine = inject(EngineHostService);
  private readonly selection = inject(SelectionService);

  readonly selectedFog = computed(() => {
    this.engine.epoch();
    this.engine.selectionRevision();
    return selectionComponentPrimary(
      this.engine.world(),
      this.selection.selectedIds(),
      'FogVolume',
    );
  });

  readonly selectedFogMixed = computed(() => {
    this.engine.epoch();
    this.engine.selectionRevision();
    return selectionComponentMixed(
      this.engine.world(),
      this.selection.selectedIds(),
      'FogVolume',
    );
  });

  updateFog(
    patch: Partial<FogVolume>,
    opts?: { coalesce?: boolean; entityIds?: readonly EntityId[] },
  ): void {
    const world = this.engine.world();
    const ids = resolvePatchTargetIds(
      world,
      'FogVolume',
      opts?.entityIds ?? this.selection.selectedIds(),
    );
    patchSelectedComponents({
      engine: this.engine,
      ids,
      component: 'FogVolume',
      label: 'Füst',
      coalesce: opts?.coalesce,
      writeComponent: writeFogVolume,
      merge: (before) => ({
        ...structuredClone(before),
        ...patch,
        color: patch.color ? ([...patch.color] as FogVolume['color']) : before.color,
        halfExtents: patch.halfExtents
          ? ([...patch.halfExtents] as FogVolume['halfExtents'])
          : before.halfExtents,
      }),
      singleCommand: setFogVolumeCommand,
    });
  }
}
