import {
  Color3,
  ImportMeshAsync,
  Material,
  Mesh,
  MeshBuilder,
  Quaternion,
  StandardMaterial,
  type AbstractMesh,
  type Scene,
} from '@babylonjs/core';
// Ensure default material shaders are registered (tree-shaken ESM builds).
import '@babylonjs/core/Materials/standardMaterial.js';
import '@babylonjs/loaders/glTF';
import {
  SURFACE_MAX_SIMULTANEOUS_LIGHTS,
  clamp01,
  studioAssets,
  surfaceBrdfWeights,
  type GizmoMode,
  type GizmoSpace,
  type SurfaceMaterial,
  type Transform,
  type World,
} from '@engine';
import { DebugFloor } from '../debug-floor';
import { LightSelectionGizmos } from '../lights/light-selection-gizmo';
import { StudioTransformGizmo } from '../transform-gizmo';

export class SceneMeshSync {
  readonly meshes = new Map<string, AbstractMesh>();
  readonly floor: DebugFloor;
  readonly gizmo: StudioTransformGizmo;
  private readonly lightGizmos: LightSelectionGizmos;
  private lastEpoch = -1;
  private lastGizmoMode: GizmoMode = 'none';
  private lastGizmoSpace: GizmoSpace = 'world';
  private lastGizmoEntity: string | null = null;
  private world: World;
  private onSurfaceMaterial:
    | ((mat: StandardMaterial, sm: SurfaceMaterial | null) => void)
    | null = null;
  /** Optional IBL / cubemap reflection binder (atmosphere env capture). */
  private onReflection:
    | ((mat: StandardMaterial, sm: SurfaceMaterial | null) => void)
    | null = null;
  /** In-flight GLB loads keyed by entity id (cancelled when epoch rebuilds). */
  private readonly pendingCatalogLoads = new Map<string, number>();
  private catalogLoadSeq = 0;

  constructor(
    private readonly scene: Scene,
    world: World,
    private readonly onDragStart: (entityId: string) => void,
    private readonly onDragEnd: (entityId: string, transform: Transform) => void,
    opts?: {
      onSurfaceMaterial?: (mat: StandardMaterial, sm: SurfaceMaterial | null) => void;
    },
  ) {
    this.world = world;
    this.floor = new DebugFloor(scene, { extent: 20, step: 1 });
    this.gizmo = new StudioTransformGizmo(scene);
    this.lightGizmos = new LightSelectionGizmos(scene);
    this.onSurfaceMaterial = opts?.onSurfaceMaterial ?? null;
  }

  setSurfaceMaterialHook(
    hook: (mat: StandardMaterial, sm: SurfaceMaterial | null) => void,
  ): void {
    this.onSurfaceMaterial = hook;
  }

  /** Bind / clear environment cubemap reflections on surface StandardMaterials. */
  setReflectionHook(
    hook: ((mat: StandardMaterial, sm: SurfaceMaterial | null) => void) | null,
  ): void {
    this.onReflection = hook;
    this.reapplyReflections();
  }

  /** Re-run reflection binder on all current surface materials (e.g. after cubemap bake). */
  reapplyReflections(): void {
    for (const [id, mesh] of this.meshes) {
      if (!(mesh.material instanceof StandardMaterial)) continue;
      const sm = this.world.get(id, 'SurfaceMaterial') ?? null;
      this.onReflection?.(mesh.material, sm);
    }
  }

  setWorld(world: World): void {
    this.world = world;
    this.lastEpoch = -1;
    this.rebuildMeshes();
    this.applyPresentationMode();
  }

  sync(): void {
    if (this.world.resources.epoch === this.lastEpoch) {
      this.updateMeshTransforms();
    } else {
      this.lastEpoch = this.world.resources.epoch;
      this.rebuildMeshes();
      this.applyPresentationMode();
    }
    this.syncGizmoAttachment();
  }

  setGizmoMode(mode: GizmoMode): void {
    this.world.resources.EditorTooling.gizmoMode = mode;
    this.lastGizmoMode = 'none';
    this.syncGizmoAttachment();
  }

  setGizmoSpace(space: GizmoSpace): void {
    this.world.resources.EditorTooling.gizmoSpace = space;
    this.lastGizmoSpace = space === 'local' ? 'world' : 'local';
    this.syncGizmoAttachment();
  }

  applyPresentationMode(): void {
    const edit = this.isEditMode();
    this.floor.setEnabled(edit);
    for (const [id, mesh] of this.meshes) {
      const hidden = this.world.get(id, 'ViewportHidden')?.hidden ?? false;
      mesh.setEnabled(!hidden);
      const isMedia = this.world.has(id, 'MediaVolume');
      if (isMedia && mesh.material instanceof StandardMaterial) {
        mesh.material.wireframe = edit;
        mesh.material.alpha = edit ? 0.08 : 0;
      }
      const isEnvGround = this.world.get(id, 'EnvironmentPiece')?.kind === 'ground';
      if (isEnvGround) {
        mesh.setEnabled(!hidden);
      }
    }
    this.lastGizmoMode = 'none';
    this.syncGizmoAttachment();
    this.highlightSelection();
  }

  dispose(): void {
    this.gizmo.dispose();
    this.lightGizmos.dispose();
    this.floor.dispose();
    for (const mesh of this.meshes.values()) mesh.dispose();
    this.meshes.clear();
  }

  private isEditMode(): boolean {
    return this.world.resources.PresentationMode === 'edit';
  }

  private updateMeshTransforms(): void {
    const skipId = this.gizmo.isDragging ? this.gizmo.getAttachedEntityId() : null;
    for (const [id, mesh] of this.meshes) {
      if (id === skipId) continue;
      const t = this.world.get(id, 'Transform');
      if (t) this.applyTransform(mesh, t);
    }
    if (!this.gizmo.isDragging) {
      this.highlightSelection();
    } else {
      // Keep light helpers glued while the fixture root moves under the transform gizmo.
      const ids = new Set(this.world.resources.EditorSelection.entityIds ?? []);
      if (this.world.resources.EditorSelection.entityId) {
        ids.add(this.world.resources.EditorSelection.entityId);
      }
      this.lightGizmos.sync(this.world, ids, this.meshes, this.isEditMode());
    }
  }

  private rebuildMeshes(): void {
    this.gizmo.detach();
    this.lightGizmos.clear();
    this.lastGizmoEntity = null;
    this.lastGizmoMode = 'none';
    this.lastGizmoSpace = this.world.resources.EditorTooling.gizmoSpace === 'local' ? 'world' : 'local';
    this.pendingCatalogLoads.clear();
    for (const mesh of this.meshes.values()) mesh.dispose();
    this.meshes.clear();

    for (const id of this.world.query('Transform')) {
      if (this.world.get(id, 'EditorFlags')?.isSceneRoot) continue;

      if (this.world.has(id, 'EnvironmentPiece')) {
        const piece = this.world.get(id, 'EnvironmentPiece');
        const sm = this.world.get(id, 'SurfaceMaterial') ?? null;
        const catalogId = piece?.catalogId?.trim() || null;
        if (catalogId) {
          this.spawnCatalogMesh(id, catalogId, sm, piece?.kind ?? 'prop');
          continue;
        }
        if (piece?.kind === 'ground') {
          const ground = MeshBuilder.CreateGround(
            `ground_${id}`,
            { width: 30, height: 30 },
            this.scene,
          );
          ground.material = this.createSurfaceOrFallback(
            `groundMat_${id}`,
            sm,
            new Color3(0.14, 0.15, 0.17),
          );
          ground.metadata = { entityId: id };
          this.applyTransform(ground, this.world.get(id, 'Transform')!);
          this.meshes.set(id, ground);
          continue;
        }
        const box = MeshBuilder.CreateBox(`prop_${id}`, { size: 0.5 }, this.scene);
        box.material = this.createSurfaceOrFallback(
          `propMat_${id}`,
          sm,
          new Color3(0.35, 0.35, 0.4),
        );
        box.metadata = { entityId: id };
        this.applyTransform(box, this.world.get(id, 'Transform')!);
        this.meshes.set(id, box);
        continue;
      }

      if (this.world.has(id, 'MediaVolume')) {
        const vol = this.world.get(id, 'MediaVolume')!;
        const t = this.world.get(id, 'Transform')!;
        const box = MeshBuilder.CreateBox(
          `media_${id}`,
          {
            width: vol.halfExtents[0] * 2,
            height: vol.halfExtents[1] * 2,
            depth: vol.halfExtents[2] * 2,
          },
          this.scene,
        );
        const mat = new StandardMaterial(`mediaMat_${id}`, this.scene);
        mat.maxSimultaneousLights = SURFACE_MAX_SIMULTANEOUS_LIGHTS;
        mat.diffuseColor = new Color3(vol.color[0], vol.color[1], vol.color[2]);
        mat.alpha = 0.08;
        mat.transparencyMode = Material.MATERIAL_ALPHABLEND;
        mat.disableDepthWrite = true;
        mat.wireframe = true;
        box.material = mat;
        box.metadata = { entityId: id };
        this.applyTransform(box, t);
        this.meshes.set(id, box);
        continue;
      }

      if (this.world.has(id, 'LightEmitter')) {
        // Lights have no placeholder mesh — only an invisible transform anchor for gizmos.
        const root = new Mesh(`light_${id}`, this.scene);
        root.isVisible = false;
        root.isPickable = false;
        root.metadata = { entityId: id };
        this.applyTransform(root, this.world.get(id, 'Transform')!);
        this.meshes.set(id, root);
        continue;
      }

      const sm = this.world.get(id, 'SurfaceMaterial') ?? null;
      const marker = MeshBuilder.CreateSphere(`empty_${id}`, { diameter: 0.12 }, this.scene);
      marker.material = this.createSurfaceOrFallback(
        `emptyMat_${id}`,
        sm,
        new Color3(0.55, 0.55, 0.6),
      );
      marker.metadata = { entityId: id };
      this.applyTransform(marker, this.world.get(id, 'Transform')!);
      this.meshes.set(id, marker);
    }

    this.highlightSelection();
  }

  /**
   * Place a procedural stand-in, then swap in a catalog GLB when load succeeds.
   */
  private spawnCatalogMesh(
    id: string,
    catalogId: string,
    sm: SurfaceMaterial | null,
    kind: 'ground' | 'prop' | 'sky',
  ): void {
    const placeholder =
      kind === 'ground'
        ? MeshBuilder.CreateGround(`ground_${id}`, { width: 30, height: 30 }, this.scene)
        : MeshBuilder.CreateBox(`prop_${id}`, { size: 0.5 }, this.scene);
    placeholder.material = this.createSurfaceOrFallback(
      `catalogPlaceholderMat_${id}`,
      sm,
      kind === 'ground' ? new Color3(0.14, 0.15, 0.17) : new Color3(0.35, 0.35, 0.4),
    );
    placeholder.metadata = { entityId: id, catalogId };
    this.applyTransform(placeholder, this.world.get(id, 'Transform')!);
    this.meshes.set(id, placeholder);

    const url = studioAssets.getModelUrl(catalogId);
    if (!url) return;

    const entry = studioAssets.getModel(catalogId);
    const seq = ++this.catalogLoadSeq;
    this.pendingCatalogLoads.set(id, seq);

    void ImportMeshAsync(url, this.scene)
      .then((result) => {
        if (this.pendingCatalogLoads.get(id) !== seq) {
          for (const m of result.meshes) m.dispose();
          return;
        }
        const roots = result.meshes.filter((m) => !m.parent);
        const root = roots[0] ?? result.meshes[0];
        if (!root) {
          this.pendingCatalogLoads.delete(id);
          return;
        }
        for (const m of result.meshes) {
          m.metadata = { entityId: id, catalogId };
          if (m !== root && !m.parent) m.parent = root;
        }
        root.name = `catalog_${catalogId}_${id}`;
        const prev = this.meshes.get(id);
        if (prev && prev !== root) prev.dispose();
        this.applyTransform(root, this.world.get(id, 'Transform')!);
        if (entry?.scale != null) {
          const s = entry.scale;
          if (typeof s === 'number') {
            root.scaling.scaleInPlace(s);
          } else {
            root.scaling.x *= s[0];
            root.scaling.y *= s[1];
            root.scaling.z *= s[2];
          }
        }
        this.meshes.set(id, root);
        this.pendingCatalogLoads.delete(id);
        this.highlightSelection();
        this.syncGizmoAttachment();
      })
      .catch(() => {
        if (this.pendingCatalogLoads.get(id) === seq) {
          this.pendingCatalogLoads.delete(id);
        }
      });
  }

  private createSurfaceOrFallback(
    name: string,
    sm: SurfaceMaterial | null,
    fallbackDiffuse: Color3,
  ): Material {
    if (sm) {
      return this.createSurfaceMaterial(name, sm);
    }
    const mat = new StandardMaterial(name, this.scene);
    mat.maxSimultaneousLights = SURFACE_MAX_SIMULTANEOUS_LIGHTS;
    mat.diffuseColor = fallbackDiffuse;
    mat.specularColor = new Color3(0.35, 0.35, 0.35);
    mat.specularPower = 32;
    this.onSurfaceMaterial?.(mat, null);
    return mat;
  }

  /**
   * Educational PBR-ish look on StandardMaterial for env lights (hemi/sun).
   * Emitter laser spots use SurfaceRadiancePlugin (BeamModel × GGX), not Phong specular.
   */
  private createSurfaceMaterial(name: string, sm: SurfaceMaterial): StandardMaterial {
    const mat = new StandardMaterial(name, this.scene);
    mat.maxSimultaneousLights = SURFACE_MAX_SIMULTANEOUS_LIGHTS;
    this.applySurfaceParams(mat, sm);
    this.onSurfaceMaterial?.(mat, sm);
    return mat;
  }

  private applySurfaceParams(mat: StandardMaterial, sm: SurfaceMaterial): void {
    const w = surfaceBrdfWeights(sm);
    mat.diffuseColor = new Color3(w.diffuseWeight, w.diffuseWeight, w.diffuseWeight);
    mat.specularColor = new Color3(w.specularWeight, w.specularWeight, w.specularWeight);
    mat.specularPower = w.shininess;
    this.applyTransmission(mat, sm.transmission);
    this.onSurfaceMaterial?.(mat, sm);
    this.onReflection?.(mat, sm);
  }

  /** Opaque blocks volumetric beams (depth write); transmission lets beams continue. */
  private applyTransmission(mat: StandardMaterial, transmission: number): void {
    const t = clamp01(transmission);
    if (t > 0.02) {
      mat.alpha = Math.max(0.1, 1 - t * 0.9);
      mat.transparencyMode = Material.MATERIAL_ALPHABLEND;
      mat.disableDepthWrite = false;
    } else {
      mat.alpha = 1;
      mat.transparencyMode = Material.MATERIAL_OPAQUE;
      mat.disableDepthWrite = false;
    }
  }

  private applyTransform(mesh: AbstractMesh, t: Transform): void {
    mesh.position.set(t.position[0], t.position[1], t.position[2]);
    mesh.rotationQuaternion = new Quaternion(
      t.rotation[0],
      t.rotation[1],
      t.rotation[2],
      t.rotation[3],
    );
    mesh.scaling.set(t.scale[0], t.scale[1], t.scale[2]);
  }

  private highlightSelection(): void {
    const ids = new Set(this.world.resources.EditorSelection.entityIds ?? []);
    if (this.world.resources.EditorSelection.entityId) {
      ids.add(this.world.resources.EditorSelection.entityId);
    }
    const edit = this.isEditMode();
    for (const [id, mesh] of this.meshes) {
      const isSel = edit && ids.has(id) && !this.world.has(id, 'LightEmitter');
      mesh.renderOutline = isSel;
      mesh.outlineColor = new Color3(0.95, 0.75, 0.2);
      mesh.outlineWidth = 0.04;
    }
    this.lightGizmos.sync(this.world, ids, this.meshes, edit);
  }

  private syncGizmoAttachment(): void {
    if (!this.isEditMode()) {
      if (this.lastGizmoEntity !== null || this.lastGizmoMode !== 'none') {
        this.gizmo.detach();
        this.lastGizmoEntity = null;
        this.lastGizmoMode = 'none';
      }
      return;
    }

    const id = this.world.resources.EditorSelection.entityId;
    let mode = this.world.resources.EditorTooling.gizmoMode;
    // Selection always shows a transform gizmo — never stay on 'none'.
    if (mode === 'none') {
      mode = 'position';
      this.world.resources.EditorTooling.gizmoMode = mode;
    }
    const space = this.world.resources.EditorTooling.gizmoSpace ?? 'world';
    const mesh = id ? (this.meshes.get(id) ?? null) : null;

    if (!mesh || !id) {
      if (this.lastGizmoEntity !== null || this.lastGizmoMode !== 'none') {
        this.gizmo.detach();
        this.lastGizmoEntity = null;
        this.lastGizmoMode = 'none';
      }
      return;
    }

    if (this.lastGizmoMode !== mode) {
      this.gizmo.setMode(mode);
      this.lastGizmoMode = mode;
    }

    if (this.lastGizmoSpace !== space) {
      this.gizmo.setSpace(space);
      this.lastGizmoSpace = space;
    }

    if (this.lastGizmoEntity !== id || this.gizmo.getAttachedEntityId() !== id) {
      this.gizmo.attach(id, mesh, this.onDragEnd, this.onDragStart);
      this.lastGizmoEntity = id;
    }
  }
}
