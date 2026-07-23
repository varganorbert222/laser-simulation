import { Injectable, computed, inject } from '@angular/core';
import {
  normalizeEditorSelection,
  type SelectionMode,
} from '@engine';
import { EngineHostService } from '../services/engine-host.service';

export interface SelectOptions {
  mode?: SelectionMode;
  rangeOrder?: readonly string[];
}

@Injectable({ providedIn: 'root' })
export class SelectionService {
  private readonly engine = inject(EngineHostService);

  readonly selectedId = computed(() => {
    this.engine.epoch();
    return normalizeEditorSelection(this.engine.world().resources.EditorSelection).entityId;
  });

  readonly selectedIds = computed(() => {
    this.engine.epoch();
    return normalizeEditorSelection(this.engine.world().resources.EditorSelection).entityIds;
  });

  readonly selectionCount = computed(() => this.selectedIds().length);

  isSelected(id: string): boolean {
    return this.selectedIds().includes(id);
  }

  select(id: string | null, opts?: SelectOptions): void {
    this.engine.select(id, opts);
  }

  selectMany(ids: string[], primary?: string | null): void {
    this.engine.selectMany(ids, primary);
  }

  clear(): void {
    this.engine.select(null);
  }
}
