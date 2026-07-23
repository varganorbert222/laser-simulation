import { GizmoManager } from '@babylonjs/core/Gizmos/gizmoManager';
import type { Scene } from '@babylonjs/core';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Material, Quaternion } from '@babylonjs/core';
import type { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import type { GizmoMode, GizmoSpace, Transform } from '@engine';

type DragGizmo = {
  onDragStartObservable: { add: (cb: () => void) => void };
  onDragEndObservable: { add: (cb: () => void) => void };
  isDragging?: boolean;
};

type MaterialGizmo = {
  coloredMaterial?: StandardMaterial;
  hoverMaterial?: StandardMaterial;
  disableMaterial?: StandardMaterial;
};

/** Slight translucency so gizmos don't obscure the scene. */
const GIZMO_ALPHA = 0.62;
const GIZMO_HOVER_ALPHA = 0.82;
const GIZMO_DISABLE_ALPHA = 0.35;

export class StudioTransformGizmo {
  private readonly manager: GizmoManager;
  private mode: GizmoMode = 'none';
  private space: GizmoSpace = 'world';
  private attachedNode: TransformNode | null = null;
  private attachedEntityId: string | null = null;
  private onDragStart: ((entityId: string) => void) | null = null;
  private onDragEnd: ((entityId: string, transform: Transform) => void) | null = null;
  private readonly wired = new WeakSet<object>();
  private readonly styled = new WeakSet<object>();
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

  getSpace(): GizmoSpace {
    return this.space;
  }

  getAttachedEntityId(): string | null {
    return this.attachedEntityId;
  }

  setMode(mode: GizmoMode): void {
    if (this.mode === mode) {
      this.applySpace();
      this.refresh();
      return;
    }
    this.mode = mode;
    this.manager.positionGizmoEnabled = mode === 'position';
    this.manager.rotationGizmoEnabled = mode === 'rotation';
    this.manager.scaleGizmoEnabled = mode === 'scale';
    if (mode === 'position' && this.manager.gizmos.positionGizmo) {
      this.manager.gizmos.positionGizmo.planarGizmoEnabled = true;
    }
    this.applySpace();
    this.styleActiveGizmos();
    this.wire(this.manager.gizmos.positionGizmo as DragGizmo | null);
    this.wire(this.manager.gizmos.rotationGizmo as DragGizmo | null);
    this.wire(this.manager.gizmos.scaleGizmo as DragGizmo | null);
    this.refresh();
  }

  setSpace(space: GizmoSpace): void {
    if (this.space === space) {
      this.applySpace();
      return;
    }
    this.space = space;
    this.applySpace();
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

  private applySpace(): void {
    const matchLocal = this.space === 'local';
    const { positionGizmo, rotationGizmo, scaleGizmo } = this.manager.gizmos;
    if (positionGizmo) {
      positionGizmo.updateGizmoRotationToMatchAttachedMesh = matchLocal;
    }
    if (rotationGizmo) {
      rotationGizmo.updateGizmoRotationToMatchAttachedMesh = matchLocal;
    }
    if (scaleGizmo) {
      scaleGizmo.updateGizmoRotationToMatchAttachedMesh = matchLocal;
    }
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

  private styleActiveGizmos(): void {
    const { positionGizmo, rotationGizmo, scaleGizmo } = this.manager.gizmos;
    if (positionGizmo) {
      this.styleAxisBundle([
        positionGizmo.xGizmo,
        positionGizmo.yGizmo,
        positionGizmo.zGizmo,
        positionGizmo.xPlaneGizmo,
        positionGizmo.yPlaneGizmo,
        positionGizmo.zPlaneGizmo,
      ]);
    }
    if (rotationGizmo) {
      this.styleAxisBundle([rotationGizmo.xGizmo, rotationGizmo.yGizmo, rotationGizmo.zGizmo]);
    }
    if (scaleGizmo) {
      this.styleAxisBundle([
        scaleGizmo.xGizmo,
        scaleGizmo.yGizmo,
        scaleGizmo.zGizmo,
        scaleGizmo,
      ]);
    }
  }

  private styleAxisBundle(parts: readonly MaterialGizmo[]): void {
    for (const part of parts) {
      if (!part || this.styled.has(part)) continue;
      this.applyMaterialAlpha(part.coloredMaterial, GIZMO_ALPHA);
      this.applyMaterialAlpha(part.hoverMaterial, GIZMO_HOVER_ALPHA);
      this.applyMaterialAlpha(part.disableMaterial, GIZMO_DISABLE_ALPHA);
      this.styled.add(part);
    }
  }

  private applyMaterialAlpha(mat: StandardMaterial | undefined, alpha: number): void {
    if (!mat) return;
    mat.alpha = alpha;
    mat.transparencyMode = Material.MATERIAL_ALPHABLEND;
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
