import {
  Color3,
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
import {
  deriveHousingGlowScale,
  displayRgb,
  laserDotDisplayBrightness,
  SURFACE_MAX_SIMULTANEOUS_LIGHTS,
  surfaceBrdfWeights,
  wavelengthToRgb,
  type GizmoMode,
  type LightEmitter,
  type SurfaceMaterial,
  type Transform,
  type World,
} from '../../../engine';
import { DebugFloor } from '../debug-floor';
import { StudioTransformGizmo } from '../transform-gizmo';

export class SceneMeshSync {
  readonly meshes = new Map<string, AbstractMesh>();
  readonly floor: DebugFloor;
  readonly gizmo: StudioTransformGizmo;
  private lastEpoch = -1;
  private lastGizmoMode: GizmoMode = 'none';
  private lastGizmoEntity: string | null = null;
  private world: World;
  private onSurfaceMaterial:
    | ((mat: StandardMaterial, sm: SurfaceMaterial | null) => void)
    | null = null;

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
    this.onSurfaceMaterial = opts?.onSurfaceMaterial ?? null;
  }

  setSurfaceMaterialHook(
    hook: (mat: StandardMaterial, sm: SurfaceMaterial | null) => void,
  ): void {
    this.onSurfaceMaterial = hook;
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
      this.updateDynamicMaterials();
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
    }
  }

  /** Refresh housing emissive when light params change without epoch bump path. */
  private updateDynamicMaterials(): void {
    for (const [id, mesh] of this.meshes) {
      if (!this.world.has(id, 'LightEmitter')) continue;
      const emitter = this.world.get(id, 'LightEmitter');
      if (!emitter) continue;
      const sm = this.world.get(id, 'SurfaceMaterial') ?? null;
      const body = mesh.getChildMeshes(false)[0] ?? mesh;
      this.applyFixtureMaterial(body, id, emitter, sm);
    }
  }

  private rebuildMeshes(): void {
    this.gizmo.detach();
    this.lastGizmoEntity = null;
    this.lastGizmoMode = 'none';
    for (const mesh of this.meshes.values()) mesh.dispose();
    this.meshes.clear();

    for (const id of this.world.query('Transform')) {
      if (this.world.get(id, 'EditorFlags')?.isSceneRoot) continue;

      if (this.world.has(id, 'EnvironmentPiece')) {
        const piece = this.world.get(id, 'EnvironmentPiece');
        const sm = this.world.get(id, 'SurfaceMaterial') ?? null;
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
        const emitter = this.world.get(id, 'LightEmitter')!;
        const t = this.world.get(id, 'Transform')!;
        const sm = this.world.get(id, 'SurfaceMaterial') ?? null;
        const body = MeshBuilder.CreateCylinder(
          `fixture_${id}`,
          { height: 0.18, diameterTop: 0.04, diameterBottom: 0.08, tessellation: 12 },
          this.scene,
        );
        body.rotation.x = Math.PI / 2;
        this.applyFixtureMaterial(body, id, emitter, sm);
        body.metadata = { entityId: id };
        const root = new Mesh(`fixtureRoot_${id}`, this.scene);
        body.parent = root;
        this.applyTransform(root, t);
        root.metadata = { entityId: id };
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
   * Educational PBR-ish look on StandardMaterial (avoids PBR shader/plugin issues).
   * Uses surfaceBrdfWeights — same mapping as SurfaceRadiancePlugin.
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
  }

  /** Opaque blocks volumetric beams (depth write); transmission lets beams continue. */
  private applyTransmission(mat: StandardMaterial, transmission: number): void {
    const t = Math.min(1, Math.max(0, transmission));
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

  private applyFixtureMaterial(
    mesh: AbstractMesh,
    id: string,
    emitter: LightEmitter,
    sm: SurfaceMaterial | null,
  ): void {
    const rgb = wavelengthToRgb(emitter.wavelengthNm);
    const vision = this.world.resources.DisplayVision;
    const env = this.world.resources.EnvironmentLighting;
    const power = laserDotDisplayBrightness(emitter.powerW, emitter.wavelengthNm, {
      ambientLevel: env.ambientLevel,
      responseCurve: vision.responseCurve,
    });
    const glow = deriveHousingGlowScale(sm, emitter.apertureCoupling, emitter.glowGain, power);
    const [er, eg, eb] = displayRgb(rgb, glow);
    const emissive = new Color3(er, eg, eb);

    let mat = mesh.material;
    if (!(mat instanceof StandardMaterial) || mat.name !== `fixtureMat_${id}`) {
      mat?.dispose();
      const stdNew = new StandardMaterial(`fixtureMat_${id}`, this.scene);
      stdNew.maxSimultaneousLights = SURFACE_MAX_SIMULTANEOUS_LIGHTS;
      mesh.material = stdNew;
      mat = stdNew;
    }
    const std = mat as StandardMaterial;
    std.maxSimultaneousLights = SURFACE_MAX_SIMULTANEOUS_LIGHTS;
    if (sm) {
      this.applySurfaceParams(std, sm);
    } else {
      std.diffuseColor = new Color3(0.15, 0.15, 0.15);
      std.specularColor = new Color3(0.2, 0.2, 0.2);
      std.specularPower = 32;
      this.applyTransmission(std, 0);
      this.onSurfaceMaterial?.(std, null);
    }
    std.emissiveColor = emissive;
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
      const isSel = edit && ids.has(id);
      mesh.renderOutline = isSel;
      mesh.outlineColor = new Color3(0.95, 0.75, 0.2);
      mesh.outlineWidth = 0.04;
    }
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
    const mode = this.world.resources.EditorTooling.gizmoMode;
    const mesh = id ? (this.meshes.get(id) ?? null) : null;

    if (!mesh || !id || mode === 'none') {
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

    if (this.lastGizmoEntity !== id || this.gizmo.getAttachedEntityId() !== id) {
      this.gizmo.attach(id, mesh, this.onDragEnd, this.onDragStart);
      this.lastGizmoEntity = id;
    }
  }
}
