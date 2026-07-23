import {
  AfterViewInit,
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  ViewChild,
  effect,
  inject,
  signal,
} from '@angular/core';
import { clampRange } from '@engine';
import { EngineHostService } from '../../core/services/engine-host.service';
import { EditorFacade } from '../../core/services/editor-facade.service';
import { LocalizationService } from '../../core/services/localization.service';
import { DisplayResponseCurveComponent } from '../../shared/editor/display-response-curve/display-response-curve.component';
import { RenderSettingsPanelComponent } from '../../shared/editor/render-settings-panel/render-settings-panel.component';
import { NoiseEditorComponent } from '../../shared/editor/noise-editor/noise-editor.component';
import { StudioModalComponent } from '../../shared/editor/studio-modal/studio-modal.component';
import {
  HierarchyPanelComponent,
  type HierarchyContextAction,
} from '../../shared/editor/hierarchy-panel/hierarchy-panel.component';
import { InspectorPanelComponent } from '../../shared/editor/inspector-panel/inspector-panel.component';
import { ScienceReadoutComponent } from '../../shared/editor/science-readout/science-readout.component';
import { ViewportAxesComponent } from '../../shared/editor/viewport-axes/viewport-axes.component';
import { editorUndoShortcut } from '@engine';
import { NoiseVolumeService } from '../../core/editor/noise-volume.service';

@Component({
  selector: 'app-light-studio',
  standalone: true,
  imports: [
    HierarchyPanelComponent,
    InspectorPanelComponent,
    ScienceReadoutComponent,
    ViewportAxesComponent,
    DisplayResponseCurveComponent,
    RenderSettingsPanelComponent,
    NoiseEditorComponent,
    StudioModalComponent,
  ],
  templateUrl: './light-studio.component.html',
  styleUrl: './light-studio.component.scss',
})
export class LightStudioComponent implements AfterViewInit, OnDestroy {
  readonly engine = inject(EngineHostService);
  readonly editor = inject(EditorFacade);
  readonly l10n = inject(LocalizationService);
  readonly noiseVolume = inject(NoiseVolumeService);

  @ViewChild('viewport', { static: true }) viewportRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('fileInput', { static: true }) fileInput!: ElementRef<HTMLInputElement>;
  @ViewChild(ViewportAxesComponent) axes?: ViewportAxesComponent;

  leftWidth = signal(280);
  rightWidth = signal(340);
  visionModalOpen = signal(false);
  scenesModalOpen = signal(false);
  sceneLoading = signal(false);
  renderModalOpen = signal(false);
  noiseModalOpen = signal(false);
  selectedLibraryId = signal<string | null>(null);
  private resizeSide: 'left' | 'right' | null = null;
  private resizeStartX = 0;
  private resizeStartW = 0;

  constructor() {
    effect(() => {
      const pose = this.engine.cameraPose();
      if (pose && this.editor.isEditMode()) {
        this.axes?.update(pose);
      }
    });
    effect(() => {
      const active = this.editor.activeSceneId();
      if (active) this.selectedLibraryId.set(active);
    });
  }

  ngAfterViewInit(): void {
    this.engine.attach(this.viewportRef.nativeElement);
    this.noiseVolume.syncToHost();
    this.assignDefaultNoiseAssets();
  }

  /** First-run / legacy scenes: attach the default library noise when media has none. */
  private assignDefaultNoiseAssets(): void {
    const first = this.noiseVolume.libraryMeta()[0];
    if (!first) return;
    this.engine.mutate((world) => {
      for (const id of world.query('MediaVolume')) {
        const m = world.get(id, 'MediaVolume');
        if (!m || m.noiseAssetId) continue;
        world.set(id, 'MediaVolume', { ...m, noiseAssetId: first.id });
      }
    });
  }

  ngOnDestroy(): void {
    this.engine.disposeHost();
  }

  @HostListener('document:keydown', ['$event'])
  onKey(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    const typing =
      target &&
      (target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable);

    if (!typing && (event.key === 'Delete' || event.key === 'Backspace')) {
      if (this.editor.isEditMode() && this.editor.selectionCount() > 0) {
        event.preventDefault();
        this.editor.deleteSelected();
      }
      return;
    }

    if (!typing && event.key === 'F2') {
      if (this.editor.isEditMode() && this.editor.selectionCount() === 1) {
        event.preventDefault();
        this.editor.renameInteractive();
      }
      return;
    }

    const undoAction = editorUndoShortcut(event);
    if (undoAction === 'undo') {
      event.preventDefault();
      this.engine.undo();
      return;
    }
    if (undoAction === 'redo') {
      event.preventDefault();
      this.engine.redo();
      return;
    }

    const mod = event.ctrlKey || event.metaKey;
    if (!mod || event.altKey || typing) return;
    if (!this.editor.isEditMode()) return;

    const key = event.key.toLowerCase();
    if (key === 's') {
      event.preventDefault();
      this.saveCurrent();
      return;
    }
    if (key === 'c') {
      event.preventDefault();
      this.editor.copySelected();
      return;
    }
    if (key === 'x') {
      event.preventDefault();
      this.editor.cutSelected();
      return;
    }
    if (key === 'v') {
      event.preventDefault();
      this.editor.pasteInto();
      return;
    }
    if (key === 'd') {
      event.preventDefault();
      this.editor.duplicateSelected();
      return;
    }
    if (key === 'n') {
      event.preventDefault();
      const id = this.editor.selectedId();
      if (id) this.editor.addBelow(id);
      else this.editor.addEmpty();
    }
  }

  onHierarchyContext(event: { action: HierarchyContextAction; nodeId: string }): void {
    const { action, nodeId } = event;
    switch (action) {
      case 'add':
        this.editor.addBelow(nodeId);
        break;
      case 'addSmoke':
        this.editor.addSmokeEmitterBelow(nodeId);
        break;
      case 'addSun':
        this.editor.addSunBelow(nodeId);
        break;
      case 'rename':
        this.editor.renameInteractive(nodeId);
        break;
      case 'copy':
        this.editor.copySelected(nodeId);
        break;
      case 'cut':
        this.editor.cutSelected(nodeId);
        break;
      case 'paste':
        this.editor.pasteInto(nodeId);
        break;
      case 'duplicate':
        this.editor.duplicateSelected(nodeId);
        break;
      case 'delete':
        this.editor.deleteSelected(nodeId);
        break;
    }
  }

  startResize(side: 'left' | 'right', event: MouseEvent): void {
    event.preventDefault();
    this.resizeSide = side;
    this.resizeStartX = event.clientX;
    this.resizeStartW = side === 'left' ? this.leftWidth() : this.rightWidth();
    const move = (e: MouseEvent) => {
      if (!this.resizeSide) return;
      const dx = e.clientX - this.resizeStartX;
      const max = Math.floor(window.innerWidth * 0.4);
      if (this.resizeSide === 'left') {
        this.leftWidth.set(clampRange(this.resizeStartW + dx, 200, max));
      } else {
        this.rightWidth.set(clampRange(this.resizeStartW - dx, 240, max));
      }
    };
    const up = () => {
      this.resizeSide = null;
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  }

  openScenes(): void {
    const active = this.editor.activeSceneId();
    this.selectedLibraryId.set(active);
    this.scenesModalOpen.set(true);
  }

  saveCurrent(): void {
    const activeId = this.editor.activeSceneId();
    if (activeId) {
      this.editor.saveToLibrary({
        id: activeId,
        label: this.editor.activeSceneLabel() || undefined,
      });
      this.selectedLibraryId.set(activeId);
      return;
    }
    const label = this.promptName(this.editor.activeSceneLabel() || undefined);
    if (label === null) return;
    this.editor.saveToLibrary({ label: label || undefined });
    this.selectedLibraryId.set(this.editor.activeSceneId());
  }

  saveAsNew(): void {
    const label = this.promptName(this.editor.activeSceneLabel() || undefined);
    if (label === null) return;
    this.editor.saveToLibrary({ label: label || undefined, asNew: true });
    this.selectedLibraryId.set(this.editor.activeSceneId());
  }

  onScenesDismiss(): void {
    if (this.sceneLoading()) return;
    this.scenesModalOpen.set(false);
  }

  async loadSelected(): Promise<void> {
    const id = this.selectedLibraryId();
    if (!id || this.sceneLoading()) return;
    this.sceneLoading.set(true);
    try {
      // Let the spinner paint before synchronous world replace blocks the main thread.
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
      this.editor.loadFromLibrary(id);
    } finally {
      this.scenesModalOpen.set(false);
      this.sceneLoading.set(false);
    }
  }

  renameSelected(): void {
    const id = this.selectedLibraryId();
    if (!id) return;
    const current =
      this.editor.sceneList().find((s) => s.id === id)?.label ?? this.editor.activeSceneLabel();
    const label = this.promptName(current);
    if (label === null || !label.trim()) return;
    this.editor.renameInLibrary(id, label.trim());
  }

  deleteSelected(): void {
    const id = this.selectedLibraryId();
    if (!id) return;
    if (!window.confirm(this.l10n.t('sceneDeleteConfirm'))) return;
    this.editor.deleteFromLibrary(id);
    this.selectedLibraryId.set(this.editor.activeSceneId());
  }

  exportFile(): void {
    this.editor.exportSceneFile();
  }

  importClick(): void {
    this.fileInput.nativeElement.click();
  }

  async onFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    await this.editor.importSceneFile(file);
    this.selectedLibraryId.set(this.editor.activeSceneId());
    input.value = '';
  }

  resetDemo(): void {
    this.editor.resetDemo();
    this.selectedLibraryId.set(null);
  }

  screenshot(): void {
    this.editor.screenshot();
  }

  formatUpdated(ms: number): string {
    try {
      return new Date(ms).toLocaleString(this.l10n.locale() === 'hu' ? 'hu-HU' : 'en-GB', {
        dateStyle: 'short',
        timeStyle: 'short',
      });
    } catch {
      return '';
    }
  }

  private promptName(initial?: string): string | null {
    const raw = window.prompt(this.l10n.t('sceneNamePrompt'), initial ?? '');
    if (raw === null) return null;
    return raw.trim();
  }
}
