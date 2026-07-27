import { Injectable, computed, inject } from '@angular/core';
import {
  setSmokeEmitterCommand,
  writeSmokeEmitter,
  type EntityId,
  type SmokeEmitter,
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
export class SmokeEmitterEditorService {
  private readonly engine = inject(EngineHostService);
  private readonly selection = inject(SelectionService);

  readonly selectedSmoke = computed(() => {
    this.engine.epoch();
    this.engine.selectionRevision();
    return selectionComponentPrimary(
      this.engine.world(),
      this.selection.selectedIds(),
      'SmokeEmitter',
    );
  });

  readonly selectedSmokeMixed = computed(() => {
    this.engine.epoch();
    this.engine.selectionRevision();
    return selectionComponentMixed(
      this.engine.world(),
      this.selection.selectedIds(),
      'SmokeEmitter',
    );
  });

  updateSmoke(
    patch: Partial<SmokeEmitter>,
    opts?: { coalesce?: boolean; entityIds?: readonly EntityId[] },
  ): void {
    const world = this.engine.world();
    const ids = resolvePatchTargetIds(
      world,
      'SmokeEmitter',
      opts?.entityIds ?? this.selection.selectedIds(),
    );
    patchSelectedComponents({
      engine: this.engine,
      ids,
      component: 'SmokeEmitter',
      label: 'Füstszóró',
      multiLabel: 'Füstszóró',
      // Multi-edit historically never coalesced; keep that behavior.
      coalesce: ids.length === 1 ? opts?.coalesce : false,
      writeComponent: writeSmokeEmitter,
      merge: (before) => ({
        ...structuredClone(before),
        ...patch,
      }),
      singleCommand: setSmokeEmitterCommand,
      multiRecord: 'applied',
    });
  }
}
