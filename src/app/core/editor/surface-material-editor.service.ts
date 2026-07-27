import { Injectable, computed, inject } from '@angular/core';
import {
  isSurfaceFinishPreset,
  normalizeSurfaceMaterial,
  setSurfaceMaterialCommand,
  surfaceMaterialFromPreset,
  writeSurfaceMaterial,
  type EntityId,
  type SurfaceMaterial,
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
export class SurfaceMaterialEditorService {
  private readonly engine = inject(EngineHostService);
  private readonly selection = inject(SelectionService);

  readonly selectedSurfaceMaterial = computed(() => {
    this.engine.epoch();
    this.engine.selectionRevision();
    return selectionComponentPrimary(
      this.engine.world(),
      this.selection.selectedIds(),
      'SurfaceMaterial',
    );
  });

  readonly selectedSurfaceMaterialMixed = computed(() => {
    this.engine.epoch();
    this.engine.selectionRevision();
    return selectionComponentMixed(
      this.engine.world(),
      this.selection.selectedIds(),
      'SurfaceMaterial',
    );
  });

  updateSurfaceMaterial(
    patch: Partial<SurfaceMaterial>,
    opts?: { coalesce?: boolean; entityIds?: readonly EntityId[] },
  ): void {
    const world = this.engine.world();
    const ids = resolvePatchTargetIds(
      world,
      'SurfaceMaterial',
      opts?.entityIds ?? this.selection.selectedIds(),
    );
    patchSelectedComponents({
      engine: this.engine,
      ids,
      component: 'SurfaceMaterial',
      label: 'Felület anyag',
      coalesce: opts?.coalesce,
      writeComponent: writeSurfaceMaterial,
      merge: (before) => {
        // Named finish from the inspector always snaps to the preset table.
        // Avoid `{ ...before, preset }` keeping stale albedo under a new name.
        if (
          patch.preset &&
          patch.preset !== 'custom' &&
          isSurfaceFinishPreset(patch.preset) &&
          typeof patch.albedo === 'number' &&
          typeof patch.metalness === 'number' &&
          typeof patch.roughness === 'number'
        ) {
          return surfaceMaterialFromPreset(patch.preset);
        }
        return normalizeSurfaceMaterial({ ...before, ...patch });
      },
      singleCommand: setSurfaceMaterialCommand,
    });
  }
}
