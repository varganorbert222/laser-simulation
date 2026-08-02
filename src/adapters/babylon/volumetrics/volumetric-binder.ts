import {
  Color4,
  Effect,
  EffectRenderer,
  EffectWrapper,
  Matrix,
  PostProcess,
  RawTexture3D,
  RenderTargetTexture,
  Vector2,
  Vector3,
  Viewport,
  type BaseTexture,
  type Camera,
  type Engine,
  type Scene,
} from '@babylonjs/core';
import '@babylonjs/core/Engines/engine.js';
import '@babylonjs/core/Engines/Extensions/engine.readTexture.js';
import { Constants } from '@babylonjs/core/Engines/constants';
import {
  AUTO_EXPOSURE_KEY,
  FLARE_ELEMENT_SLOTS,
  LENS_FLARE_SLOTS,
  MANUAL_HDR_EXPOSURE,
  VOLUMETRIC_FLUID_SLOTS,
  VOLUMETRIC_LIGHT_SLOTS,
  VOLUMETRIC_MEDIA_SLOTS,
  clampRenderScale,
  defaultLensFlareOptics,
  exposureFromAvgLuminance,
  gatherRenderPack,
  lensFlareElementKindCode,
  lensFlareFacingWeight,
  manualComposeExposure,
  smoothExposure,
  type BakedNoiseVolume,
  type GatheredFrame,
  type World,
} from '@engine';
import {
  VOLUMETRIC_COMPOSE_FRAGMENT,
  VOLUMETRIC_COMPOSE_SHADER_KEY,
  VOLUMETRIC_FRAGMENT,
  VOLUMETRIC_LUMINANCE_FRAGMENT,
  VOLUMETRIC_LUMINANCE_REDUCE_FRAGMENT,
  VOLUMETRIC_SAMPLERS,
  VOLUMETRIC_SHADER_KEY,
  VOLUMETRIC_UNIFORMS,
} from '../shaders/load-shaders';
import { NoiseTextureCache } from './noise-volume-texture';
import type { FogBinder } from '../fog/fog-binder';

Effect.ShadersStore[VOLUMETRIC_SHADER_KEY] = VOLUMETRIC_FRAGMENT;
Effect.ShadersStore[VOLUMETRIC_COMPOSE_SHADER_KEY] = VOLUMETRIC_COMPOSE_FRAGMENT;

type EffectLike = {
  setFloat: (name: string, v: number) => void;
  setVector2: (name: string, v: Vector2) => void;
  setVector3: (name: string, v: Vector3) => void;
  setMatrix: (name: string, v: Matrix) => void;
  setTexture: (name: string, texture: BaseTexture) => void;
};

type AbsoluteSize = { width: number; height: number };

const LUMINANCE_METER_SIZE = 32;

/**
 * Volumetric lights via Babylon multi-pass RTT pattern:
 * https://doc.babylonjs.com/features/featuresDeepDive/postProcesses/renderTargetTextureMultiPass
 *
 * 1. Low-res RenderTargetTexture — raymarch / light contribution only
 * 2. Native PostProcess (ratio 1.0) — blend RTT into the scene renderbuffer
 *
 * Scene geometry never leaves native resolution; only the expensive pass is scaled.
 */
export class VolumetricBinder {
  /** Low-res volumetric / light contribution. */
  readonly volumetricTarget: RenderTargetTexture;
  /** Native-res compose: scene + upsampled volumetrics. */
  readonly compose: PostProcess;

  /** Last smoothed compose exposure (for UI readout). */
  get autoExposure(): number {
    return this.smoothedExposure;
  }

  private readonly effectRenderer: EffectRenderer;
  private readonly volumetricEffect: EffectWrapper;
  private readonly luminanceEffect: EffectWrapper;
  private readonly luminanceReduceEffect: EffectWrapper;
  private readonly luminanceMeter: RenderTargetTexture;
  private readonly luminanceAvg: RenderTargetTexture;
  private readonly noiseTextures: NoiseTextureCache;

  private lastRenderScale = 1;
  private lastVolW = 0;
  private lastVolH = 0;
  lastPack: GatheredFrame | null = null;

  /** Temporal EMA of lens-flare amplitudes (stable vs volumetric sparkle). */
  private readonly flareIntensitySmooth = new Map<string, number>();
  private flareSmoothFrame = 0;

  private _world: World | null = null;
  private _camera: Camera | null = null;
  private _sceneDepth: BaseTexture | null = null;
  /** Optional atmosphere aerial-perspective 3D LUT (distant haze in compose). */
  private _aerialLut: BaseTexture | null = null;
  private readonly _aerialDummy: RawTexture3D;

  private smoothedExposure = MANUAL_HDR_EXPOSURE;
  private readingLuminance = false;
  private _meterSceneTex: BaseTexture | null = null;
  private _fog: FogBinder | null = null;
  private readonly _fluidDummy: RenderTargetTexture;
  private theatricalBloomWeight = 0;
  private theatricalBloomThreshold = 0.85;

  constructor(
    private readonly engine: Engine,
    private readonly scene: Scene,
    camera: Camera,
    initialScale: number,
  ) {
    const scale = clampRenderScale(initialScale);
    const vol = this.volumetricSize(scale);

    this.noiseTextures = new NoiseTextureCache(scene);

    this._aerialDummy = new RawTexture3D(
      new Uint8Array([0, 0, 0, 255]),
      1,
      1,
      1,
      Constants.TEXTUREFORMAT_RGBA,
      scene,
      false,
      false,
      Constants.TEXTURE_NEAREST_SAMPLINGMODE,
      Constants.TEXTURETYPE_UNSIGNED_BYTE,
    );

    this._fluidDummy = new RenderTargetTexture(
      'fluidDensityDummy',
      { width: 1, height: 1 },
      scene,
      false,
      true,
      Constants.TEXTURETYPE_UNSIGNED_BYTE,
      false,
      Constants.TEXTURE_NEAREST_SAMPLINGMODE,
      false,
      false,
    );
    this._fluidDummy.renderList = [];
    this._fluidDummy.clearColor = new Color4(0, 0, 0, 0);

    // Prefer half-float so HDR laser/sky energy survives until compose tonemap.
    const volType = this.pickVolumetricTextureType();
    this.volumetricTarget = new RenderTargetTexture(
      'volumetricLights',
      vol,
      scene,
      false,
      true,
      volType,
      false,
      Constants.TEXTURE_BILINEAR_SAMPLINGMODE,
      false,
      false,
    );
    this.volumetricTarget.clearColor = new Color4(0, 0, 0, 0);
    this.volumetricTarget.wrapU = Constants.TEXTURE_CLAMP_ADDRESSMODE;
    this.volumetricTarget.wrapV = Constants.TEXTURE_CLAMP_ADDRESSMODE;
    // Drawn manually with EffectRenderer — no mesh renderList / customRenderTargets.
    this.volumetricTarget.renderList = [];

    this.effectRenderer = new EffectRenderer(engine);
    this.volumetricEffect = new EffectWrapper({
      engine,
      name: 'volumetricRaymarch',
      fragmentShader: VOLUMETRIC_FRAGMENT,
      uniformNames: [...VOLUMETRIC_UNIFORMS],
      samplerNames: [...VOLUMETRIC_SAMPLERS],
      useAsPostProcess: true,
      allowEmptySourceTexture: true,
    });
    this.volumetricEffect.onApplyObservable.add(() => {
      this.applyUniforms(this.volumetricEffect.effect as unknown as EffectLike);
    });

    this.luminanceMeter = new RenderTargetTexture(
      'volumetricLumMeter',
      { width: LUMINANCE_METER_SIZE, height: LUMINANCE_METER_SIZE },
      scene,
      false,
      true,
      Constants.TEXTURETYPE_HALF_FLOAT,
      false,
      Constants.TEXTURE_NEAREST_SAMPLINGMODE,
      false,
      false,
    );
    this.luminanceMeter.renderList = [];
    this.luminanceMeter.wrapU = Constants.TEXTURE_CLAMP_ADDRESSMODE;
    this.luminanceMeter.wrapV = Constants.TEXTURE_CLAMP_ADDRESSMODE;

    this.luminanceAvg = new RenderTargetTexture(
      'volumetricLumAvg',
      { width: 1, height: 1 },
      scene,
      false,
      true,
      Constants.TEXTURETYPE_HALF_FLOAT,
      false,
      Constants.TEXTURE_NEAREST_SAMPLINGMODE,
      false,
      false,
    );
    this.luminanceAvg.renderList = [];

    this.luminanceEffect = new EffectWrapper({
      engine,
      name: 'volumetricLuminance',
      fragmentShader: VOLUMETRIC_LUMINANCE_FRAGMENT,
      uniformNames: [],
      samplerNames: ['textureSampler', 'volumetricTexture'],
      useAsPostProcess: true,
      allowEmptySourceTexture: true,
    });
    this.luminanceEffect.onApplyObservable.add(() => {
      const fx = this.luminanceEffect.effect as unknown as EffectLike;
      if (this._meterSceneTex) {
        fx.setTexture('textureSampler', this._meterSceneTex);
      }
      fx.setTexture('volumetricTexture', this.volumetricTarget);
    });

    this.luminanceReduceEffect = new EffectWrapper({
      engine,
      name: 'volumetricLuminanceReduce',
      fragmentShader: VOLUMETRIC_LUMINANCE_REDUCE_FRAGMENT,
      uniformNames: ['uTexel', 'uSize'],
      samplerNames: ['textureSampler'],
      useAsPostProcess: true,
      allowEmptySourceTexture: true,
    });
    this.luminanceReduceEffect.onApplyObservable.add(() => {
      const fx = this.luminanceReduceEffect.effect as unknown as EffectLike;
      const inv = 1 / LUMINANCE_METER_SIZE;
      fx.setVector2('uTexel', new Vector2(inv, inv));
      fx.setFloat('uSize', LUMINANCE_METER_SIZE);
      fx.setTexture('textureSampler', this.luminanceMeter);
    });

    // Native compose only — keeps the camera PP chain (and scene RT) at full resolution.
    const flareUniformNames: string[] = [
      'uLensFlareEnabled',
      'uFlareCount',
      'uUseSceneDepthFlare',
      'uFlareLightsVolBloom',
      'uFlareSunVolBloom',
      'uFlareElementCount',
      'uFlareChromatic',
      'uFlareDirt',
    ];
    for (let i = 0; i < LENS_FLARE_SLOTS; i++) {
      flareUniformNames.push(
        `uFlareScreen${i}`,
        `uFlareColor${i}`,
        `uFlareIntensity${i}`,
        `uFlareDirectional${i}`,
      );
    }
    for (let i = 0; i < FLARE_ELEMENT_SLOTS; i++) {
      flareUniformNames.push(
        `uFlareElKind${i}`,
        `uFlareElColor${i}`,
        `uFlareElSize${i}`,
        `uFlareElAxis${i}`,
        `uFlareElWeight${i}`,
      );
    }
    this.compose = new PostProcess(
      'volumetricCompose',
      'volumetricCompose',
      [
        'uTonemapMode',
        'uColorProfile',
        'uOutputGamma',
        'uAutoExposure',
        'uAerialEnabled',
        'uTheatricalBloomWeight',
        'uTheatricalBloomThreshold',
        ...flareUniformNames,
      ],
      ['volumetricTexture', 'uAerialPerspectiveLUT', 'uSceneDepthFlare'],
      1.0,
      camera,
      Constants.TEXTURE_BILINEAR_SAMPLINGMODE,
      engine,
      false,
    );
    this.compose.onApply = (effect) => {
      const fx = effect as unknown as EffectLike;
      fx.setTexture('volumetricTexture', this.volumetricTarget);
      const q = this._world?.resources.Quality;
      const mode =
        q?.tonemapMode === 'hable' ? 2 : q?.tonemapMode === 'reinhard' ? 1 : 0;
      const profile = q?.colorProfile === 'sdr' ? 'sdr' : 'hdr';
      fx.setFloat('uTonemapMode', mode);
      fx.setFloat('uColorProfile', profile === 'sdr' ? 0 : 1);
      fx.setFloat('uOutputGamma', typeof q?.outputGamma === 'number' ? q.outputGamma : 2.2);

      const autoSky = !!this._world?.resources.Atmosphere?.enabled;
      if (autoSky) {
        // Scene color is already bound as textureSampler on the compose effect.
        const sceneTex =
          (effect as { getTexture?: (n: string) => BaseTexture | null }).getTexture?.(
            'textureSampler',
          ) ?? null;
        this.meterAutoExposure(sceneTex);
      } else {
        this.smoothedExposure = manualComposeExposure(profile);
      }
      fx.setFloat('uAutoExposure', this.smoothedExposure);

      const aerialOn = this._aerialLut && this._world?.resources.Atmosphere?.enabled ? 1 : 0;
      fx.setFloat('uAerialEnabled', aerialOn);
      fx.setTexture('uAerialPerspectiveLUT', this._aerialLut ?? this._aerialDummy);
      fx.setFloat('uTheatricalBloomWeight', this.theatricalBloomWeight);
      fx.setFloat('uTheatricalBloomThreshold', this.theatricalBloomThreshold);

      this.applyLensFlareUniforms(fx);
    };

    this.lastRenderScale = scale;
    this.lastVolW = vol.width;
    this.lastVolH = vol.height;
  }

  bindWorld(world: World, camera: Camera): void {
    this._world = world;
    this._camera = camera;
  }

  bindFog(fog: FogBinder | null): void {
    this._fog = fog;
  }

  /** Pre-tonemap HDR theatrical bloom (from StudioPipeline.syncBloomFromLights). */
  setTheatricalBloom(state: { enabled: boolean; weight: number; threshold: number }): void {
    this.theatricalBloomWeight = state.enabled ? Math.max(0, state.weight) : 0;
    this.theatricalBloomThreshold = Math.max(0.05, state.threshold);
  }

  /** Scene depth (camera-space Z) for solid occlusion — typically from DepthRenderer. */
  setSceneDepthTexture(texture: BaseTexture | null): void {
    this._sceneDepth = texture;
  }

  /** Bind Atmosphere aerial perspective volume for compose haze (null disables). */
  setAerialPerspectiveLut(texture: BaseTexture | null): void {
    this._aerialLut = texture;
  }

  /**
   * Project gathered flare sources to screen UV + camera-space depth and bind
   * compose uniforms (pre-tonemap HDR optical flare).
   */
  private smoothFlareIntensity(key: string, target: number): number {
    // Slow rise/fall damps volumetric sparkle; faster decay when fully off.
    const prev = this.flareIntensitySmooth.get(key);
    if (prev === undefined) {
      this.flareIntensitySmooth.set(key, target);
      return target;
    }
    const alpha = target < 1e-4 ? 0.4 : target < prev * 0.35 ? 0.28 : 0.12;
    const next = prev + (target - prev) * alpha;
    this.flareIntensitySmooth.set(key, next);
    return next;
  }

  private applyLensFlareUniforms(fx: EffectLike): void {
    const clearSlot = (i: number) => {
      fx.setVector3(`uFlareScreen${i}`, Vector3.Zero());
      fx.setVector3(`uFlareColor${i}`, Vector3.Zero());
      fx.setFloat(`uFlareIntensity${i}`, 0);
      fx.setFloat(`uFlareDirectional${i}`, 0);
    };
    const clearElement = (i: number) => {
      fx.setFloat(`uFlareElKind${i}`, 0);
      fx.setVector3(`uFlareElColor${i}`, Vector3.Zero());
      fx.setFloat(`uFlareElSize${i}`, 1);
      fx.setFloat(`uFlareElAxis${i}`, 0);
      fx.setFloat(`uFlareElWeight${i}`, 0);
    };

    const q = this._world?.resources.Quality;
    const pack = this._world?.resources.RenderFrame ?? this.lastPack;
    if (!this._camera || !pack || q?.lensFlare === false) {
      fx.setFloat('uLensFlareEnabled', 0);
      fx.setFloat('uFlareCount', 0);
      fx.setFloat('uUseSceneDepthFlare', 0);
      fx.setFloat('uFlareElementCount', 0);
      fx.setFloat('uFlareChromatic', 0);
      fx.setFloat('uFlareDirt', 0);
      for (let i = 0; i < LENS_FLARE_SLOTS; i++) clearSlot(i);
      for (let i = 0; i < FLARE_ELEMENT_SLOTS; i++) clearElement(i);
      this.flareIntensitySmooth.clear();
      return;
    }

    fx.setFloat('uLensFlareEnabled', 1);
    fx.setFloat('uUseSceneDepthFlare', this._sceneDepth ? 1 : 0);
    if (this._sceneDepth) {
      fx.setTexture('uSceneDepthFlare', this._sceneDepth);
    }

    const lightsTune = q?.lensFlareLights;
    const sunTune = q?.lensFlareSun;
    fx.setFloat('uFlareLightsVolBloom', lightsTune?.volBloom ?? 1);
    fx.setFloat('uFlareSunVolBloom', sunTune?.volBloom ?? 1);

    const optics = q?.lensFlareOptics ?? defaultLensFlareOptics();
    fx.setFloat('uFlareChromatic', optics.chromatic);
    fx.setFloat('uFlareDirt', optics.dirt);
    const elCount = Math.min(optics.elements.length, FLARE_ELEMENT_SLOTS);
    fx.setFloat('uFlareElementCount', elCount);
    for (let i = 0; i < FLARE_ELEMENT_SLOTS; i++) {
      const el = i < elCount ? optics.elements[i] : undefined;
      if (!el) {
        clearElement(i);
        continue;
      }
      fx.setFloat(`uFlareElKind${i}`, lensFlareElementKindCode(el.kind));
      fx.setVector3(
        `uFlareElColor${i}`,
        new Vector3(el.color[0], el.color[1], el.color[2]),
      );
      fx.setFloat(`uFlareElSize${i}`, el.size);
      fx.setFloat(`uFlareElAxis${i}`, el.axis);
      fx.setFloat(`uFlareElWeight${i}`, el.weight);
    }

    const cam = this._camera;
    const scene = cam.getScene();
    const engine = scene.getEngine();
    const w = engine.getRenderWidth();
    const h = engine.getRenderHeight();
    const transform = cam.getTransformationMatrix();
    const view = cam.getViewMatrix();
    const viewport = new Viewport(0, 0, w, h);
    const identity = Matrix.Identity();

    this.flareSmoothFrame = (this.flareSmoothFrame + 1) & 0xffff;
    const liveKeys = new Set<string>();

    let count = 0;
    const flares = pack.lensFlares ?? [];
    for (let i = 0; i < flares.length && count < LENS_FLARE_SLOTS; i++) {
      const f = flares[i]!;
      const world = new Vector3(
        cam.position.x + f.originCam[0],
        cam.position.y + f.originCam[1],
        cam.position.z + f.originCam[2],
      );
      const viewPos = Vector3.TransformCoordinates(world, view);
      // Babylon LH: +Z forward. Behind-camera points still Project onto the screen
      // (false flare when facing away from the sun) — cull all sources, including sun.
      if (viewPos.z < 0.05) continue;

      // Radiation-axis gate: directional emitters only flare when shining toward the camera.
      // Omni / point: isotropic — keep all view directions.
      let intensity = f.intensity;
      if ((f.omni ?? 0) < 0.5) {
        const facing = lensFlareFacingWeight(
          f.directionCam ?? ([0, 0, 1] as const),
          [world.x, world.y, world.z],
          [cam.position.x, cam.position.y, cam.position.z],
          false,
        );
        intensity *= facing;
        if (intensity < 1e-5) continue;
      }

      const projected = Vector3.Project(world, identity, transform, viewport);
      const uvx = projected.x / Math.max(w, 1);
      // Vector3.Project: Y=0 at top of viewport; Babylon post-process vUV: Y=0 at bottom.
      const uvy = 1 - projected.y / Math.max(h, 1);
      if (!Number.isFinite(uvx) || !Number.isFinite(uvy)) continue;
      const depth = Math.max(viewPos.z, f.directional > 0.5 ? 1e4 : 0);

      // Quantized UV key so EMA follows the source across small motion without slot remapping pops.
      const key = `${f.directional > 0.5 ? 's' : 'l'}:${(uvx * 32) | 0}:${(uvy * 32) | 0}`;
      liveKeys.add(key);
      intensity = this.smoothFlareIntensity(key, intensity);

      fx.setVector3(`uFlareScreen${count}`, new Vector3(uvx, uvy, depth));
      fx.setVector3(
        `uFlareColor${count}`,
        new Vector3(f.colorRgb[0], f.colorRgb[1], f.colorRgb[2]),
      );
      fx.setFloat(`uFlareIntensity${count}`, intensity);
      fx.setFloat(`uFlareDirectional${count}`, f.directional);
      count++;
    }

    // Drop stale EMA entries so reappearing lights don't inherit old peaks.
    if ((this.flareSmoothFrame & 15) === 0) {
      for (const k of [...this.flareIntensitySmooth.keys()]) {
        if (!liveKeys.has(k)) this.flareIntensitySmooth.delete(k);
      }
    }

    for (let i = count; i < LENS_FLARE_SLOTS; i++) clearSlot(i);
    fx.setFloat('uFlareCount', count);
  }

  /** Sync baked noise library assets onto the GPU (2D / 3D). */
  syncNoiseLibrary(entries: ReadonlyArray<{ id: string; baked: BakedNoiseVolume }>): void {
    this.noiseTextures.syncEntries(entries);
  }

  /** True when the low-res raymarch effect is compiled. */
  isRaymarchReady(): boolean {
    if (!this.volumetricEffect.isReady()) return false;
    return !!this.volumetricEffect.effect?.isReady();
  }

  /** True when the native compose post-process effect is compiled. */
  isComposeReady(): boolean {
    return this.compose.isReady();
  }

  /** True when raymarch + compose shaders are compiled and linkable. */
  areShadersReady(): boolean {
    return this.isRaymarchReady() && this.isComposeReady();
  }

  /**
   * Raymarch into the low-res RTT.
   * Call once per frame after scene depth is updated for this camera, before scene.render.
   */
  renderPass(): void {
    if (!this._world || !this._camera) return;
    if (!this.volumetricEffect.isReady()) return;
    const effect = this.volumetricEffect.effect;
    if (!effect?.isReady()) return;

    this.syncVolumetricSize(this.lastRenderScale, false);

    const rt = this.volumetricTarget.renderTarget;
    if (!rt) return;

    // Clear contribution buffer (EffectRenderer does not clear).
    this.engine.bindFramebuffer(rt);
    this.engine.clear(this.volumetricTarget.clearColor, true, false, false);
    this.engine.unBindFramebuffer(rt);

    this.effectRenderer.render(this.volumetricEffect, this.volumetricTarget);
  }

  resize(): void {
    this.syncVolumetricSize(this.lastRenderScale, true);
  }

  applyRenderScale(scale: number): void {
    const clamped = clampRenderScale(scale);
    const changed = Math.abs(clamped - this.lastRenderScale) >= 1e-4;
    this.lastRenderScale = clamped;
    this.syncVolumetricSize(clamped, changed);
  }

  dispose(): void {
    this.compose.dispose();
    this.volumetricEffect.dispose();
    this.luminanceEffect.dispose();
    this.luminanceReduceEffect.dispose();
    this.effectRenderer.dispose();
    this.volumetricTarget.dispose();
    this.luminanceMeter.dispose();
    this.luminanceAvg.dispose();
    this.noiseTextures.dispose();
    this._aerialDummy.dispose();
    this._fluidDummy.dispose();
  }

  /**
   * Meter scene+vol HDR log-average → temporal exposure (1-frame lag via async read).
   * Lasers only affect AE through visible energy in these buffers.
   */
  private meterAutoExposure(sceneTex: BaseTexture | null): void {
    if (!sceneTex) return;
    if (!this.luminanceEffect.isReady() || !this.luminanceReduceEffect.isReady()) return;
    const lumFx = this.luminanceEffect.effect;
    const redFx = this.luminanceReduceEffect.effect;
    if (!lumFx?.isReady() || !redFx?.isReady()) return;

    this._meterSceneTex = sceneTex;
    this.effectRenderer.render(this.luminanceEffect, this.luminanceMeter);
    this.effectRenderer.render(this.luminanceReduceEffect, this.luminanceAvg);

    if (this.readingLuminance) return;
    const internal = this.luminanceAvg.getInternalTexture();
    if (!internal) return;
    this.readingLuminance = true;
    const engine = this.engine as Engine & {
      _readTexturePixels?: (
        texture: ReturnType<RenderTargetTexture['getInternalTexture']>,
        width: number,
        height: number,
        faceIndex?: number,
        level?: number,
        buffer?: ArrayBufferView | null,
        flushRenderer?: boolean,
        noDataConversion?: boolean,
        x?: number,
        y?: number,
      ) => Promise<ArrayBufferView>;
    };
    const read = engine._readTexturePixels?.bind(engine);
    if (!read) {
      this.readingLuminance = false;
      return;
    }
    read(internal, 1, 1, 0, 0, null, true, false)
      .then((data) => {
        this.readingLuminance = false;
        const view = data as unknown as { length: number; [i: number]: number };
        if (!view || view.length < 1) return;
        const avgLum = Number(view[0]);
        if (!Number.isFinite(avgLum) || avgLum < 0) return;
        // UNSIGNED_BYTE fallback stores a compressed value — treat small ints as linear.
        const lum = avgLum > 1.5 && avgLum <= 255 ? avgLum / 255 : avgLum;
        const target = exposureFromAvgLuminance(lum, AUTO_EXPOSURE_KEY);
        this.smoothedExposure = smoothExposure(this.smoothedExposure, target);
      })
      .catch(() => {
        this.readingLuminance = false;
      });
  }

  private syncVolumetricSize(scale: number, force: boolean): void {
    const vol = this.volumetricSize(scale);
    if (!force && vol.width === this.lastVolW && vol.height === this.lastVolH) return;
    this.volumetricTarget.resize(vol);
    this.lastVolW = vol.width;
    this.lastVolH = vol.height;
  }

  private volumetricSize(scale: number): AbsoluteSize {
    const s = clampRenderScale(scale);
    const width = Math.max(1, (this.engine.getRenderWidth(true) * s) | 0);
    const height = Math.max(1, (this.engine.getRenderHeight(true) * s) | 0);
    return { width, height };
  }

  /** Prefer HALF_FLOAT for HDR headroom; fall back when the GPU rejects it. */
  private pickVolumetricTextureType(): number {
    try {
      const probe = new RenderTargetTexture(
        'volumetricHdrProbe',
        { width: 4, height: 4 },
        this.scene,
        false,
        true,
        Constants.TEXTURETYPE_HALF_FLOAT,
        false,
        Constants.TEXTURE_BILINEAR_SAMPLINGMODE,
        false,
        false,
      );
      const ok = !!probe.getInternalTexture();
      probe.dispose();
      if (ok) return Constants.TEXTURETYPE_HALF_FLOAT;
    } catch {
      // ignore — UNSIGNED_BYTE fallback
    }
    return Constants.TEXTURETYPE_UNSIGNED_BYTE;
  }

  private applyUniforms(effect: EffectLike): void {
    if (!this._world || !this._camera) return;
    const pack = this._world.resources.RenderFrame ?? gatherRenderPack(this._world);
    this.lastPack = pack;
    const inv = Matrix.Invert(this._camera.getTransformationMatrix());
    effect.setVector2('uResolution', new Vector2(this.lastVolW, this.lastVolH));
    effect.setFloat('uTime', pack.timeS);
    effect.setMatrix('uInvViewProj', inv);
    effect.setMatrix('uView', this._camera.getViewMatrix());
    effect.setVector3('uCameraPos', this._camera.position);
    effect.setFloat('uUseSceneDepth', this._sceneDepth ? 1 : 0);
    if (this._sceneDepth) {
      effect.setTexture('uSceneDepth', this._sceneDepth);
    }
    effect.setFloat('uStepSize', pack.quality.stepSize);
    effect.setFloat('uMaxSteps', pack.quality.maxSteps);
    effect.setFloat('uDensityThreshold', pack.quality.densityThreshold);
    effect.setFloat('uTransmittanceCut', pack.quality.transmittanceCut);
    effect.setFloat('uShadowQuality', pack.quality.shadowQuality);
    effect.setFloat('uShadowSteps', pack.quality.shadowSteps);
    effect.setFloat('uFluidEnableRefraction', pack.quality.fluidEnableRefraction);
    effect.setFloat('uFluidMaxSurfaceBounces', pack.quality.fluidMaxSurfaceBounces);

    const water = pack.waters[0];
    const camPos = this._camera.position;
    if (water) {
      effect.setFloat('uWaterMediumOn', 1);
      effect.setVector3(
        'uWaterCenter',
        new Vector3(
          water.centerWorld[0] - camPos.x,
          water.centerWorld[1] - camPos.y,
          water.centerWorld[2] - camPos.z,
        ),
      );
      effect.setVector3('uWaterHalfExt', new Vector3(...water.halfExtents));
      effect.setVector3('uWaterAxisX', new Vector3(...water.axisX));
      effect.setVector3('uWaterAxisY', new Vector3(...water.axisY));
      effect.setVector3('uWaterAxisZ', new Vector3(...water.axisZ));
      effect.setFloat('uWaterFill', water.fillFraction);
      effect.setFloat('uWaterIor', water.ior);
      effect.setVector3('uWaterColor', new Vector3(...water.colorRgb));
      effect.setFloat('uWaterDensity', water.opticalDensity);
      effect.setFloat('uWaterScatter', water.scatter);
      effect.setFloat('uWaterAbsorb', water.absorption);
      const g = pack.forces?.gravity ?? ([0, -9.81, 0] as const);
      const gLen = Math.hypot(g[0], g[1], g[2]);
      effect.setVector3(
        'uWaterGravity',
        gLen > 1e-6
          ? new Vector3(g[0] / gLen, g[1] / gLen, g[2] / gLen)
          : new Vector3(0, -1, 0),
      );
      effect.setFloat('uWaterWaveAmp', water.waveAmplitude);
      effect.setFloat('uWaterWaveFreq', water.waveFrequency);
      effect.setFloat('uWaterWaveSteep', water.waveSteepness);
    } else {
      effect.setFloat('uWaterMediumOn', 0);
      effect.setVector3('uWaterCenter', Vector3.Zero());
      effect.setVector3('uWaterHalfExt', Vector3.Zero());
      effect.setVector3('uWaterAxisX', new Vector3(1, 0, 0));
      effect.setVector3('uWaterAxisY', new Vector3(0, 1, 0));
      effect.setVector3('uWaterAxisZ', new Vector3(0, 0, 1));
      effect.setFloat('uWaterFill', 0);
      effect.setFloat('uWaterIor', 1.333);
      effect.setVector3('uWaterColor', new Vector3(0.15, 0.45, 0.7));
      effect.setFloat('uWaterDensity', 0);
      effect.setFloat('uWaterScatter', 0);
      effect.setFloat('uWaterAbsorb', 0);
      effect.setVector3('uWaterGravity', new Vector3(0, -1, 0));
      effect.setFloat('uWaterWaveAmp', 0);
      effect.setFloat('uWaterWaveFreq', 1);
      effect.setFloat('uWaterWaveSteep', 0);
    }

    effect.setVector3('uEnvHemi', new Vector3(...pack.env.hemiRgb));
    effect.setVector3('uEnvSun', new Vector3(...pack.env.sunRgb));
    effect.setVector3('uEnvSunDir', new Vector3(...pack.env.sunDirCam));
    effect.setFloat('uVolumeMultiScatter', pack.env.multiScatter);

    const gs = pack.globalSun;
    effect.setFloat('uGlobalSunOn', gs.enabled);
    effect.setFloat('uGlobalSunIntensity', gs.intensity);
    effect.setFloat('uGlobalSunDensity', gs.density);
    effect.setFloat('uGlobalSunScatter', gs.scatter);
    effect.setFloat('uGlobalSunAbsorb', gs.absorption);
    effect.setFloat('uGlobalSunMieG', gs.mieG);
    effect.setFloat('uGlobalSunMieWeight', gs.mieWeight);
    effect.setFloat('uGlobalSunShaftPower', gs.shaftPower);
    effect.setFloat('uGlobalSunHemiFill', gs.hemiFill);
    effect.setFloat('uGlobalSunMultiScatter', gs.multiScatter);
    effect.setFloat('uGlobalSunMaxDist', gs.maxDistance);
    effect.setFloat('uGlobalSunStepScale', gs.stepScale);

    for (let i = 0; i < VOLUMETRIC_LIGHT_SLOTS; i++) {
      this.setLightUniforms(effect, pack, i);
    }
    effect.setFloat('uLightCount', Math.min(pack.lights.length, VOLUMETRIC_LIGHT_SLOTS));

    for (let i = 0; i < VOLUMETRIC_MEDIA_SLOTS; i++) {
      this.setMediaUniforms(effect, pack, i);
    }
    effect.setFloat('uMediaCount', Math.min(pack.media.length, VOLUMETRIC_MEDIA_SLOTS));

    for (let i = 0; i < VOLUMETRIC_FLUID_SLOTS; i++) {
      this.setFluidUniforms(effect, pack, i);
    }
    // Fog density slots only — analytical water uses uWater* medium uniforms.
    const fogSlots = pack.fogs ?? [];
    effect.setFloat('uFluidCount', Math.min(fogSlots.length, VOLUMETRIC_FLUID_SLOTS));
  }

  private setFluidUniforms(effect: EffectLike, pack: GatheredFrame, index: number): void {
    const F = pack.fogs?.[index];
    const s = String(index);
    const atlas = this._fog?.densityAtlases[index] ?? this._fluidDummy;
    effect.setTexture(`uFluidDensityAtlas${s}`, atlas);
    if (!F) {
      effect.setVector3(`uFluidCenter${s}`, Vector3.Zero());
      effect.setVector3(`uFluidHalfExt${s}`, Vector3.Zero());
      effect.setVector3(`uFluidAxisX${s}`, new Vector3(1, 0, 0));
      effect.setVector3(`uFluidAxisY${s}`, new Vector3(0, 1, 0));
      effect.setVector3(`uFluidAxisZ${s}`, new Vector3(0, 0, 1));
      effect.setVector3(`uFluidColor${s}`, new Vector3(1, 1, 1));
      effect.setFloat(`uFluidDensity${s}`, 0);
      effect.setFloat(`uFluidScatter${s}`, 0);
      effect.setFloat(`uFluidAbsorb${s}`, 0);
      effect.setFloat(`uFluidKind${s}`, 0);
      effect.setFloat(`uFluidFillHeight${s}`, 0.65);
      effect.setFloat(`uFluidGridRes${s}`, 32);
      effect.setFloat(`uFluidTilesX${s}`, 6);
      effect.setVector2(`uFluidAtlasSize${s}`, new Vector2(192, 192));
      return;
    }
    // Live cam-relative center (matches ray matrices; avoids gather/camera desync).
    const cam = this._camera?.position;
    if (cam) {
      effect.setVector3(
        `uFluidCenter${s}`,
        new Vector3(F.centerWorld[0] - cam.x, F.centerWorld[1] - cam.y, F.centerWorld[2] - cam.z),
      );
    } else {
      effect.setVector3(`uFluidCenter${s}`, new Vector3(...F.centerCam));
    }
    effect.setVector3(`uFluidHalfExt${s}`, new Vector3(...F.halfExtents));
    effect.setVector3(`uFluidAxisX${s}`, new Vector3(...F.axisX));
    effect.setVector3(`uFluidAxisY${s}`, new Vector3(...F.axisY));
    effect.setVector3(`uFluidAxisZ${s}`, new Vector3(...F.axisZ));
    effect.setVector3(`uFluidColor${s}`, new Vector3(...F.colorRgb));
    effect.setFloat(`uFluidDensity${s}`, F.opticalDensity);
    effect.setFloat(`uFluidScatter${s}`, F.scatter);
    effect.setFloat(`uFluidAbsorb${s}`, F.absorption);
    // Always fog density (kind=0). Analytical water uses uWater* medium uniforms.
    effect.setFloat(`uFluidKind${s}`, 0);
    effect.setFloat(`uFluidFillHeight${s}`, 0.65);
    effect.setFloat(`uFluidGridRes${s}`, F.gridRes);
    effect.setFloat(`uFluidTilesX${s}`, F.tilesX);
    effect.setVector2(`uFluidAtlasSize${s}`, new Vector2(F.atlasWidth, F.atlasHeight));
  }

  private setLightUniforms(effect: EffectLike, pack: GatheredFrame, index: number): void {
    const L = pack.lights[index];
    const s = String(index);
    if (!L) {
      effect.setVector3(`uLightOrigin${s}`, Vector3.Zero());
      effect.setVector3(`uLightDir${s}`, new Vector3(0, 0, 1));
      effect.setVector3(`uLightColor${s}`, Vector3.Zero());
      effect.setFloat(`uLightPower${s}`, 0);
      effect.setFloat(`uLightScatter${s}`, 0);
      effect.setFloat(`uLightMode${s}`, 0);
      effect.setFloat(`uLightP0${s}`, 0);
      effect.setFloat(`uLightP1${s}`, 0);
      effect.setFloat(`uLightP2${s}`, 0);
      effect.setFloat(`uLightP3${s}`, 0);
      effect.setFloat(`uLightP4${s}`, 0);
      effect.setFloat(`uLightP5${s}`, 0);
      effect.setVector3(`uLightSpill${s}`, Vector3.Zero());
      return;
    }
    effect.setVector3(`uLightOrigin${s}`, new Vector3(...L.originCam));
    effect.setVector3(`uLightDir${s}`, new Vector3(...L.directionCam));
    effect.setVector3(`uLightColor${s}`, new Vector3(...L.colorRgb));
    effect.setFloat(`uLightPower${s}`, L.powerLinear);
    effect.setFloat(`uLightScatter${s}`, L.scatterWeight);
    effect.setFloat(`uLightMode${s}`, L.mode);
    effect.setFloat(`uLightP0${s}`, L.p0);
    effect.setFloat(`uLightP1${s}`, L.p1);
    effect.setFloat(`uLightP2${s}`, L.p2);
    effect.setFloat(`uLightP3${s}`, L.p3);
    effect.setFloat(`uLightP4${s}`, L.p4);
    effect.setFloat(`uLightP5${s}`, L.p5);
    effect.setVector3(`uLightSpill${s}`, new Vector3(...L.spill));
  }

  private setMediaUniforms(effect: EffectLike, pack: GatheredFrame, index: number): void {
    const M = pack.media[index];
    const s = String(index);
    if (!M) {
      effect.setVector3(`uMediaCenter${s}`, Vector3.Zero());
      effect.setVector3(`uMediaHalfExt${s}`, Vector3.Zero());
      effect.setVector3(`uMediaColor${s}`, new Vector3(1, 1, 1));
      effect.setFloat(`uMediaDensity${s}`, 0);
      effect.setFloat(`uMediaFbmScale${s}`, 1);
      effect.setFloat(`uMediaFbmTime${s}`, 0);
      effect.setFloat(`uMediaNoiseLow${s}`, 0.2);
      effect.setFloat(`uMediaNoiseHigh${s}`, 0.8);
      effect.setFloat(`uMediaNoiseKind${s}`, 0);
      const fb = this.noiseTextures.bindingFor(null);
      effect.setTexture(`uMediaNoise2D${s}`, fb.tex2D);
      effect.setTexture(`uMediaNoise3D${s}`, fb.tex3D);
      effect.setFloat(`uMediaScatter${s}`, 0.0257);
      effect.setFloat(`uMediaScatterMie${s}`, 0);
      effect.setFloat(`uMediaAbsorb${s}`, 0.0003);
      effect.setFloat(`uMediaSpectralExp${s}`, 0.05);
      effect.setFloat(`uMediaMieG${s}`, 0.55);
      effect.setFloat(`uMediaScatterModel${s}`, 1);
      effect.setFloat(`uMediaTurbulence${s}`, 0);
      effect.setFloat(`uMediaLayerKind${s}`, 0);
      effect.setFloat(`uMediaInsulating${s}`, 0);
      effect.setFloat(`uMediaEmission${s}`, 1);
      effect.setFloat(`uMediaConeCos${s}`, -1);
      effect.setFloat(`uMediaPlumeLen${s}`, 4);
      effect.setVector3(`uMediaPlumeDir${s}`, new Vector3(0, 0, 1));
      return;
    }
    effect.setVector3(`uMediaCenter${s}`, new Vector3(...M.centerCam));
    effect.setVector3(`uMediaHalfExt${s}`, new Vector3(...M.halfExtents));
    effect.setVector3(`uMediaColor${s}`, new Vector3(...M.colorRgb));
    effect.setFloat(`uMediaDensity${s}`, M.density);
    effect.setFloat(`uMediaFbmScale${s}`, M.fbmScale);
    effect.setFloat(`uMediaFbmTime${s}`, M.fbmTimeScale);
    effect.setFloat(`uMediaNoiseLow${s}`, M.noiseThresholdLow);
    effect.setFloat(`uMediaNoiseHigh${s}`, M.noiseThresholdHigh);
    const noise = this.noiseTextures.bindingFor(M.noiseAssetId || null);
    effect.setFloat(`uMediaNoiseKind${s}`, noise.kind);
    effect.setTexture(`uMediaNoise2D${s}`, noise.tex2D);
    effect.setTexture(`uMediaNoise3D${s}`, noise.tex3D);
    effect.setFloat(`uMediaScatter${s}`, M.scatter);
    effect.setFloat(`uMediaScatterMie${s}`, M.scatterMie);
    effect.setFloat(`uMediaAbsorb${s}`, M.absorption);
    effect.setFloat(`uMediaSpectralExp${s}`, M.spectralExponent);
    effect.setFloat(`uMediaMieG${s}`, M.mieAnisotropy);
    effect.setFloat(`uMediaScatterModel${s}`, M.scatterModel);
    effect.setFloat(`uMediaTurbulence${s}`, M.turbulence);
    effect.setFloat(`uMediaLayerKind${s}`, M.layerKind);
    effect.setFloat(`uMediaInsulating${s}`, M.insulating);
    effect.setFloat(`uMediaEmission${s}`, M.emissionRate);
    effect.setFloat(`uMediaConeCos${s}`, M.coneCos);
    effect.setFloat(`uMediaPlumeLen${s}`, M.plumeLengthM);
    effect.setVector3(`uMediaPlumeDir${s}`, new Vector3(...M.plumeDirCam));
  }
}
