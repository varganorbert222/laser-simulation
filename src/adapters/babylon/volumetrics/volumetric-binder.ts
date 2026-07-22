import {
  Color4,
  Effect,
  EffectRenderer,
  EffectWrapper,
  Matrix,
  PostProcess,
  RenderTargetTexture,
  Vector2,
  Vector3,
  type BaseTexture,
  type Camera,
  type Engine,
  type Scene,
} from '@babylonjs/core';
import { Constants } from '@babylonjs/core/Engines/constants';
import {
  VOLUMETRIC_LIGHT_SLOTS,
  VOLUMETRIC_MEDIA_SLOTS,
  gatherRenderPack,
  type BakedNoiseVolume,
  type GatheredFrame,
  type World,
} from '../../../engine';
import {
  VOLUMETRIC_COMPOSE_FRAGMENT,
  VOLUMETRIC_FRAGMENT,
  VOLUMETRIC_SAMPLERS,
  VOLUMETRIC_UNIFORMS,
} from '../shaders/volumetric-shader';
import { NoiseTextureCache } from './noise-volume-texture';

Effect.ShadersStore['volumetricFragmentShader'] = VOLUMETRIC_FRAGMENT;
Effect.ShadersStore['volumetricComposeFragmentShader'] = VOLUMETRIC_COMPOSE_FRAGMENT;

type EffectLike = {
  setFloat: (name: string, v: number) => void;
  setVector2: (name: string, v: Vector2) => void;
  setVector3: (name: string, v: Vector3) => void;
  setMatrix: (name: string, v: Matrix) => void;
  setTexture: (name: string, texture: BaseTexture) => void;
};

type AbsoluteSize = { width: number; height: number };

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

  private readonly effectRenderer: EffectRenderer;
  private readonly volumetricEffect: EffectWrapper;
  private readonly noiseTextures: NoiseTextureCache;

  private lastRenderScale = 1;
  private lastVolW = 0;
  private lastVolH = 0;
  lastPack: GatheredFrame | null = null;

  private _world: World | null = null;
  private _camera: Camera | null = null;
  private _sceneDepth: BaseTexture | null = null;

  constructor(
    private readonly engine: Engine,
    private readonly scene: Scene,
    camera: Camera,
    initialScale: number,
  ) {
    const scale = clampScale(initialScale);
    const vol = this.volumetricSize(scale);

    this.noiseTextures = new NoiseTextureCache(scene);

    this.volumetricTarget = new RenderTargetTexture(
      'volumetricLights',
      vol,
      scene,
      false,
      true,
      Constants.TEXTURETYPE_UNSIGNED_BYTE,
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

    // Native compose only — keeps the camera PP chain (and scene RT) at full resolution.
    this.compose = new PostProcess(
      'volumetricCompose',
      'volumetricCompose',
      ['uTonemapMode'],
      ['volumetricTexture'],
      1.0,
      camera,
      Constants.TEXTURE_BILINEAR_SAMPLINGMODE,
      engine,
      false,
    );
    this.compose.onApply = (effect) => {
      const fx = effect as unknown as EffectLike;
      fx.setTexture('volumetricTexture', this.volumetricTarget);
      const mode = this._world?.resources.Quality.tonemapMode === 'reinhard' ? 1 : 0;
      fx.setFloat('uTonemapMode', mode);
    };

    this.lastRenderScale = scale;
    this.lastVolW = vol.width;
    this.lastVolH = vol.height;
  }

  bindWorld(world: World, camera: Camera): void {
    this._world = world;
    this._camera = camera;
  }

  /** Scene depth (camera-space Z) for solid occlusion — typically from DepthRenderer. */
  setSceneDepthTexture(texture: BaseTexture | null): void {
    this._sceneDepth = texture;
  }

  /** Sync baked noise library assets onto the GPU (2D / 3D). */
  syncNoiseLibrary(entries: ReadonlyArray<{ id: string; baked: BakedNoiseVolume }>): void {
    this.noiseTextures.syncEntries(entries);
  }

  /** @deprecated Use syncNoiseLibrary — kept for transitional callers. */
  setNoiseVolume(_baked: BakedNoiseVolume): void {
    // no-op: per-media assets come from the noise library
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

  /** Raymarch into the low-res RTT (call once per frame before scene.render). */
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
    const clamped = clampScale(scale);
    const changed = Math.abs(clamped - this.lastRenderScale) >= 1e-4;
    this.lastRenderScale = clamped;
    this.syncVolumetricSize(clamped, changed);
  }

  dispose(): void {
    this.compose.dispose();
    this.volumetricEffect.dispose();
    this.effectRenderer.dispose();
    this.volumetricTarget.dispose();
    this.noiseTextures.dispose();
  }

  private syncVolumetricSize(scale: number, force: boolean): void {
    const vol = this.volumetricSize(scale);
    if (!force && vol.width === this.lastVolW && vol.height === this.lastVolH) return;
    this.volumetricTarget.resize(vol);
    this.lastVolW = vol.width;
    this.lastVolH = vol.height;
  }

  private volumetricSize(scale: number): AbsoluteSize {
    const s = clampScale(scale);
    const width = Math.max(1, (this.engine.getRenderWidth(true) * s) | 0);
    const height = Math.max(1, (this.engine.getRenderHeight(true) * s) | 0);
    return { width, height };
  }

  private applyUniforms(effect: EffectLike): void {
    if (!this._world || !this._camera) return;
    const pack = gatherRenderPack(this._world);
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

    effect.setVector3('uEnvHemi', new Vector3(...pack.env.hemiRgb));
    effect.setVector3('uEnvSun', new Vector3(...pack.env.sunRgb));
    effect.setVector3('uEnvSunDir', new Vector3(...pack.env.sunDirCam));
    effect.setFloat('uVolumeMultiScatter', pack.env.multiScatter);

    for (let i = 0; i < VOLUMETRIC_LIGHT_SLOTS; i++) {
      this.setLightUniforms(effect, pack, i);
    }
    effect.setFloat('uLightCount', Math.min(pack.lights.length, VOLUMETRIC_LIGHT_SLOTS));

    for (let i = 0; i < VOLUMETRIC_MEDIA_SLOTS; i++) {
      this.setMediaUniforms(effect, pack, i);
    }
    effect.setFloat('uMediaCount', Math.min(pack.media.length, VOLUMETRIC_MEDIA_SLOTS));
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

function clampScale(scale: number): number {
  return Math.min(1, Math.max(0.05, scale));
}
