import { Injectable, computed, inject, signal } from '@angular/core';
import {
  buildHierarchyTree,
  captureEntityForest,
  createEmptyEntityCommand,
  createSmokeEmitterCommand,
  createSunEntityCommand,
  deleteEntitiesCommand,
  duplicateEntitiesCommand,
  pasteEntityCommand,
  reorderHierarchyCommand,
  reorderHierarchyMultiCommand,
  setNameCommand,
  setNamesCommand,
  setViewportHiddenCommand,
  type HierarchyClipboardNode,
  type HierarchyReorderEvent,
} from '@engine';
import { EngineHostService } from '../services/engine-host.service';
import { SelectionService } from './selection.service';
import { LocalizationService } from '../services/localization.service';

@Injectable({ providedIn: 'root' })
export class HierarchyEditorService {
  private readonly engine = inject(EngineHostService);
  private readonly selection = inject(SelectionService);
  private readonly l10n = inject(LocalizationService);

  private readonly clipboard = signal<HierarchyClipboardNode[]>([]);
  /** Transient editor notice (e.g. suppressed second sun). */
  readonly notice = signal<string | null>(null);
  private noticeTimer: ReturnType<typeof setTimeout> | null = null;

  readonly hierarchyTree = computed(() => {
    this.engine.epoch();
    return buildHierarchyTree(this.engine.world());
  });

  readonly hasClipboard = computed(() => this.clipboard().length > 0);

  showNotice(message: string, ms = 6000): void {
    if (this.noticeTimer) clearTimeout(this.noticeTimer);
    this.notice.set(message);
    this.noticeTimer = setTimeout(() => {
      this.notice.set(null);
      this.noticeTimer = null;
    }, ms);
  }

  clearNotice(): void {
    if (this.noticeTimer) clearTimeout(this.noticeTimer);
    this.noticeTimer = null;
    this.notice.set(null);
  }

  worldHidden = (id: string): boolean => {
    return this.engine.world().get(id, 'ViewportHidden')?.hidden ?? false;
  };

  canMutate(id: string | null | undefined): boolean {
    if (!id) return false;
    const flags = this.engine.world().get(id, 'EditorFlags');
    return !flags?.isSceneRoot && !flags?.locked;
  }

  canPasteInto(id: string | null | undefined): boolean {
    if (!this.clipboard().length) return false;
    if (!id) return true;
    const flags = this.engine.world().get(id, 'EditorFlags');
    if (flags?.isSceneRoot) return true;
    return !flags?.locked;
  }

  private mutableSelection(extraId?: string | null): string[] {
    const ids = extraId
      ? this.selection.selectedIds().includes(extraId)
        ? this.selection.selectedIds()
        : [extraId]
      : this.selection.selectedIds();
    return ids.filter((id) => this.canMutate(id));
  }

  reorder(event: HierarchyReorderEvent): void {
    const selected = this.selection.selectedIds();
    if (selected.includes(event.sourceId) && selected.length > 1) {
      const cmd = reorderHierarchyMultiCommand(
        this.engine.world(),
        selected,
        event.targetId,
        event.position,
      );
      if (cmd) this.engine.commitApplied(cmd);
      return;
    }
    const cmd = reorderHierarchyCommand(
      this.engine.world(),
      event.sourceId,
      event.targetId,
      event.position,
    );
    if (cmd) this.engine.commitApplied(cmd);
  }

  addEmpty(parentId: string | null = null): void {
    const world = this.engine.world();
    const sceneRoot =
      world.allEntities().find((id) => world.get(id, 'EditorFlags')?.isSceneRoot) ?? null;
    const parent = parentId ?? sceneRoot;
    const cmd = createEmptyEntityCommand(world, 'Üres objektum', parent);
    this.engine.commitApplied(cmd);
  }

  addSmokeEmitter(parentId: string | null = null): void {
    const world = this.engine.world();
    const sceneRoot =
      world.allEntities().find((id) => world.get(id, 'EditorFlags')?.isSceneRoot) ?? null;
    const parent = parentId ?? sceneRoot;
    const cmd = createSmokeEmitterCommand(world, 'Füstszóró', parent);
    this.engine.commitApplied(cmd);
  }

  addSun(parentId: string | null = null): void {
    const world = this.engine.world();
    const sceneRoot =
      world.allEntities().find((id) => world.get(id, 'EditorFlags')?.isSceneRoot) ?? null;
    const parent = parentId ?? sceneRoot;
    const { command, suppressed } = createSunEntityCommand(world, 'Sun', parent);
    this.engine.commitApplied(command);
    if (suppressed) {
      this.showNotice(this.l10n.t('warnSecondSun'));
    }
  }

  addBelow(parentId: string): void {
    const cmd = createEmptyEntityCommand(this.engine.world(), 'Üres objektum', parentId);
    this.engine.commitApplied(cmd);
  }

  addSmokeEmitterBelow(parentId: string): void {
    const cmd = createSmokeEmitterCommand(this.engine.world(), 'Füstszóró', parentId);
    this.engine.commitApplied(cmd);
  }

  addSunBelow(parentId: string): void {
    const { command, suppressed } = createSunEntityCommand(
      this.engine.world(),
      'Sun',
      parentId,
    );
    this.engine.commitApplied(command);
    if (suppressed) {
      this.showNotice(this.l10n.t('warnSecondSun'));
    }
  }

  deleteSelected(id?: string | null): void {
    const targets = this.mutableSelection(id);
    if (!targets.length) return;
    const cmd = deleteEntitiesCommand(this.engine.world(), targets);
    if (cmd) this.engine.commitApplied(cmd);
  }

  setVisibility(id: string, visible: boolean): void {
    const cmd = setViewportHiddenCommand(this.engine.world(), id, !visible);
    this.engine.executeCommand(cmd);
  }

  rename(name: string): void {
    const ids = this.selection.selectedIds();
    if (!ids.length) return;
    const world = this.engine.world();
    if (ids.length === 1) {
      const id = ids[0]!;
      const before = world.get(id, 'Name')?.value ?? '';
      this.engine.executeCommand(setNameCommand(world, id, before, name));
      return;
    }
    const entries = ids.map((entityId) => ({
      entityId,
      before: world.get(entityId, 'Name')?.value ?? '',
      after: name,
    }));
    const cmd = setNamesCommand(world, entries);
    if (cmd) this.engine.executeCommand(cmd);
  }

  renameInteractive(id?: string | null): void {
    const target = id ?? this.selection.selectedId();
    if (!target) return;
    if (this.selection.selectedIds().length > 1 && !id) return;
    this.selection.select(target);
    const before = this.engine.world().get(target, 'Name')?.value ?? '';
    const next = window.prompt('Átnevezés', before);
    if (next === null) return;
    const trimmed = next.trim();
    if (!trimmed || trimmed === before) return;
    this.engine.executeCommand(setNameCommand(this.engine.world(), target, before, trimmed));
  }

  copy(id?: string | null): boolean {
    const targets = this.mutableSelection(id);
    if (!targets.length) return false;
    const forest = captureEntityForest(this.engine.world(), targets);
    if (!forest.length) return false;
    this.clipboard.set(forest);
    return true;
  }

  cut(id?: string | null): void {
    const targets = this.mutableSelection(id);
    if (!targets.length) return;
    if (!this.copy(id)) return;
    this.deleteSelected(id);
  }

  paste(parentId?: string | null): void {
    const clip = this.clipboard();
    if (!clip.length) return;
    const world = this.engine.world();
    let parent = parentId ?? this.selection.selectedId();
    if (parent && !this.canPasteInto(parent)) {
      parent = world.allEntities().find((eid) => world.get(eid, 'EditorFlags')?.isSceneRoot) ?? null;
    }
    if (parent === null) {
      parent = world.allEntities().find((eid) => world.get(eid, 'EditorFlags')?.isSceneRoot) ?? null;
    }
    const cmd = pasteEntityCommand(world, clip, parent);
    if (cmd) this.engine.commitApplied(cmd);
  }

  duplicate(id?: string | null): void {
    const targets = this.mutableSelection(id);
    if (!targets.length) return;
    const world = this.engine.world();
    const hadSun = targets.some((tid) => {
      const em = world.get(tid, 'LightEmitter');
      return em?.params.mode === 'sun';
    });
    const cmd = duplicateEntitiesCommand(world, targets);
    if (cmd) this.engine.commitApplied(cmd);
    if (hadSun) {
      this.showNotice(this.l10n.t('warnSecondSun'));
    }
  }
}
