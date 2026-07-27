import {
  Color3,
  FresnelParameters,
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
import '@babylonjs/core/Materials/fresnelParameters.js';
import '@babylonjs/loaders/glTF';
import {
  SURFACE_MAX_SIMULTANEOUS_LIGHTS,
  clamp01,
  studioAssets,
  surfaceBrdfWeights,
  surfaceMaterialForFluidWall,
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
      const mat = this.primaryStandardMaterial(mesh);
      if (!mat) continue;
      const fluid = this.world.get(id, 'FluidVolume');
      const wallSm = fluid ? surfaceMaterialForFluidWall(fluid.wallMode) : null;
      const sm = wallSm ?? this.world.get(id, 'SurfaceMaterial') ?? null;
      this.onReflection?.(mat, sm);
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
      this.refreshSurfaceMaterials();
      this.refreshVolumeHelperLooks();
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
      const isFog =
        this.world.has(id, 'FogVolume') && !this.world.has(id, 'EnvironmentPiece');
      const fluid = this.world.get(id, 'FluidVolume');
      const isFluidHelper =
        !!fluid &&
        fluid.wallMode === 'none' &&
        !this.world.has(id, 'EnvironmentPiece');
      if ((isFog || isFluidHelper) && mesh.material instanceof StandardMaterial) {
        mesh.material.wireframe = edit;
        mesh.material.alpha = edit ? 0.1 : 0;
        mesh.isVisible = edit || !isFluidHelper;
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

  /** Re-apply SurfaceMaterial params without disposing meshes (setQuiet edits). */
  private refreshSurfaceMaterials(): void {
    for (const [id, mesh] of this.meshes) {
      const mat = this.primaryStandardMaterial(mesh);
      const sm = this.world.get(id, 'SurfaceMaterial');
      if (!mat || !sm) continue;
      // Skip volume helpers — they use their own wireframe look.
      if (this.world.has(id, 'MediaVolume')) continue;
      if (this.world.has(id, 'FogVolume') && !this.world.has(id, 'EnvironmentPiece')) continue;
      const fluid = this.world.get(id, 'FluidVolume');
      if (fluid && fluid.wallMode === 'none' && !this.world.has(id, 'EnvironmentPiece')) continue;
      // Tank walls: prefer wallMode material over stale SurfaceMaterial when present.
      const wallSm = fluid ? surfaceMaterialForFluidWall(fluid.wallMode) : null;
      this.applySurfaceParams(mat, wallSm ?? sm);
    }
  }

  /** Update media/fluid wireframe tint when color changes without AABB rebuild. */
  private refreshVolumeHelperLooks(): void {
    const edit = this.isEditMode();
    for (const [id, mesh] of this.meshes) {
      if (!(mesh.material instanceof StandardMaterial)) continue;
      const media = this.world.get(id, 'MediaVolume');
      if (media) {
        mesh.material.diffuseColor = new Color3(media.color[0], media.color[1], media.color[2]);
        mesh.material.wireframe = edit;
        mesh.material.alpha = edit ? 0.08 : 0;
        continue;
      }
      if (this.world.has(id, 'EnvironmentPiece')) continue;
      const fog = this.world.get(id, 'FogVolume');
      if (fog) {
        mesh.material.diffuseColor = new Color3(fog.color[0], fog.color[1], fog.color[2]);
        mesh.material.wireframe = edit;
        mesh.material.alpha = edit ? 0.1 : 0;
        continue;
      }
      const fluid = this.world.get(id, 'FluidVolume');
      if (fluid && fluid.wallMode === 'none') {
        mesh.material.diffuseColor = new Color3(fluid.color[0], fluid.color[1], fluid.color[2]);
        mesh.material.wireframe = edit;
        mesh.material.alpha = edit ? 0.1 : 0;
        mesh.isVisible = edit;
      }
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
        const fluid = this.world.get(id, 'FluidVolume');
        const fog = this.world.get(id, 'FogVolume');
        const vol = fluid ?? fog;
        if (fluid && fluid.wallMode === 'none') {
          // Water OBB helper only — no PBR tank shell.
          this.spawnFluidHelper(id, fluid.halfExtents, fluid.color);
          continue;
        }
        if (fluid) {
          const wallSm =
            surfaceMaterialForFluidWall(fluid.wallMode) ?? sm;
          this.spawnFluidTankShell(id, fluid.halfExtents, wallSm);
          continue;
        }
        const box = vol
          ? MeshBuilder.CreateBox(
              `prop_${id}`,
              {
                width: vol.halfExtents[0] * 2,
                height: vol.halfExtents[1] * 2,
                depth: vol.halfExtents[2] * 2,
              },
              this.scene,
            )
          : MeshBuilder.CreateBox(`prop_${id}`, { size: 0.5 }, this.scene);
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

      if (this.world.has(id, 'FogVolume')) {
        const vol = this.world.get(id, 'FogVolume')!;
        const t = this.world.get(id, 'Transform')!;
        const box = MeshBuilder.CreateBox(
          `fog_${id}`,
          {
            width: vol.halfExtents[0] * 2,
            height: vol.halfExtents[1] * 2,
            depth: vol.halfExtents[2] * 2,
          },
          this.scene,
        );
        const mat = new StandardMaterial(`fogMat_${id}`, this.scene);
        mat.maxSimultaneousLights = SURFACE_MAX_SIMULTANEOUS_LIGHTS;
        mat.diffuseColor = new Color3(vol.color[0], vol.color[1], vol.color[2]);
        mat.alpha = 0.1;
        mat.transparencyMode = Material.MATERIAL_ALPHABLEND;
        mat.disableDepthWrite = true;
        mat.wireframe = true;
        box.material = mat;
        box.metadata = { entityId: id };
        this.applyTransform(box, t);
        this.meshes.set(id, box);
        continue;
      }

      if (this.world.has(id, 'FluidVolume')) {
        const vol = this.world.get(id, 'FluidVolume')!;
        if (vol.wallMode === 'none') {
          this.spawnFluidHelper(id, vol.halfExtents, vol.color);
          continue;
        }
        const wallSm =
          surfaceMaterialForFluidWall(vol.wallMode) ??
          this.world.get(id, 'SurfaceMaterial') ??
          null;
        this.spawnFluidTankShell(id, vol.halfExtents, wallSm);
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
    this.applyTransmission(mat, sm);
    this.onSurfaceMaterial?.(mat, sm);
    this.onReflection?.(mat, sm);
    this.applyGlassRefraction(mat, sm);
  }

  /**
   * Opaque blocks volumetric beams (depth write); transmission skips depth write
   * so water PP / lasers remain visible through glass.
   */
  private applyTransmission(mat: StandardMaterial, sm: SurfaceMaterial): void {
    const t = clamp01(sm.transmission);
    if (t > 0.02) {
      mat.alpha = Math.max(0.12, 1 - t * 0.85);
      mat.transparencyMode = Material.MATERIAL_ALPHABLEND;
      mat.disableDepthWrite = true;
      // Glass-like dielectric specular (Fresnel via reflectionFresnelParameters + IBL).
      mat.specularColor = new Color3(0.85, 0.9, 0.95);
      mat.specularPower = Math.max(mat.specularPower, 128);
    } else {
      mat.alpha = 1;
      mat.transparencyMode = Material.MATERIAL_OPAQUE;
      mat.disableDepthWrite = false;
      mat.refractionTexture = null;
      if (mat.refractionFresnelParameters) mat.refractionFresnelParameters.isEnabled = false;
      if (mat.reflectionFresnelParameters) mat.reflectionFresnelParameters.isEnabled = false;
    }
  }

  /** Env cubemap refraction + Fresnel for high-transmission glass. */
  private applyGlassRefraction(mat: StandardMaterial, sm: SurfaceMaterial): void {
    if (sm.transmission <= 0.35) {
      mat.refractionTexture = null;
      if (mat.refractionFresnelParameters) mat.refractionFresnelParameters.isEnabled = false;
      return;
    }
    if (mat.reflectionTexture) {
      mat.refractionTexture = mat.reflectionTexture;
      if (mat.refractionTexture) {
        mat.refractionTexture.level = Math.max(mat.reflectionTexture.level ?? 0.85, 0.95);
      }
    }
    // Schlick-ish: stronger reflection at grazing angles for glass.
    const reflF = mat.reflectionFresnelParameters ?? new FresnelParameters();
    reflF.isEnabled = true;
    reflF.bias = 0.15;
    reflF.power = 2.2;
    reflF.leftColor = new Color3(0.12, 0.14, 0.16);
    reflF.rightColor = new Color3(1, 1, 1);
    mat.reflectionFresnelParameters = reflF;

    const refrF = mat.refractionFresnelParameters ?? new FresnelParameters();
    refrF.isEnabled = true;
    refrF.bias = 0.2;
    refrF.power = 1.8;
    refrF.leftColor = new Color3(1, 1, 1);
    refrF.rightColor = new Color3(0.15, 0.18, 0.2);
    mat.refractionFresnelParameters = refrF;
  }

  /**
   * Hollow OBB tank shell (6 thin panels). Glass and solid share the mesh;
   * only SurfaceMaterial / transmission differs.
   */
  private spawnFluidTankShell(
    id: string,
    halfExtents: readonly [number, number, number] | number[],
    sm: SurfaceMaterial | null,
  ): void {
    const hx = halfExtents[0]!;
    const hy = halfExtents[1]!;
    const hz = halfExtents[2]!;
    const thickness = Math.min(0.04, Math.min(hx, hy, hz) * 0.08);
    const root = new Mesh(`fluidWall_${id}`, this.scene);
    root.isPickable = false;
    root.metadata = { entityId: id };
    const mat = this.createSurfaceOrFallback(
      `fluidWallMat_${id}`,
      sm,
      new Color3(0.42, 0.42, 0.45),
    );
    // Slight emissive so glass stays readable without strong IBL.
    if (mat instanceof StandardMaterial && sm && sm.transmission > 0.35) {
      mat.emissiveColor = new Color3(0.04, 0.05, 0.06);
    }
    const panels: ReadonlyArray<{
      name: string;
      w: number;
      h: number;
      d: number;
      x: number;
      y: number;
      z: number;
    }> = [
      { name: 'px', w: thickness, h: hy * 2, d: hz * 2, x: hx - thickness * 0.5, y: 0, z: 0 },
      { name: 'nx', w: thickness, h: hy * 2, d: hz * 2, x: -hx + thickness * 0.5, y: 0, z: 0 },
      { name: 'py', w: hx * 2, h: thickness, d: hz * 2, x: 0, y: hy - thickness * 0.5, z: 0 },
      { name: 'ny', w: hx * 2, h: thickness, d: hz * 2, x: 0, y: -hy + thickness * 0.5, z: 0 },
      { name: 'pz', w: hx * 2, h: hy * 2, d: thickness, x: 0, y: 0, z: hz - thickness * 0.5 },
      { name: 'nz', w: hx * 2, h: hy * 2, d: thickness, x: 0, y: 0, z: -hz + thickness * 0.5 },
    ];
    for (const p of panels) {
      const panel = MeshBuilder.CreateBox(
        `fluidWall_${id}_${p.name}`,
        {
          width: p.w,
          height: p.h,
          depth: p.d,
          sideOrientation: Mesh.DOUBLESIDE,
        },
        this.scene,
      );
      panel.parent = root;
      panel.position.set(p.x, p.y, p.z);
      panel.material = mat;
      panel.metadata = { entityId: id };
      panel.isPickable = true;
    }
    this.applyTransform(root, this.world.get(id, 'Transform')!);
    this.meshes.set(id, root);
  }

  /** Edit-mode wireframe OBB when wallMode is none. */
  private spawnFluidHelper(
    id: string,
    halfExtents: readonly [number, number, number] | number[],
    color: readonly [number, number, number] | number[],
  ): void {
    const t = this.world.get(id, 'Transform')!;
    const box = MeshBuilder.CreateBox(
      `fluid_${id}`,
      {
        width: halfExtents[0]! * 2,
        height: halfExtents[1]! * 2,
        depth: halfExtents[2]! * 2,
      },
      this.scene,
    );
    const mat = new StandardMaterial(`fluidMat_${id}`, this.scene);
    mat.maxSimultaneousLights = SURFACE_MAX_SIMULTANEOUS_LIGHTS;
    mat.diffuseColor = new Color3(color[0]!, color[1]!, color[2]!);
    mat.alpha = this.isEditMode() ? 0.1 : 0;
    mat.transparencyMode = Material.MATERIAL_ALPHABLEND;
    mat.disableDepthWrite = true;
    mat.wireframe = true;
    box.material = mat;
    box.isVisible = this.isEditMode();
    box.metadata = { entityId: id };
    this.applyTransform(box, t);
    this.meshes.set(id, box);
  }

  /** StandardMaterial on the mesh or a shared child (tank shell panels). */
  private primaryStandardMaterial(mesh: AbstractMesh): StandardMaterial | null {
    if (mesh.material instanceof StandardMaterial) return mesh.material;
    for (const child of mesh.getChildMeshes(false)) {
      if (child.material instanceof StandardMaterial) return child.material;
    }
    return null;
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
      for (const child of mesh.getChildMeshes(false)) {
        child.renderOutline = isSel;
        child.outlineColor = mesh.outlineColor;
        child.outlineWidth = 0.04;
      }
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
