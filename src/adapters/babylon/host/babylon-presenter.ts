import {
  ArcRotateCamera,
  Color3,
  Color4,
  DirectionalLight,
  Engine,
  HemisphericLight,
  Scene,
  Vector3,
  type AbstractMesh,
  type Material,
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
  environmentSunDirUnit,
  environmentSunIntensity,
  lightWorldPose,
  resolveAtmosphereSolarPosition,
  resolveEmitterAppearance,
  resolveSceneAmbientLevel,
  resolveVisionBrightnessOpts,
  skyIrradianceApprox,
  sunIrradianceRgb,
  type CameraPose,
  type FramePresenter,
  type GizmoMode,
  type GizmoSpace,
  type Transform,
  type World,
  type BakedNoiseVolume,
  gatherRenderPack,
} from '@engine';
import {
  BlenderCameraControls,
  configureBlenderPointerInputs,
  type WorldAxis,
} from '../camera/blender-camera-controls';
import { AtmosphereEnvCubemap } from '../atmosphere/atmosphere-env-cubemap';
import { AtmosphereLutBaker } from '../atmosphere/atmosphere-lut-baker';
import { AtmosphereNightTextures } from '../atmosphere/atmosphere-night-textures';
import { AtmosphereSkybox } from '../atmosphere/atmosphere-skybox';
import { StaticSkybox } from '../atmosphere/static-skybox';
import { SurfaceLightSync } from '../lights/surface-lights';
import { SceneMeshSync } from '../mesh/scene-mesh-sync';
import { bindViewportPicking } from '../picking/viewport-picking';
import { StudioPipeline } from '../postfx/studio-pipeline';
import { VolumetricBinder } from '../volumetrics/volumetric-binder';
import { FogBinder } from '../fog/fog-binder';
import { WaterOpticsBinder } from '../water/water-optics-binder';

/** Approximate shader warmup progress (WebGL has no native % for parallel compile). */
export interface ShaderCompileStatus {
  compiling: boolean;
  ready: number;
  total: number;
}

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
  /** Fired while shaders warm up (before the first render loop) and once when ready. */
  onShaderCompileStatus?: (status: ShaderCompileStatus) => void;
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
  private readonly fog: FogBinder;
  private readonly waters: WaterOpticsBinder;
  private readonly atmosphereBaker: AtmosphereLutBaker;
  private readonly atmosphereNight: AtmosphereNightTextures;
  private readonly atmosphereSkybox: AtmosphereSkybox;
  private readonly atmosphereEnv: AtmosphereEnvCubemap;
  private readonly staticSkybox: StaticSkybox;
  private readonly depthRenderer: DepthRenderer;
  private readonly hemi: HemisphericLight;
  private readonly sun: DirectionalLight;
  private readonly canvas: HTMLCanvasElement;
  private world: World;
  private disposed = false;
  private renderLoopStarted = false;
  private lastDt = 1 / 60;
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
    // StudioPipeline keeps FXAA after tonemap; theatrical bloom runs inside compose (HDR).
    this.volumetrics = new VolumetricBinder(
      this.engine,
      this.scene,
      this.camera,
      this.world.resources.Quality.renderScale,
    );
    this.volumetrics.bindWorld(this.world, this.camera);
    this.fog = new FogBinder(this.scene);
    this.waters = new WaterOpticsBinder(this.scene);
    this.volumetrics.bindFog(this.fog);
    this.atmosphereBaker = new AtmosphereLutBaker(this.engine, this.scene);
    this.atmosphereNight = new AtmosphereNightTextures(this.scene);
    this.atmosphereSkybox = new AtmosphereSkybox(
      this.scene,
      this.atmosphereBaker,
      this.atmosphereNight,
    );
    this.atmosphereEnv = new AtmosphereEnvCubemap(
      this.scene,
      this.atmosphereBaker,
      this.atmosphereNight,
    );
    this.staticSkybox = new StaticSkybox(this.scene);
    this.meshes.setReflectionHook((mat, sm) => {
      if (!sm) {
        mat.reflectionTexture = null;
        mat.refractionTexture = null;
        if (mat.reflectionFresnelParameters) mat.reflectionFresnelParameters.isEnabled = false;
        if (mat.refractionFresnelParameters) mat.refractionFresnelParameters.isEnabled = false;
        return;
      }
      if (this.world.resources.Atmosphere?.enabled) {
        this.atmosphereEnv.applyToMaterial(mat, sm.metalness, sm.roughness);
      } else {
        const env = this.staticSkybox.environmentTexture;
        if (env) {
          mat.reflectionTexture = env;
          const base = this.world.resources.Atmosphere?.reflectionLevel ?? 0.85;
          mat.reflectionTexture.level = sm.transmission > 0.35 ? Math.max(base, 1.05) : base;
        } else {
          mat.reflectionTexture = null;
        }
      }
      // Glass: pair refraction with the same env cubemap + Fresnel edges.
      if (sm.transmission > 0.35 && mat.reflectionTexture) {
        mat.refractionTexture = mat.reflectionTexture;
        if (mat.refractionTexture) {
          mat.refractionTexture.level = Math.max(mat.reflectionTexture.level ?? 0.85, 0.95);
        }
      } else {
        mat.refractionTexture = null;
        if (mat.refractionFresnelParameters) mat.refractionFresnelParameters.isEnabled = false;
      }
    });
    // Camera-space Z depth — opaque surfaces stop volumetric beams; transparent (transmission) skip depth write.
    // Driven manually before the volumetric pass (not via scene custom RTs) so occlusion
    // matches this frame's camera instead of lagging one frame behind.
    this.depthRenderer = this.scene.enableDepthRenderer(
      this.camera,
      false,
      true,
      1, // NEAREST — stable occlusion edges when volumetric samples at lower res
      true,
    );
    this.depthRenderer.forceDepthWriteTransparentMeshes = false;
    this.depthRenderer.enabled = false;
    this.volumetrics.setSceneDepthTexture(this.depthRenderer.getDepthMap());
    // Fog atlases; water PP runs on HDR scene *before* compose; StudioPipeline keeps FXAA after tonemap.
    this.fog.attach(
      this.world,
      this.camera,
      this.depthRenderer.getDepthMap(),
      this.volumetrics.compose,
    );
    this.waters.attach(
      this.world,
      this.camera,
      this.depthRenderer.getDepthMap(),
      this.volumetrics.compose,
    );
    this.pipeline = new StudioPipeline(this.scene, this.camera);
    // DRP may reshuffle the chain — re-assert water immediately before compose.
    this.waters.attach(
      this.world,
      this.camera,
      this.depthRenderer.getDepthMap(),
      this.volumetrics.compose,
    );

    this.pickingDispose = bindViewportPicking(
      this.scene,
      this.meshes.gizmo,
      () => this.world.resources.PresentationMode === 'edit',
      (id, mods) => this.options.onPick?.(id, mods),
    ).dispose;

    this.meshes.applyPresentationMode();

    // Canvas CSS size changes on panel split / layout, not only on window resize.
    this.canvasResizeObserver = new ResizeObserver(() => this.onResize());
    this.canvasResizeObserver.observe(this.canvas);
    window.addEventListener('resize', this.onResize);
    this.resize();

    // Defer the render loop until materials + volumetric effects finish compiling.
    // Refresh freezes are mostly WebGL parallel shader compile/link spikes.
    void this.warmupShadersThenStartLoop();
  }

  private emitCompileStatus(status: ShaderCompileStatus): void {
    this.options.onShaderCompileStatus?.(status);
  }

  private startRenderLoop(): void {
    if (this.disposed || this.renderLoopStarted) return;
    this.renderLoopStarted = true;
    this.engine.runRenderLoop(() => {
      if (this.disposed) return;
      const dt = this.engine.getDeltaTime() / 1000;
      this.lastDt = dt > 0 && Number.isFinite(dt) ? Math.min(dt, 0.05) : 1 / 60;
      if (this.options.onTick) {
        this.options.onTick(dt);
      } else {
        this.syncViewCamera(this.world);
        this.sync(this.world);
        this.render();
      }
      this.options.onFrame?.(this.getCameraPose());
    });
  }

  /**
   * Pre-compile scene materials and wait for volumetric / compose effects.
   * Progress is ready/total units only — WebGL parallel compile has no native %.
   */
  private async warmupShadersThenStartLoop(): Promise<void> {
    this.emitCompileStatus({ compiling: true, ready: 0, total: 0 });
    this.sync(this.world);

    const materialJobs: { mesh: AbstractMesh; mat: Material }[] = [];
    for (const mesh of this.scene.meshes) {
      const mat = mesh.material;
      if (!mat || mesh.name.startsWith('__')) continue;
      // Media wireframes skip SurfaceRadiance — no need to force-compile them early.
      if (mat.name.startsWith('mediaMat_')) continue;
      materialJobs.push({ mesh, mat });
    }

    const total = materialJobs.length + 2;
    let ready = 0;
    const bump = (): void => {
      ready = Math.min(total, ready + 1);
      this.emitCompileStatus({ compiling: true, ready, total });
    };
    this.emitCompileStatus({ compiling: true, ready: 0, total });

    // Heaviest program first (volumetric raymarch + compose).
    await this.waitVolumetricShaders(bump);
    if (this.disposed) return;

    await Promise.all(
      materialJobs.map(({ mesh, mat }) =>
        mat
          .forceCompilationAsync(mesh)
          .then(() => bump())
          .catch(() => bump()),
      ),
    );
    if (this.disposed) return;

    try {
      await this.scene.whenReadyAsync();
    } catch {
      /* ignore — still start the loop */
    }
    if (this.disposed) return;

    this.emitCompileStatus({ compiling: false, ready: total, total });
    this.startRenderLoop();
  }

  /** Poll raymarch + compose readiness; bump once per unit as each becomes ready. */
  private waitVolumetricShaders(onUnitReady: () => void, timeoutMs = 120_000): Promise<void> {
    return new Promise((resolve) => {
      const started = performance.now();
      let rayDone = false;
      let composeDone = false;
      const step = (): void => {
        if (this.disposed) {
          resolve();
          return;
        }
        if (!rayDone && this.volumetrics.isRaymarchReady()) {
          rayDone = true;
          onUnitReady();
        }
        if (!composeDone && this.volumetrics.isComposeReady()) {
          composeDone = true;
          onUnitReady();
        }
        if (rayDone && composeDone) {
          resolve();
          return;
        }
        if (performance.now() - started > timeoutMs) {
          if (!rayDone) onUnitReady();
          if (!composeDone) onUnitReady();
          resolve();
          return;
        }
        requestAnimationFrame(step);
      };
      step();
    });
  }

  setWorld(world: World): void {
    this.world = world;
    this.meshes.setWorld(world);
    this.volumetrics.bindWorld(world, this.camera);
    this.applyQualitySettings();
  }

  /** Live view camera → ECS before gather (see StudioRuntime.tick). */
  syncViewCamera(world: World): void {
    this.world = world;
    this.syncCameraToResource(true);
  }

  sync(world: World): void {
    this.world = world;
    // Pose already applied in syncViewCamera; only refresh ArcRotate position cache.
    this.syncCameraToResource(false);
    this.syncAtmosphere(world);
    this.syncEnvironmentLighting(world);
    this.meshes.sync();
    this.lights.sync(world, world.resources.RenderFrame);
    this.pipeline.syncBloomFromLights(world);
    this.volumetrics.setTheatricalBloom(this.pipeline.theatricalBloom);
    this.volumetrics.bindWorld(world, this.camera);
    this.volumetrics.applyRenderScale(world.resources.Quality.renderScale);
  }

  /** Bake sky LUTs + drive skybox / aerial compose + IBL cubemap when Atmosphere.enabled. */
  private syncAtmosphere(world: World): void {
    const atmo = world.resources.Atmosphere;
    if (!atmo?.enabled) {
      this.atmosphereSkybox.setEnabled(false);
      this.atmosphereEnv.clear();
      this.staticSkybox.sync(atmo?.skyboxAssetId ?? null);
      this.meshes.reapplyReflections();
      this.waters.setEnvTexture(null);
      this.volumetrics.setAerialPerspectiveLut(null);
      return;
    }
    this.staticSkybox.clear();
    this.atmosphereNight.ensure(atmo.nightSkyTextureId, atmo.moonTextureId);
    const spa = resolveAtmosphereSolarPosition(atmo);
    this.atmosphereBaker.sync(atmo, spa.lightDirWorld);
    this.atmosphereSkybox.setEnabled(true);
    const ambientLevel = resolveSceneAmbientLevel(
      world.resources.EnvironmentLighting.ambientLevel,
      atmo,
    );
    const quality = world.resources.Quality;
    const skyOpts = {
      ambientLevel,
      exposure: atmo.exposure,
      sunAngularDiameterDeg: atmo.sunAngularDiameterDeg,
      lutBlend: atmo.lutBlend,
      lutReady: this.atmosphereBaker.skyLutsReady,
      reflectionLevel: atmo.reflectionLevel,
      // Unity/Unreal: sky writes into the HDR buffer; SDR clamps only at display compose.
      skyboxHdrColors: quality.colorProfile === 'hdr',
      nightExposure: atmo.nightExposure,
      moonAngularDiameterDeg: atmo.moonAngularDiameterDeg,
      moonExposure: atmo.moonExposure,
      nightBlendStrength: atmo.nightBlendStrength,
      skyboxGroundColor: atmo.skyboxGroundColor,
      skyboxEquatorColor: atmo.skyboxEquatorColor,
      envCubeSize: atmo.envCubeSize,
    };
    this.atmosphereSkybox.sync(
      this.camera,
      atmo.model,
      spa.lightDirWorld,
      skyOpts,
    );
    this.atmosphereEnv.sync(atmo.model, spa.lightDirWorld, skyOpts);
    this.meshes.reapplyReflections();
    // Water PP uses equirect sampler2D + procedural sky; cube IBL stays on StandardMaterials.
    this.waters.setEnvTexture(null);
    this.volumetrics.setAerialPerspectiveLut(
      this.atmosphereBaker.aerialPerspectiveLut,
    );
  }

  /** Apply environment ambient + optional primary Sun entity / SPA to fill lights. */
  private syncEnvironmentLighting(world: World): void {
    const atmo = world.resources.Atmosphere;
    const ambientLevel = resolveSceneAmbientLevel(
      world.resources.EnvironmentLighting.ambientLevel,
      atmo,
    );

    if (atmo?.enabled) {
      const spa = resolveAtmosphereSolarPosition(atmo);
      // Horizon-tint clear so empty pixels never stay pitch-black under the sky pass.
      const hemi = skyIrradianceApprox(atmo.model, spa.lightDirWorld, ambientLevel);
      const scale = 1.8;
      this.scene.clearColor = new Color4(
        Math.min(1, hemi[0] * scale),
        Math.min(1, hemi[1] * scale),
        Math.min(1, hemi[2] * scale),
        1,
      );
      this.hemi.intensity = environmentHemiIntensity(ambientLevel) * 0.85;
      this.sun.direction = new Vector3(
        spa.lightDirWorld[0],
        spa.lightDirWorld[1],
        spa.lightDirWorld[2],
      );
      const sunRgb = sunIrradianceRgb(atmo.model, spa.lightDirWorld, ambientLevel);
      const sunEnergy = Math.max(sunRgb[0], sunRgb[1], sunRgb[2], 1e-6);
      this.sun.intensity = environmentSunIntensity(ambientLevel) * (0.4 + sunEnergy * 2.5);
      this.sun.diffuse = new Color3(
        Math.min(1, sunRgb[0] / sunEnergy),
        Math.min(1, sunRgb[1] / sunEnergy),
        Math.min(1, sunRgb[2] / sunEnergy),
      );
      return;
    }

    const [r, g, b] = environmentClearRgb(ambientLevel);
    this.scene.clearColor = new Color4(r, g, b, 1);
    this.hemi.intensity = environmentHemiIntensity(ambientLevel);

    const primarySunId = world.resources.SceneSun.primaryId;
    if (primarySunId) {
      const emitter = world.get(primarySunId, 'LightEmitter');
      if (emitter?.enabled) {
        const pose = lightWorldPose(world, primarySunId);
        this.sun.direction = new Vector3(
          pose.direction[0],
          pose.direction[1],
          pose.direction[2],
        );
        const base = environmentSunIntensity(ambientLevel);
        const appearance = resolveEmitterAppearance(
          emitter,
          resolveVisionBrightnessOpts(
            world.resources.EnvironmentLighting.ambientLevel,
            atmo,
            world.resources.DisplayVision.responseCurve,
            world.resources.Quality.colorProfile,
          ),
        );
        // Soft educational scale from lumen intensity (~80 klm ≈ default demo sun).
        const powerScale = Math.min(3, 0.35 + emitter.intensityLm * 8e-6);
        this.sun.intensity = base * powerScale;
        this.sun.diffuse = new Color3(
          appearance.chroma[0],
          appearance.chroma[1],
          appearance.chroma[2],
        );
        return;
      }
      this.sun.intensity = 0;
      return;
    }

    const [dx, dy, dz] = environmentSunDirUnit();
    this.sun.direction = new Vector3(dx, dy, dz);
    this.sun.intensity = environmentSunIntensity(ambientLevel);
  }

  render(): void {
    // Force-refresh depth for this camera before raymarch (auto gather is disabled).
    this.depthRenderer.getDepthMap().render(true);
    const pack = this.world.resources.RenderFrame ?? gatherRenderPack(this.world);
    try {
      this.fog.step(pack, this.lastDt);
      this.waters.step(pack, this.lastDt);
    } catch (err) {
      console.warn('[BabylonPresenter] fluid step failed', err);
    }
    this.lights.sync(this.world, pack);
    this.volumetrics.renderPass();
    // Camera already finalized in syncViewCamera before gather. Skipping a second
    // update() keeps solids / water PP / packed centerCam on the same pose.
    this.scene.render(false);
  }

  get lastPack() {
    return this.volumetrics.lastPack;
  }

  /** Smoothed compose exposure (auto when sky ON). */
  get autoExposure(): number {
    return this.volumetrics.autoExposure;
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

  setGizmoSpace(space: GizmoSpace): void {
    this.meshes.setGizmoSpace(space);
  }

  applyQualitySettings(): void {
    const q = this.world.resources.Quality;
    this.volumetrics.applyRenderScale(q.renderScale);
    this.pipeline.applyAntiAliasing(q.antiAliasing);
  }

  /** Sync baked noise library (2D/3D) to volumetric GPU cache. */
  syncNoiseLibrary(entries: ReadonlyArray<{ id: string; baked: BakedNoiseVolume }>): void {
    this.volumetrics.syncNoiseLibrary(entries);
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
    this.atmosphereSkybox.dispose();
    this.atmosphereEnv.dispose();
    this.staticSkybox.dispose();
    this.atmosphereNight.dispose();
    this.atmosphereBaker.dispose();
    this.fog.dispose();
    this.waters.dispose();
    this.volumetrics.dispose();
    this.scene.disableDepthRenderer(this.camera);
    this.scene.dispose();
    this.engine.dispose();
  }

  /**
   * @param applyInputs When true, run camera.update() (pointer/inertia) before reading pose.
   *   Only do this once per frame, before gather — never again before scene.render(false).
   */
  private syncCameraToResource(applyInputs: boolean): void {
    if (applyInputs) {
      this.camera.update();
    }
    this.camera.getViewMatrix();
    const pos = this.camera.position;
    const target = this.camera.getTarget();
    this.world.resources.Camera.position = [pos.x, pos.y, pos.z];
    this.world.resources.Camera.target = [target.x, target.y, target.z];
    this.world.resources.Camera.dirty = false;
  }
}
