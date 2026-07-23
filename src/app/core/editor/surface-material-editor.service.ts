import { Injectable, computed, inject } from '@angular/core';
import {
  normalizeSurfaceMaterial,
  setSurfaceMaterialCommand,
  type SurfaceMaterial,
} from '@engine';
import { EngineHostService } from '../services/engine-host.service';
import { SelectionService } from './selection.service';
import {
  patchSelectedComponents,
  selectionComponentMixed,
  selectionComponentPrimary,
} from './patch-component';

@Injectable({ providedIn: 'root' })
export class SurfaceMaterialEditorService {
  private readonly engine = inject(EngineHostService);
  private readonly selection = inject(SelectionService);

  readonly selectedSurfaceMaterial = computed(() => {
    this.engine.epoch();
    return selectionComponentPrimary(
      this.engine.world(),
      this.selection.selectedIds(),
      'SurfaceMaterial',
    );
  });

  readonly selectedSurfaceMaterialMixed = computed(() => {
    this.engine.epoch();
    return selectionComponentMixed(
      this.engine.world(),
      this.selection.selectedIds(),
      'SurfaceMaterial',
    );
  });

  updateSurfaceMaterial(patch: Partial<SurfaceMaterial>, opts?: { coalesce?: boolean }): void {
    const ids = this.selection.selectedIds().filter((id) =>
      this.engine.world().has(id, 'SurfaceMaterial'),
    );
    patchSelectedComponents({
      engine: this.engine,
      ids,
      component: 'SurfaceMaterial',
      label: 'Felület anyag',
      coalesce: opts?.coalesce,
      merge: (before) => normalizeSurfaceMaterial({ ...before, ...patch }),
      singleCommand: setSurfaceMaterialCommand,
    });
  }
}
