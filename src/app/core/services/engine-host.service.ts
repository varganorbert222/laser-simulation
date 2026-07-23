import { Injectable, inject, signal } from '@angular/core';
import {
  EditHistory,
  StudioRuntime,
  applySelection,
  normalizeEditorSelection,
  setTransformCommand,
  setTransformsCommand,
  type CameraPose,
  type Command,
  type SelectionMode,
  type Transform,
  type World,
} from '@engine';
import { BabylonPresenter } from '@adapters/babylon';
import { SceneLibraryService } from '../editor/scene-library.service';

export interface HostSelectOptions {
  mode?: SelectionMode;
  rangeOrder?: readonly string[];
  /** Modifier keys from pointer event (viewport). */
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
}

@Injectable({ providedIn: 'root' })
export class EngineHostService {
  private readonly sceneLibrary = inject(SceneLibraryService);

  readonly world = signal<World>(this.sceneLibrary.resolveStartupWorld());
  readonly epoch = signal(0);
  readonly canUndo = signal(false);
  readonly canRedo = signal(false);
  readonly undoLabel = signal<string | null>(null);
  readonly redoLabel = signal<string | null>(null);
  readonly cameraPose = signal<CameraPose | null>(null);
  /**
   * Bumped while atmosphere time-of-day animation runs so Angular UI can track
   * civil clock without a full world epoch / mesh rebuild.
   */
  readonly atmosphereRevision = signal(0);
  /** True while the Babylon host warms up / waits for shader compile before the render loop. */
  readonly shadersCompiling = signal(false);
  readonly shaderCompileReady = signal(0);
  readonly shaderCompileTotal = signal(0);

  readonly history = new EditHistory(() => this.syncHistorySignals());
  private runtime: StudioRuntime | null = null;
  private presenter: BabylonPresenter | null = null;

  attach(canvas: HTMLCanvasElement): BabylonPresenter {
    this.disposeHost();
    const world = this.world();
    this.shadersCompiling.set(true);
    this.shaderCompileReady.set(0);
    this.shaderCompileTotal.set(0);
    this.runtime = new StudioRuntime(world);
    this.presenter = new BabylonPresenter({
      canvas,
      world,
      onPick: (entityId, mods) => this.select(entityId, mods),
      onTransformDragStart: (entityId) => this.beginGizmoDrag(entityId),
      onTransformDragEnd: (entityId, transform) => this.applyGizmoTransform(entityId, transform),
      onFrame: (pose) => this.cameraPose.set(pose),
      onTick: (dt) => {
        const epochBefore = this.world().resources.epoch;
        this.runtime?.tick(dt);
        if (this.world().resources.epoch !== epochBefore) {
          this.tickEpoch();
        }
        if (this.world().resources.Atmosphere?.timeAnimating) {
          this.atmosphereRevision.update((n) => n + 1);
        }
      },
      onShaderCompileStatus: (status) => {
        this.shadersCompiling.set(status.compiling);
        this.shaderCompileReady.set(status.ready);
        this.shaderCompileTotal.set(status.total);
      },
    });
    this.runtime.setPresenter(this.presenter);
    this.tickEpoch();
    return this.presenter;
  }

  getHost(): BabylonPresenter | null {
    return this.presenter;
  }

  getRuntime(): StudioRuntime | null {
    return this.runtime;
  }

  disposeHost(): void {
    this.runtime?.dispose();
    this.runtime = null;
    this.presenter = null;
    this.shadersCompiling.set(false);
    this.shaderCompileReady.set(0);
    this.shaderCompileTotal.set(0);
  }

  replaceWorld(world: World): void {
    this.world.set(world);
    this.history.clear();
    this.gizmoBefore = null;
    this.gizmoEntityId = null;
    this.runtime?.setWorld(world);
    this.tickEpoch();
  }

  mutate(fn: (world: World) => void): void {
    fn(this.world());
    this.presenter?.applyPresentationMode();
    this.tickEpoch();
  }

  select(entityId: string | null, opts?: HostSelectOptions): void {
    const w = this.world();
    const cur = normalizeEditorSelection(w.resources.EditorSelection);
    let mode: SelectionMode = opts?.mode ?? 'replace';
    if (opts?.ctrlKey || opts?.metaKey) mode = 'toggle';
    else if (opts?.shiftKey && opts.rangeOrder) mode = 'range';

    if (
      mode === 'replace' &&
      entityId === cur.entityId &&
      cur.entityIds.length <= 1 &&
      (entityId === null ? cur.entityIds.length === 0 : cur.entityIds[0] === entityId)
    ) {
      return;
    }

    this.history.flushPending();
    applySelection(w, entityId, {
      mode,
      rangeOrder: opts?.rangeOrder,
    });
    this.presenter?.applyPresentationMode();
    this.tickEpoch();
  }

  selectMany(ids: string[], primary?: string | null): void {
    const w = this.world();
    this.history.flushPending();
    const unique = [...new Set(ids)];
    if (!unique.length) {
      applySelection(w, null);
    } else {
      const prim = primary && unique.includes(primary) ? primary : unique[unique.length - 1]!;
      applySelection(w, { entityId: prim, entityIds: unique });
    }
    this.presenter?.applyPresentationMode();
    this.tickEpoch();
  }

  runCommand(command: Command | null): void {
    this.commitApplied(command);
  }

  commitApplied(command: Command | null): void {
    if (!command) return;
    this.history.pushApplied(command);
    this.presenter?.applyPresentationMode();
    this.tickEpoch();
  }

  executeCommand(command: Command | null): void {
    if (!command) return;
    this.history.run(command);
    this.presenter?.applyPresentationMode();
    this.tickEpoch();
  }

  coalesceSnapshot<T>(opts: {
    key: string;
    label: string;
    before: T;
    after: T;
    apply: (value: T) => void;
  }): void {
    this.history.coalesceSnapshot(opts);
    this.presenter?.applyPresentationMode();
    this.tickEpoch();
  }

  undo(): void {
    if (this.history.undo()) {
      this.runtime?.setWorld(this.world());
      this.presenter?.applyPresentationMode();
      this.tickEpoch();
    }
  }

  redo(): void {
    if (this.history.redo()) {
      this.runtime?.setWorld(this.world());
      this.presenter?.applyPresentationMode();
      this.tickEpoch();
    }
  }

  tickEpoch(): void {
    this.epoch.set(this.world().resources.epoch);
    this.syncHistorySignals();
  }

  screenshot(): void {
    const dataUrl = this.presenter?.screenshotPng();
    if (!dataUrl) return;
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `light-studio-${Date.now()}.png`;
    a.click();
  }

  /** Orientation gizmo drag — Blender-like orbit. */
  orbitViewport(dx: number, dy: number): void {
    this.presenter?.orbitCamera(dx, dy);
  }

  /** Orientation gizmo axis click — snap camera to world axis. */
  snapViewportAxis(axis: 'x' | 'y' | 'z', opposite = false): void {
    this.presenter?.snapCameraAxis(axis, opposite);
  }

  private gizmoBefore: Transform | null = null;
  private gizmoEntityId: string | null = null;
  /** Transforms of all selected entities at drag start (for multi-move). */
  private gizmoSelectionBefore = new Map<string, Transform>();

  private syncHistorySignals(): void {
    this.canUndo.set(this.history.canUndo);
    this.canRedo.set(this.history.canRedo);
    this.undoLabel.set(this.history.undoLabel);
    this.redoLabel.set(this.history.redoLabel);
  }

  private beginGizmoDrag(entityId: string): void {
    const world = this.world();
    const t = world.get(entityId, 'Transform');
    this.gizmoEntityId = entityId;
    this.gizmoBefore = t ? structuredClone(t) : null;
    this.gizmoSelectionBefore.clear();
    const ids = normalizeEditorSelection(world.resources.EditorSelection).entityIds;
    const targets = ids.length ? ids : [entityId];
    for (const id of targets) {
      const tr = world.get(id, 'Transform');
      if (tr) this.gizmoSelectionBefore.set(id, structuredClone(tr));
    }
  }

  private applyGizmoTransform(entityId: string, after: Transform): void {
    const world = this.world();
    const primaryBefore =
      this.gizmoEntityId === entityId && this.gizmoBefore
        ? this.gizmoBefore
        : world.get(entityId, 'Transform');
    const selectionBefore = new Map(this.gizmoSelectionBefore);
    this.gizmoBefore = null;
    this.gizmoEntityId = null;
    this.gizmoSelectionBefore.clear();
    if (!primaryBefore) return;
    if (JSON.stringify(primaryBefore) === JSON.stringify(after)) return;

    if (selectionBefore.size <= 1) {
      this.history.run(setTransformCommand(world, entityId, primaryBefore, after));
      this.tickEpoch();
      return;
    }

    const dPos: [number, number, number] = [
      after.position[0] - primaryBefore.position[0],
      after.position[1] - primaryBefore.position[1],
      after.position[2] - primaryBefore.position[2],
    ];
    const entries: { entityId: string; before: Transform; after: Transform }[] = [];
    for (const [id, before] of selectionBefore) {
      if (id === entityId) {
        entries.push({ entityId: id, before, after: structuredClone(after) });
        continue;
      }
      entries.push({
        entityId: id,
        before,
        after: {
          position: [
            before.position[0] + dPos[0],
            before.position[1] + dPos[1],
            before.position[2] + dPos[2],
          ],
          // Keep relative rotation/scale; primary gets absolute after from gizmo.
          rotation: [...before.rotation] as Transform['rotation'],
          scale: [...before.scale] as Transform['scale'],
        },
      });
    }
    const cmd = setTransformsCommand(world, entries);
    if (cmd) this.history.run(cmd);
    this.tickEpoch();
  }
}
