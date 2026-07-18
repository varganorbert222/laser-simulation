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
import { EngineHostService } from '../../core/services/engine-host.service';
import { EditorFacade } from '../../core/services/editor-facade.service';
import { I18nService } from '../../i18n/i18n.service';
import { DisplayResponseCurveComponent } from '../../shared/editor/display-response-curve/display-response-curve.component';
import { StudioModalComponent } from '../../shared/editor/studio-modal/studio-modal.component';
import {
  HierarchyPanelComponent,
  type HierarchyContextAction,
} from '../../shared/editor/hierarchy-panel/hierarchy-panel.component';
import { InspectorPanelComponent } from '../../shared/editor/inspector-panel/inspector-panel.component';
import { ScienceReadoutComponent } from '../../shared/editor/science-readout/science-readout.component';
import { ViewportAxesComponent } from '../../shared/editor/viewport-axes/viewport-axes.component';
import { editorUndoShortcut } from '../../../engine';

@Component({
  selector: 'app-light-studio',
  standalone: true,
  imports: [
    HierarchyPanelComponent,
    InspectorPanelComponent,
    ScienceReadoutComponent,
    ViewportAxesComponent,
    DisplayResponseCurveComponent,
    StudioModalComponent,
  ],
  templateUrl: './light-studio.component.html',
  styleUrl: './light-studio.component.scss',
})
export class LightStudioComponent implements AfterViewInit, OnDestroy {
  readonly engine = inject(EngineHostService);
  readonly editor = inject(EditorFacade);
  readonly i18n = inject(I18nService);

  @ViewChild('viewport', { static: true }) viewportRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('fileInput', { static: true }) fileInput!: ElementRef<HTMLInputElement>;
  @ViewChild(ViewportAxesComponent) axes?: ViewportAxesComponent;

  leftWidth = signal(280);
  rightWidth = signal(340);
  visionModalOpen = signal(false);
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
  }

  ngAfterViewInit(): void {
    this.engine.attach(this.viewportRef.nativeElement);
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
      this.save();
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
        this.leftWidth.set(clamp(this.resizeStartW + dx, 200, max));
      } else {
        this.rightWidth.set(clamp(this.resizeStartW - dx, 240, max));
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

  save(): void {
    this.editor.saveScene();
  }

  loadClick(): void {
    this.fileInput.nativeElement.click();
  }

  async onFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    await this.editor.loadSceneFile(file);
    input.value = '';
  }

  resetDemo(): void {
    this.editor.resetDemo();
  }

  screenshot(): void {
    this.editor.screenshot();
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}
