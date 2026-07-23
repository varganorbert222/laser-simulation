import { ArcRotateCamera, Camera, Vector3 } from '@babylonjs/core';
import { ArcRotateCameraPointersInput } from '@babylonjs/core/Cameras/Inputs/arcRotateCameraPointersInput';
import { clampRange } from '@engine';

const MIN_BETA = 0.01;
const MAX_BETA = Math.PI - 0.01;
const ORTHO_FRUSTUM_SCALE = 0.8;
const ALIGN_EPS = 0.12;

export type WorldAxisView = 'front' | 'back' | 'right' | 'left' | 'top' | 'bottom';
export type WorldAxis = 'x' | 'y' | 'z';

export interface BlenderCameraHomeState {
  target?: Vector3;
  alpha?: number;
  beta?: number;
  radius?: number;
}

/** Camera offset from target along Babylon world axes (+X right, +Y up, +Z forward). */
const WORLD_AXIS_VIEW_OFFSETS: Record<WorldAxisView, Vector3> = {
  front: new Vector3(0, 0, 1),
  back: new Vector3(0, 0, -1),
  right: new Vector3(1, 0, 0),
  left: new Vector3(-1, 0, 0),
  top: new Vector3(0, 1, 0),
  bottom: new Vector3(0, -1, 0),
};

const AXIS_TO_VIEW: Record<WorldAxis, { positive: WorldAxisView; negative: WorldAxisView }> = {
  x: { positive: 'right', negative: 'left' },
  y: { positive: 'top', negative: 'bottom' },
  z: { positive: 'front', negative: 'back' },
};

type DragMode = 'none' | 'orbit' | 'pan';

/**
 * Blender-like pointer map for Babylon 9 InputMapper:
 * - Middle mouse: orbit
 * - Shift + Middle mouse: pan
 * - Right mouse: pan
 * - Wheel: zoom
 * - Left mouse: free (picking / gizmos)
 * - No keyboard camera bindings (numpad is ours)
 */
export function configureBlenderPointerInputs(camera: ArcRotateCamera, canvas: HTMLCanvasElement): void {
  camera.attachControl(canvas, true);
  camera._useCtrlForPanning = false;
  camera._panningMouseButton = 2;

  const input = camera.movement.input;
  input.inputMap.length = 0;
  input.addEntry({
    source: 'pointer',
    button: 1,
    modifiers: { shift: true },
    interaction: 'pan',
  });
  input.addEntry({ source: 'pointer', button: 1, interaction: 'rotate' });
  input.addEntry({ source: 'pointer', button: 2, interaction: 'pan' });
  input.addEntry({ source: 'wheel', interaction: 'zoom' });

  const pointers = camera.inputs.attached['pointers'] as ArcRotateCameraPointersInput | undefined;
  if (pointers) {
    // MMB + RMB only — LMB stays free for selection.
    pointers.buttons = [1, 2];
  }

  // Catch-all keyboard→rotate would steal Numpad 1/3/5/7/9.
  const keyboard = camera.inputs.attached['keyboard'];
  if (keyboard) {
    camera.inputs.remove(keyboard);
  }
}

/**
 * Blender-like navigation extras:
 * - Middle mouse drag: orbit (Babylon inputMap; we only block browser autoscroll)
 * - Shift + Middle mouse: pan (custom, while Babylon is detached)
 * - Wheel: zoom (perspective) / ortho frustum (orthographic)
 * - Numpad 1/3/7/9 (+ Ctrl opposite): orthographic world-axis views
 * - Numpad 5: perspective ↔ orthographic
 * - Shift+C: home reset
 */
export class BlenderCameraControls {
  private dragMode: DragMode = 'none';
  private cameraControlAttached = true;
  private lastClientX = 0;
  private lastClientY = 0;
  private activePointerId: number | null = null;
  private orthoRadius: number;
  private readonly homeState: {
    target: Vector3;
    alpha: number;
    beta: number;
    radius: number;
  };

  private readonly onPointerDown = (event: PointerEvent) => this.handlePointerDown(event);
  private readonly onPointerMove = (event: PointerEvent) => this.handlePointerMove(event);
  private readonly onPointerUp = (event: PointerEvent) => this.handlePointerUp(event);
  private readonly onAuxClick = (event: MouseEvent) => {
    if (event.button === 1) {
      event.preventDefault();
      event.stopPropagation();
    }
  };
  private readonly onKeyDown = (event: KeyboardEvent) => this.handleKeyDown(event);
  private readonly onWheel = (event: WheelEvent) => this.handleWheel(event);

  constructor(
    private readonly camera: ArcRotateCamera,
    private readonly canvas: HTMLCanvasElement,
    home?: BlenderCameraHomeState,
  ) {
    this.homeState = {
      target: (home?.target ?? camera.getTarget()).clone(),
      alpha: home?.alpha ?? camera.alpha,
      beta: home?.beta ?? camera.beta,
      radius: home?.radius ?? camera.radius,
    };
    this.orthoRadius = this.homeState.radius;
    this.canvas.tabIndex = this.canvas.tabIndex >= 0 ? this.canvas.tabIndex : 0;
    this.canvas.style.touchAction = 'none';
    this.canvas.addEventListener('pointerdown', this.onPointerDown, { capture: true });
    this.canvas.addEventListener('auxclick', this.onAuxClick, { capture: true });
    window.addEventListener('pointermove', this.onPointerMove, { capture: true });
    window.addEventListener('pointerup', this.onPointerUp, { capture: true });
    window.addEventListener('pointercancel', this.onPointerUp, { capture: true });
    window.addEventListener('keydown', this.onKeyDown, { capture: true });
    this.canvas.addEventListener('wheel', this.onWheel, { passive: false, capture: true });
    this.camera.onViewMatrixChangedObservable.add(() => {
      if (this.camera.mode === Camera.PERSPECTIVE_CAMERA) {
        this.orthoRadius = this.camera.radius;
      } else {
        this.syncOrthographicFrustum();
      }
    });
    this.syncWheelInputEnabled();
  }

  dispose(): void {
    this.canvas.removeEventListener('pointerdown', this.onPointerDown, { capture: true });
    this.canvas.removeEventListener('auxclick', this.onAuxClick, { capture: true });
    window.removeEventListener('pointermove', this.onPointerMove, { capture: true });
    window.removeEventListener('pointerup', this.onPointerUp, { capture: true });
    window.removeEventListener('pointercancel', this.onPointerUp, { capture: true });
    window.removeEventListener('keydown', this.onKeyDown, { capture: true });
    this.canvas.removeEventListener('wheel', this.onWheel, { capture: true });
    this.endPointerDrag();
    this.attachCameraControl();
  }

  /** Pixel orbit used by the orientation gizmo (Blender view-gizmo drag). */
  orbitByPixels(dx: number, dy: number): void {
    const sens = Math.max(1, this.camera.angularSensibilityX || 1000);
    this.camera.inertialAlphaOffset = 0;
    this.camera.inertialBetaOffset = 0;
    this.camera.alpha -= dx / sens;
    this.camera.beta = clampRange(this.camera.beta + dy / sens, MIN_BETA, MAX_BETA);
    if (this.camera.mode === Camera.ORTHOGRAPHIC_CAMERA) {
      this.syncOrthographicFrustum();
    }
  }

  /**
   * Snap to a world axis view (orientation gizmo axis click).
   * If already aligned to the positive view, flips to the opposite (Blender-like).
   */
  snapToWorldAxis(axis: WorldAxis, forceOpposite = false): void {
    const { positive, negative } = AXIS_TO_VIEW[axis];
    const opposite = forceOpposite || this.isAlignedToView(positive);
    this.snapToView(opposite ? negative : positive, false);
  }

  /** Numpad-style snap: forces orthographic. */
  snapToOrthographicView(view: WorldAxisView): void {
    this.snapToView(view, true);
  }

  toggleProjectionMode(): void {
    if (this.camera.mode === Camera.PERSPECTIVE_CAMERA) {
      this.orthoRadius = this.camera.radius;
      this.camera.mode = Camera.ORTHOGRAPHIC_CAMERA;
      this.syncOrthographicFrustum();
    } else {
      this.camera.mode = Camera.PERSPECTIVE_CAMERA;
      this.camera.orthoLeft = null;
      this.camera.orthoRight = null;
      this.camera.orthoTop = null;
      this.camera.orthoBottom = null;
      this.camera.radius = this.orthoRadius;
    }
    this.syncWheelInputEnabled();
  }

  resetToHome(): void {
    this.camera.target.copyFrom(this.homeState.target);
    this.camera.alpha = this.homeState.alpha;
    this.camera.beta = this.homeState.beta;
    this.camera.radius = this.homeState.radius;
    this.orthoRadius = this.homeState.radius;
    if (this.camera.mode === Camera.ORTHOGRAPHIC_CAMERA) {
      this.syncOrthographicFrustum();
    }
    this.syncWheelInputEnabled();
  }

  private snapToView(view: WorldAxisView, forceOrtho: boolean): void {
    if (this.camera.mode === Camera.PERSPECTIVE_CAMERA) {
      this.orthoRadius = this.camera.radius;
    }
    if (forceOrtho) {
      this.camera.mode = Camera.ORTHOGRAPHIC_CAMERA;
    }
    this.applyWorldAxisView(view);
    if (this.camera.mode === Camera.ORTHOGRAPHIC_CAMERA) {
      this.syncOrthographicFrustum();
    }
    this.syncWheelInputEnabled();
  }

  private isAlignedToView(view: WorldAxisView): boolean {
    const offset = WORLD_AXIS_VIEW_OFFSETS[view];
    const expected = this.anglesForOffset(offset);
    const dAlpha = Math.abs(wrapAngle(this.camera.alpha - expected.alpha));
    const dBeta = Math.abs(this.camera.beta - expected.beta);
    return dAlpha < ALIGN_EPS && dBeta < ALIGN_EPS;
  }

  private handlePointerDown(event: PointerEvent): void {
    this.canvas.focus();
    if (event.button !== 1) return;

    // Always kill browser middle-click autoscroll.
    event.preventDefault();

    if (!event.shiftKey) {
      // Plain MMB orbit is handled by Babylon inputMap (button 1 → rotate).
      return;
    }

    // Shift+MMB pan: take over so we don't fight Babylon rotate.
    this.detachCameraControl();
    this.dragMode = 'pan';
    this.lastClientX = event.clientX;
    this.lastClientY = event.clientY;
    this.activePointerId = event.pointerId;
    this.canvas.setPointerCapture?.(event.pointerId);
    event.stopPropagation();
  }

  private handlePointerMove(event: PointerEvent): void {
    if (this.dragMode === 'none') return;
    if (this.activePointerId !== null && event.pointerId !== this.activePointerId) return;
    const dx = event.clientX - this.lastClientX;
    const dy = event.clientY - this.lastClientY;
    this.lastClientX = event.clientX;
    this.lastClientY = event.clientY;
    if (this.dragMode === 'orbit') {
      this.orbitByPixels(dx, dy);
    } else {
      this.panCamera(dx, dy);
    }
    event.preventDefault();
    event.stopPropagation();
  }

  private handlePointerUp(event: PointerEvent): void {
    if (this.dragMode === 'none') return;
    if (this.activePointerId !== null && event.pointerId !== this.activePointerId) return;
    if (event.button === 1 || event.buttons === 0) {
      this.canvas.releasePointerCapture?.(event.pointerId);
      this.endPointerDrag();
    }
  }

  private endPointerDrag(): void {
    if (this.dragMode === 'none') return;
    this.dragMode = 'none';
    this.activePointerId = null;
    this.attachCameraControl();
  }

  private detachCameraControl(): void {
    if (!this.cameraControlAttached) return;
    this.camera.detachControl();
    this.cameraControlAttached = false;
  }

  private attachCameraControl(): void {
    if (this.cameraControlAttached) return;
    configureBlenderPointerInputs(this.camera, this.canvas);
    this.cameraControlAttached = true;
    this.syncWheelInputEnabled();
  }

  private handleWheel(event: WheelEvent): void {
    if (this.camera.mode !== Camera.ORTHOGRAPHIC_CAMERA) return;
    event.preventDefault();
    event.stopPropagation();
    const factor = event.deltaY > 0 ? 1.1 : 1 / 1.1;
    this.orthoRadius = clampRange(this.orthoRadius * factor, 0.5, 2000);
    this.camera.radius = this.orthoRadius;
    this.syncOrthographicFrustum();
  }

  private syncWheelInputEnabled(): void {
    const wheel = this.camera.inputs.attached['mousewheel'] as { enabled?: boolean } | undefined;
    if (!wheel) return;
    wheel.enabled = this.camera.mode === Camera.PERSPECTIVE_CAMERA;
  }

  private panCamera(dx: number, dy: number): void {
    const engine = this.camera.getEngine();
    const width = Math.max(1, engine.getRenderWidth());
    const height = Math.max(1, engine.getRenderHeight());
    const distance =
      this.camera.mode === Camera.ORTHOGRAPHIC_CAMERA ? this.orthoRadius : this.camera.radius;
    const panScale = (distance * 2) / Math.min(width, height);
    const right = this.camera.getDirection(Vector3.Right());
    const up = this.camera.getDirection(Vector3.Up());
    const delta = right.scale(-dx * panScale).add(up.scale(dy * panScale));
    this.camera.target.addInPlace(delta);
    if (this.camera.mode === Camera.ORTHOGRAPHIC_CAMERA) {
      this.syncOrthographicFrustum();
    }
  }

  private handleKeyDown(event: KeyboardEvent): void {
    if (!this.shouldHandleKeyboardEvent(event)) return;
    if (this.isHomeReset(event)) {
      event.preventDefault();
      event.stopPropagation();
      this.resetToHome();
      return;
    }
    const view = this.resolveNumpadView(event);
    if (view === 'toggleProjection') {
      event.preventDefault();
      event.stopPropagation();
      this.toggleProjectionMode();
      return;
    }
    if (view) {
      event.preventDefault();
      event.stopPropagation();
      this.snapToOrthographicView(view);
    }
  }

  private shouldHandleKeyboardEvent(event: KeyboardEvent): boolean {
    const target = event.target;
    if (!(target instanceof Element)) return true;
    if (target === this.canvas || this.canvas.contains(target)) return true;
    const active = document.activeElement;
    if (active === this.canvas || (active instanceof Element && this.canvas.contains(active))) {
      return true;
    }
    const tag = target.tagName;
    return tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT' && !(target as HTMLElement).isContentEditable;
  }

  private isHomeReset(event: KeyboardEvent): boolean {
    return (
      event.shiftKey &&
      !event.ctrlKey &&
      !event.altKey &&
      !event.metaKey &&
      event.code === 'KeyC'
    );
  }

  /** Prefer `code` so Num Lock off still works on Windows (location can be unreliable). */
  private isNumpadKey(event: KeyboardEvent): boolean {
    return event.code.startsWith('Numpad');
  }

  private resolveNumpadView(event: KeyboardEvent): WorldAxisView | 'toggleProjection' | null {
    if (!this.isNumpadKey(event)) return null;
    const opposite = event.ctrlKey;
    switch (event.code) {
      case 'Numpad1':
        return opposite ? 'back' : 'front';
      case 'Numpad3':
        return opposite ? 'left' : 'right';
      case 'Numpad7':
        return opposite ? 'bottom' : 'top';
      case 'Numpad9':
        return opposite ? 'top' : 'bottom';
      case 'Numpad5':
        return 'toggleProjection';
      default:
        return null;
    }
  }

  private applyWorldAxisView(view: WorldAxisView): void {
    const offset = WORLD_AXIS_VIEW_OFFSETS[view];
    const target = this.camera.target;
    this.camera.radius = this.orthoRadius;
    const angles = this.anglesForOffset(offset);
    this.camera.alpha = angles.alpha;
    this.camera.beta = angles.beta;
    this.camera.position.copyFrom(target).addInPlace(offset.scale(this.orthoRadius));
  }

  private anglesForOffset(offset: Vector3): { alpha: number; beta: number } {
    if (offset.y > 0) return { alpha: this.camera.alpha, beta: MIN_BETA };
    if (offset.y < 0) return { alpha: this.camera.alpha, beta: MAX_BETA };
    const unit = offset.normalize();
    return { alpha: Math.atan2(unit.x, unit.z), beta: Math.PI / 2 };
  }

  private syncOrthographicFrustum(): void {
    const engine = this.camera.getEngine();
    const aspect = Math.max(
      1e-6,
      engine.getRenderWidth() / Math.max(1, engine.getRenderHeight()),
    );
    const halfHeight = Math.max(0.01, this.orthoRadius * ORTHO_FRUSTUM_SCALE);
    const halfWidth = halfHeight * aspect;
    this.camera.orthoLeft = -halfWidth;
    this.camera.orthoRight = halfWidth;
    this.camera.orthoBottom = -halfHeight;
    this.camera.orthoTop = halfHeight;
  }
}

function wrapAngle(a: number): number {
  let x = a;
  while (x > Math.PI) x -= Math.PI * 2;
  while (x < -Math.PI) x += Math.PI * 2;
  return x;
}
