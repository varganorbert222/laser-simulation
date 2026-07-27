import { Injectable, computed, inject } from '@angular/core';
import {
  setFluidVolumeCommand,
  writeFluidVolume,
  type EntityId,
  type FluidVolume,
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
export class FluidEditorService {
  private readonly engine = inject(EngineHostService);
  private readonly selection = inject(SelectionService);

  readonly selectedFluid = computed(() => {
    this.engine.epoch();
    this.engine.selectionRevision();
    return selectionComponentPrimary(
      this.engine.world(),
      this.selection.selectedIds(),
      'FluidVolume',
    );
  });

  readonly selectedFluidMixed = computed(() => {
    this.engine.epoch();
    this.engine.selectionRevision();
    return selectionComponentMixed(
      this.engine.world(),
      this.selection.selectedIds(),
      'FluidVolume',
    );
  });

  updateFluid(
    patch: Partial<FluidVolume>,
    opts?: { coalesce?: boolean; entityIds?: readonly EntityId[] },
  ): void {
    const world = this.engine.world();
    const ids = resolvePatchTargetIds(
      world,
      'FluidVolume',
      opts?.entityIds ?? this.selection.selectedIds(),
    );
    patchSelectedComponents({
      engine: this.engine,
      ids,
      component: 'FluidVolume',
      label: 'Fluid',
      coalesce: opts?.coalesce,
      writeComponent: writeFluidVolume,
      merge: (before) => ({
        ...structuredClone(before),
        ...patch,
        color: patch.color ? ([...patch.color] as FluidVolume['color']) : before.color,
        halfExtents: patch.halfExtents
          ? ([...patch.halfExtents] as FluidVolume['halfExtents'])
          : before.halfExtents,
      }),
      singleCommand: setFluidVolumeCommand,
    });
  }
}
