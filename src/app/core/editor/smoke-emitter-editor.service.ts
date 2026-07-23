import { Injectable, computed, inject } from '@angular/core';
import { setSmokeEmitterCommand, type SmokeEmitter } from '@engine';
import { EngineHostService } from '../services/engine-host.service';
import { SelectionService } from './selection.service';
import {
  patchSelectedComponents,
  selectionComponentMixed,
  selectionComponentPrimary,
} from './patch-component';

@Injectable({ providedIn: 'root' })
export class SmokeEmitterEditorService {
  private readonly engine = inject(EngineHostService);
  private readonly selection = inject(SelectionService);

  readonly selectedSmoke = computed(() => {
    this.engine.epoch();
    return selectionComponentPrimary(
      this.engine.world(),
      this.selection.selectedIds(),
      'SmokeEmitter',
    );
  });

  readonly selectedSmokeMixed = computed(() => {
    this.engine.epoch();
    return selectionComponentMixed(
      this.engine.world(),
      this.selection.selectedIds(),
      'SmokeEmitter',
    );
  });

  updateSmoke(patch: Partial<SmokeEmitter>, opts?: { coalesce?: boolean }): void {
    const ids = this.selection.selectedIds().filter((id) =>
      this.engine.world().has(id, 'SmokeEmitter'),
    );
    patchSelectedComponents({
      engine: this.engine,
      ids,
      component: 'SmokeEmitter',
      label: 'Füstszóró',
      multiLabel: 'Füstszóró',
      // Multi-edit historically never coalesced; keep that behavior.
      coalesce: ids.length === 1 ? opts?.coalesce : false,
      merge: (before) => ({
        ...structuredClone(before),
        ...patch,
      }),
      singleCommand: setSmokeEmitterCommand,
      multiRecord: 'applied',
    });
  }
}
