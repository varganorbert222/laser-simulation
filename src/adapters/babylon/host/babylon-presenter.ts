import {
  ArcRotateCamera,
  Color3,
  Color4,
  DirectionalLight,
  Engine,
  HemisphericLight,
  Scene,
  Vector3,
} from '@babylonjs/core';
import '@babylonjs/core/Engines/engine.js';
import '@babylonjs/core/Materials/standardMaterial.js';
import '@babylonjs/core/Lights/hemisphericLight.js';
import '@babylonjs/core/Lights/directionalLight.js';
import '@babylonjs/core/Lights/spotLight.js';
import '@babylonjs/core/Lights/pointLight.js';
import '@babylonjs/core/Rendering/depthRendererSceneComponent.js';
import type { DepthRenderer } from '@babylonjs/core/Rendering/depthRenderer.js';
import {
  environmentClearRgb,
  environmentHemiIntensity,
  environmentSunIntensity,
  type CameraPose,
  type FramePresenter,
  type GizmoMode,
  type Transform,
  type World,
} from '../../../engine';
import {
  BlenderCameraControls,
  configureBlenderPointerInputs,
  type WorldAxis,
} from '../camera/blender-camera-controls';
import { SurfaceLightSync } from '../lights/surface-lights';
import { SceneMeshSync } from '../mesh/scene-mesh-sync';
import { bindViewportPicking } from '../picking/viewport-picking';
import { StudioPipeline } from '../postfx/studio-pipeline';
import { VolumetricBinder } from '../volumetrics/volumetric-binder';

export interface BabylonPresenterOptions {
  canvas: HTMLCanvasElement;
  world: World;
  onPick?: (entityId: string | null, mods?: { ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean }) => void;
  onTransformDragStart?: (entityId: string) => void;
  onTransformDragEnd?: (entityId: string, transform: Transform) => void;
  /** Called after each presented frame with framework-free camera pose. */
  onFrame?: (pose: CameraPose) => void;
  /** Invoked each RAF with dt; should call StudioRuntime.tick(dt). */
  onTick?: (dt: number) => void;
}

/**
 * Babylon view adapter — implements FramePresenter. Does not own ECS systems.
 */
export class BabylonPresenter implements FramePresenter {
  readonly engine: Engine;
  readonly scene: Scene;
  readonly camera: ArcRotateCamera;
  readonly cameraControls: BlenderCameraControls;

  private readonly meshes: SceneMeshSync;
  private readonly lights: SurfaceLightSync;
  private readonly pipeline: StudioPipeline;
  private readonly volumetrics: VolumetricBinder;
  private readonly depthRenderer: DepthRenderer;
  private readonly hemi: HemisphericLight;
  private readonly sun: DirectionalLight;
  private readonly canvas: HTMLCanvasElement;
  private world: World;
  private disposed = false;
  private pickingDispose: (() => void) | null = null;
  private canvasResizeObserver: ResizeObserver | null = null;
  private readonly onContextMenu = (e: Event) => e.preventDefault();
  private readonly onResize = (): void => {
    if (this.disposed) return;
    this.resize();
  };

  constructor(private readonly options: BabylonPresenterOptions) {
    this.world = options.world;
    this.canvas = options.canvas;
    this.engine = new Engine(options.canvas, true, {
      preserveDrawingBuffer: true,
      stencil: true,
    });
    this.scene = new Scene(this.engine);
    this.scene.clearColor = new Color4(0.04, 0.05, 0.07, 1);

    const cam = this.world.resources.Camera;
    this.camera = new ArcRotateCamera(
      'studioCam',
      Math.atan2(cam.position[0] - cam.target[0], cam.position[2] - cam.target[2]),
      Math.acos(
        (cam.position[1] - cam.target[1]) /
          Math.hypot(
            cam.position[0] - cam.target[0],
            cam.position[1] - cam.target[1],
            cam.position[2] - cam.target[2],
          ),
      ),
      Math.hypot(
        cam.position[0] - cam.target[0],
        cam.position[1] - cam.target[1],
        cam.position[2] - cam.target[2],
      ),
      new Vector3(...cam.target),
      this.scene,
    );
    this.camera.lowerRadiusLimit = 0.5;
    this.camera.upperRadiusLimit = 2000;
    this.camera.wheelPrecision = 40;
    this.camera.minZ = cam.near;
    this.camera.maxZ = cam.far;
    this.camera.panningSensibility = 800;
    configureBlenderPointerInputs(this.camera, options.canvas);
    this.cameraControls = new BlenderCameraControls(this.camera, options.canvas, {
      target: this.camera.getTarget().clone(),
      alpha: this.camera.alpha,
      beta: this.camera.beta,
      radius: this.camera.radius,
    });
    options.canvas.addEventListener('contextmenu', this.onContextMenu);

    const hemi = new HemisphericLight('hemi', new Vector3(0, 1, 0), this.scene);
    hemi.intensity = 0.22;
    hemi.groundColor = new Color3(0.05, 0.06, 0.08);
    this.hemi = hemi;
    const sun = new DirectionalLight('sun', new Vector3(-0.4, -1, -0.3), this.scene);
    sun.intensity = 0.12;
    this.sun = sun;

    this.meshes = new SceneMeshSync(
      this.scene,
      this.world,
      (id) => this.options.onTransformDragStart?.(id),
      (id, t) => this.options.onTransformDragEnd?.(id, t),
    );
    this.lights = new SurfaceLightSync(this.scene);
    // Exp-B: SurfaceRadiancePlugin on every StandardMaterial (including ground).
    this.meshes.setSurfaceMaterialHook((mat, sm) => this.lights.attachMaterial(mat, sm));
    this.meshes.setWorld(this.world);
    // Low-res volumetric RTT + native compose PP (Babylon multi-pass pattern).
    // StudioPipeline (bloom/FXAA) attaches after so the scene RT stays native.
    this.volumetrics = new VolumetricBinder(
      this.engine,
      this.scene,
      this.camera,
      this.world.resources.Quality.renderScale,
    );
    this.volumetrics.bindWorld(this.world, this.camera);
    // Camera-space Z depth — opaque surfaces stop volumetric beams; transparent (transmission) skip depth write.
    this.depthRenderer = this.scene.enableDepthRenderer(
      this.camera,
      false,
      true,
      undefined,
      true,
    );
    this.depthRenderer.forceDepthWriteTransparentMeshes = false;
    this.volumetrics.setSceneDepthTexture(this.depthRenderer.getDepthMap());
    this.pipeline = new StudioPipeline(this.scene, this.camera);

    this.pickingDispose = bindViewportPicking(
      this.scene,
      this.meshes.gizmo,
      () => this.world.resources.PresentationMode === 'edit',
      (id, mods) => this.options.onPick?.(id, mods),
    ).dispose;

    this.meshes.applyPresentationMode();

    this.engine.runRenderLoop(() => {
      if (this.disposed) return;
      const dt = this.engine.getDeltaTime() / 1000;
      if (this.options.onTick) {
        this.options.onTick(dt);
      } else {
        this.sync(this.world);
        this.render();
      }
      this.options.onFrame?.(this.getCameraPose());
    });

    // Canvas CSS size changes on panel split / layout, not only on window resize.
    this.canvasResizeObserver = new ResizeObserver(() => this.onResize());
    this.canvasResizeObserver.observe(this.canvas);
    window.addEventListener('resize', this.onResize);
    this.resize();
  }

  setWorld(world: World): void {
    this.world = world;
    this.meshes.setWorld(world);
    this.volumetrics.bindWorld(world, this.camera);
    this.applyQualitySettings();
  }

  sync(world: World): void {
    this.world = world;
    this.syncCameraToResource();
    this.syncEnvironmentLighting(world.resources.EnvironmentLighting.ambientLevel);
    this.meshes.sync();
    this.lights.sync(world);
    this.pipeline.syncBloomFromLights(world);
    this.volumetrics.bindWorld(world, this.camera);
    this.volumetrics.applyRenderScale(world.resources.Quality.renderScale);
  }

  /** Apply environment ambient to fill lights + clear color (source of eye exposure). */
  private syncEnvironmentLighting(ambientLevel: number): void {
    const [r, g, b] = environmentClearRgb(ambientLevel);
    this.scene.clearColor = new Color4(r, g, b, 1);
    this.hemi.intensity = environmentHemiIntensity(ambientLevel);
    this.sun.intensity = environmentSunIntensity(ambientLevel);
  }

  render(): void {
    this.volumetrics.renderPass();
    this.scene.render();
  }

  get lastPack() {
    return this.volumetrics.lastPack;
  }

  getCameraPose(): CameraPose {
    const pos = this.camera.position;
    const target = this.camera.getTarget();
    return {
      position: [pos.x, pos.y, pos.z],
      target: [target.x, target.y, target.z],
      fovYDeg: (this.camera.fov * 180) / Math.PI,
    };
  }

  orbitCamera(dx: number, dy: number): void {
    this.cameraControls.orbitByPixels(dx, dy);
  }

  snapCameraAxis(axis: WorldAxis, opposite = false): void {
    this.cameraControls.snapToWorldAxis(axis, opposite);
  }

  setGizmoMode(mode: GizmoMode): void {
    this.meshes.setGizmoMode(mode);
  }

  applyQualitySettings(): void {
    const q = this.world.resources.Quality;
    this.volumetrics.applyRenderScale(q.renderScale);
    this.pipeline.applyAntiAliasing(q.antiAliasing);
  }

  applyPresentationMode(): void {
    this.meshes.applyPresentationMode();
  }

  resize(): void {
    this.engine.resize();
    this.volumetrics.resize();
  }

  screenshotPng(): string {
    return this.engine.getRenderingCanvas()?.toDataURL('image/png') ?? '';
  }

  dispose(): void {
    this.disposed = true;
    this.canvasResizeObserver?.disconnect();
    this.canvasResizeObserver = null;
    window.removeEventListener('resize', this.onResize);
    this.canvas.removeEventListener('contextmenu', this.onContextMenu);
    this.pickingDispose?.();
    this.cameraControls.dispose();
    this.meshes.dispose();
    this.lights.dispose();
    this.pipeline.dispose();
    this.volumetrics.dispose();
    this.scene.disableDepthRenderer(this.camera);
    this.scene.dispose();
    this.engine.dispose();
  }

  private syncCameraToResource(): void {
    const pos = this.camera.position;
    const target = this.camera.getTarget();
    this.world.resources.Camera.position = [pos.x, pos.y, pos.z];
    this.world.resources.Camera.target = [target.x, target.y, target.z];
    this.world.resources.Camera.dirty = false;
  }
}
