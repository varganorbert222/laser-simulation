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
  type Camera,
  type Engine,
  type Scene,
} from '@babylonjs/core';
import { Constants } from '@babylonjs/core/Engines/constants';
import {
  VOLUMETRIC_LIGHT_SLOTS,
  VOLUMETRIC_MEDIA_SLOTS,
  gatherRenderPack,
  type GatheredFrame,
  type World,
} from '../../../engine';
import {
  VOLUMETRIC_COMPOSE_FRAGMENT,
  VOLUMETRIC_FRAGMENT,
  VOLUMETRIC_UNIFORMS,
} from '../shaders/volumetric-shader';

Effect.ShadersStore['volumetricFragmentShader'] = VOLUMETRIC_FRAGMENT;
Effect.ShadersStore['volumetricComposeFragmentShader'] = VOLUMETRIC_COMPOSE_FRAGMENT;

type EffectLike = {
  setFloat: (name: string, v: number) => void;
  setVector2: (name: string, v: Vector2) => void;
  setVector3: (name: string, v: Vector3) => void;
  setMatrix: (name: string, v: Matrix) => void;
  setTexture: (name: string, texture: RenderTargetTexture) => void;
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

  private lastRenderScale = 1;
  private lastVolW = 0;
  private lastVolH = 0;
  lastPack: GatheredFrame | null = null;

  private _world: World | null = null;
  private _camera: Camera | null = null;

  constructor(
    private readonly engine: Engine,
    private readonly scene: Scene,
    camera: Camera,
    initialScale: number,
  ) {
    const scale = clampScale(initialScale);
    const vol = this.volumetricSize(scale);

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
      null,
      ['volumetricTexture'],
      1.0,
      camera,
      Constants.TEXTURE_BILINEAR_SAMPLINGMODE,
      engine,
      false,
    );
    this.compose.onApply = (effect) => {
      (effect as unknown as EffectLike).setTexture('volumetricTexture', this.volumetricTarget);
    };

    this.lastRenderScale = scale;
    this.lastVolW = vol.width;
    this.lastVolH = vol.height;
  }

  bindWorld(world: World, camera: Camera): void {
    this._world = world;
    this._camera = camera;
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
    effect.setVector3('uCameraPos', this._camera.position);
    effect.setFloat('uStepSize', pack.quality.stepSize);
    effect.setFloat('uMaxSteps', pack.quality.maxSteps);
    effect.setFloat('uDensityThreshold', pack.quality.densityThreshold);
    effect.setFloat('uTransmittanceCut', pack.quality.transmittanceCut);

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
      effect.setVector3(`uLightSpill${s}`, Vector3.Zero());
      return;
    }
    effect.setVector3(`uLightOrigin${s}`, new Vector3(...L.originCam));
    effect.setVector3(`uLightDir${s}`, new Vector3(...L.directionCam));
    effect.setVector3(`uLightColor${s}`, new Vector3(...L.colorRgb));
    effect.setFloat(`uLightPower${s}`, L.powerDisplay);
    effect.setFloat(`uLightScatter${s}`, L.scatterWeight);
    effect.setFloat(`uLightMode${s}`, L.mode);
    effect.setFloat(`uLightP0${s}`, L.p0);
    effect.setFloat(`uLightP1${s}`, L.p1);
    effect.setFloat(`uLightP2${s}`, L.p2);
    effect.setFloat(`uLightP3${s}`, L.p3);
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
      effect.setFloat(`uMediaScatter${s}`, 0.9);
      effect.setFloat(`uMediaAbsorb${s}`, 0.2);
      effect.setFloat(`uMediaSpectralExp${s}`, 0.2);
      effect.setFloat(`uMediaMieG${s}`, 0);
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
    effect.setFloat(`uMediaScatter${s}`, M.scatter);
    effect.setFloat(`uMediaAbsorb${s}`, M.absorption);
    effect.setFloat(`uMediaSpectralExp${s}`, M.spectralExponent);
    effect.setFloat(`uMediaMieG${s}`, M.mieAnisotropy);
  }
}

function clampScale(scale: number): number {
  return Math.min(1, Math.max(0.05, scale));
}
