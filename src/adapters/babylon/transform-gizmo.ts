import { GizmoManager } from '@babylonjs/core/Gizmos/gizmoManager';
import type { Scene } from '@babylonjs/core';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Quaternion } from '@babylonjs/core';
import type { GizmoMode, Transform } from '../../engine';

type DragGizmo = {
  onDragStartObservable: { add: (cb: () => void) => void };
  onDragEndObservable: { add: (cb: () => void) => void };
  isDragging?: boolean;
};

export class StudioTransformGizmo {
  private readonly manager: GizmoManager;
  private mode: GizmoMode = 'none';
  private attachedNode: TransformNode | null = null;
  private attachedEntityId: string | null = null;
  private onDragStart: ((entityId: string) => void) | null = null;
  private onDragEnd: ((entityId: string, transform: Transform) => void) | null = null;
  private readonly wired = new WeakSet<object>();
  private dragging = false;

  constructor(scene: Scene) {
    this.manager = new GizmoManager(scene);
    this.manager.usePointerToAttachGizmos = false;
    this.manager.clearGizmoOnEmptyPointerEvent = false;
  }

  get isDragging(): boolean {
    return (
      this.dragging ||
      !!this.manager.gizmos.positionGizmo?.isDragging ||
      !!this.manager.gizmos.rotationGizmo?.isDragging ||
      !!this.manager.gizmos.scaleGizmo?.isDragging
    );
  }

  get isHovered(): boolean {
    return this.manager.isHovered;
  }

  getMode(): GizmoMode {
    return this.mode;
  }

  getAttachedEntityId(): string | null {
    return this.attachedEntityId;
  }

  setMode(mode: GizmoMode): void {
    if (this.mode === mode) {
      this.refresh();
      return;
    }
    this.mode = mode;
    this.manager.positionGizmoEnabled = mode === 'position';
    this.manager.rotationGizmoEnabled = mode === 'rotation';
    this.manager.scaleGizmoEnabled = mode === 'scale';
    if (mode === 'position' && this.manager.gizmos.positionGizmo) {
      this.manager.gizmos.positionGizmo.updateGizmoRotationToMatchAttachedMesh = false;
      this.manager.gizmos.positionGizmo.planarGizmoEnabled = true;
    }
    if (mode === 'rotation' && this.manager.gizmos.rotationGizmo) {
      this.manager.gizmos.rotationGizmo.updateGizmoRotationToMatchAttachedMesh = false;
    }
    this.wire(this.manager.gizmos.positionGizmo as DragGizmo | null);
    this.wire(this.manager.gizmos.rotationGizmo as DragGizmo | null);
    this.wire(this.manager.gizmos.scaleGizmo as DragGizmo | null);
    this.refresh();
  }

  attach(
    entityId: string | null,
    node: TransformNode | null,
    onDragEnd: ((entityId: string, transform: Transform) => void) | null,
    onDragStart?: ((entityId: string) => void) | null,
  ): void {
    const same =
      this.attachedEntityId === entityId &&
      this.attachedNode === node &&
      this.onDragEnd === onDragEnd &&
      this.onDragStart === (onDragStart ?? null);
    this.attachedEntityId = entityId;
    this.attachedNode = node;
    this.onDragEnd = onDragEnd;
    this.onDragStart = onDragStart ?? null;
    if (!same) this.refresh();
  }

  detach(): void {
    this.attachedEntityId = null;
    this.attachedNode = null;
    this.onDragStart = null;
    this.onDragEnd = null;
    this.dragging = false;
    this.manager.attachToNode(null);
  }

  dispose(): void {
    this.detach();
    this.manager.dispose();
  }

  private wire(gizmo: DragGizmo | null): void {
    if (!gizmo || this.wired.has(gizmo)) return;
    gizmo.onDragStartObservable.add(() => {
      this.dragging = true;
      if (this.attachedEntityId) this.onDragStart?.(this.attachedEntityId);
    });
    gizmo.onDragEndObservable.add(() => {
      this.dragging = false;
      this.emit();
    });
    this.wired.add(gizmo);
  }

  private refresh(): void {
    if (!this.attachedNode || !this.onDragEnd || this.mode === 'none') {
      this.manager.attachToNode(null);
      return;
    }
    this.manager.attachToNode(this.attachedNode);
  }

  private emit(): void {
    if (!this.attachedNode || !this.onDragEnd || !this.attachedEntityId) return;
    const n = this.attachedNode;
    const q = n.rotationQuaternion ?? Quaternion.Identity();
    this.onDragEnd(this.attachedEntityId, {
      position: [n.position.x, n.position.y, n.position.z],
      rotation: [q.x, q.y, q.z, q.w],
      scale: [n.scaling.x, n.scaling.y, n.scaling.z],
    });
  }
}
