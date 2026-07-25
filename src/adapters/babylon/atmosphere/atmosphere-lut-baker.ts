import {
  Color4,
  Effect,
  EffectRenderer,
  EffectWrapper,
  RawTexture3D,
  RenderTargetTexture,
  Vector2,
  Vector3,
  type BaseTexture,
  type Engine,
  type Scene,
} from '@babylonjs/core';
import { Constants } from '@babylonjs/core/Engines/constants';
import {
  atmospherePhaseHG,
  atmospherePhaseRayleigh,
  atmosphereTransmittance,
  type AtmosphereModel,
  type AtmosphereSettings,
} from '@engine';
import {
  ATMOSPHERE_AERIAL_KEY,
  ATMOSPHERE_AERIAL_PERSPECTIVE_FRAGMENT,
  ATMOSPHERE_AERIAL_SAMPLERS,
  ATMOSPHERE_AERIAL_UNIFORMS,
  ATMOSPHERE_SKY_VIEW_KEY,
  ATMOSPHERE_SKY_VIEW_FRAGMENT,
  ATMOSPHERE_SKY_VIEW_SAMPLERS,
  ATMOSPHERE_SKY_VIEW_UNIFORMS,
  ATMOSPHERE_TRANSMITTANCE_FRAGMENT,
  ATMOSPHERE_TRANSMITTANCE_KEY,
  ATMOSPHERE_TRANSMITTANCE_UNIFORMS,
} from '../shaders/atmosphere-shaders';

Effect.ShadersStore[`${ATMOSPHERE_TRANSMITTANCE_KEY}FragmentShader`] =
  ATMOSPHERE_TRANSMITTANCE_FRAGMENT;
Effect.ShadersStore[`${ATMOSPHERE_SKY_VIEW_KEY}FragmentShader`] = ATMOSPHERE_SKY_VIEW_FRAGMENT;
Effect.ShadersStore[`${ATMOSPHERE_AERIAL_KEY}FragmentShader`] =
  ATMOSPHERE_AERIAL_PERSPECTIVE_FRAGMENT;

type EffectLike = {
  setFloat: (name: string, v: number) => void;
  setVector2: (name: string, v: Vector2) => void;
  setVector3: (name: string, v: Vector3) => void;
  setTexture: (name: string, texture: BaseTexture) => void;
};

export const TRANSMITTANCE_LUT_SIZE = { width: 256, height: 64 };
/** Default = medium preset (UE-like SkyView footprint). */
export const SKY_VIEW_LUT_SIZE = { width: 256, height: 128 };
/** Default = medium preset aerial volume. */
export const AERIAL_LUT_SIZE = { width: 32, height: 32, depth: 16 };

/** Artistic exposure scale shared by skybox + IBL capture (less dimming at night ambient). */
export function atmosphereDisplayExposure(exposure: number, ambientLevel: number): number {
  return Math.max(0, exposure) * (0.9 + Math.max(0, Math.min(1, ambientLevel)) * 0.45);
}

/**
 * Bakes Transmittance + Sky View GPU LUTs; Aerial Perspective 3D via CPU twin
 * (stable without async readPixels), with GPU aerial EffectWrapper kept for future RTT path.
 */
export class AtmosphereLutBaker {
  readonly transmittanceLut: RenderTargetTexture;
  readonly skyViewLut: RenderTargetTexture;
  /** Distant haze / compose binding — RGBA8 volume (inscatter RGB + transmittance A). */
  aerialPerspectiveLut: RawTexture3D | null = null;

  private readonly effectRenderer: EffectRenderer;
  private readonly transmittanceEffect: EffectWrapper;
  private readonly skyViewEffect: EffectWrapper;
  /** Reserved GPU aerial bake path (single-slice RTT). */
  readonly aerialSliceTarget: RenderTargetTexture;
  private readonly aerialEffect: EffectWrapper;

  private lastModelKey = '';
  private lastSunKey = '';
  private lastQualityKey = '';
  private aerialDirty = true;
  private _sunDir: [number, number, number] = [0, -1, 0];
  private _model: AtmosphereModel | null = null;
  private _enabled = false;
  private _aerialSliceZ = 0;
  private _skyLutsBaked = false;
  private _skyViewSamples = 32;
  private _transmittanceSamples = 48;
  private _aerialSamples = 12;
  private _skyViewW = SKY_VIEW_LUT_SIZE.width;
  private _skyViewH = SKY_VIEW_LUT_SIZE.height;
  private _transW = TRANSMITTANCE_LUT_SIZE.width;
  private _transH = TRANSMITTANCE_LUT_SIZE.height;
  private _aerialW = AERIAL_LUT_SIZE.width;
  private _aerialH = AERIAL_LUT_SIZE.height;
  private _aerialD = AERIAL_LUT_SIZE.depth;

  constructor(
    private readonly engine: Engine,
    private readonly scene: Scene,
  ) {
    this.effectRenderer = new EffectRenderer(engine);

    this.transmittanceLut = this.createLut2D(
      'atmoTransmittance',
      TRANSMITTANCE_LUT_SIZE.width,
      TRANSMITTANCE_LUT_SIZE.height,
    );
    this.skyViewLut = this.createLut2D(
      'atmoSkyView',
      SKY_VIEW_LUT_SIZE.width,
      SKY_VIEW_LUT_SIZE.height,
    );
    this.aerialSliceTarget = this.createLut2D(
      'atmoAerialSlice',
      AERIAL_LUT_SIZE.width,
      AERIAL_LUT_SIZE.height,
    );

    this.transmittanceEffect = new EffectWrapper({
      engine,
      name: ATMOSPHERE_TRANSMITTANCE_KEY,
      fragmentShader: ATMOSPHERE_TRANSMITTANCE_FRAGMENT,
      uniformNames: [...ATMOSPHERE_TRANSMITTANCE_UNIFORMS],
      samplerNames: [],
      useAsPostProcess: true,
      allowEmptySourceTexture: true,
    });
    this.transmittanceEffect.onApplyObservable.add(() => {
      this.applyCommon(this.transmittanceEffect.effect as unknown as EffectLike, {
        width: this._transW,
        height: this._transH,
      });
      (this.transmittanceEffect.effect as unknown as EffectLike).setFloat(
        'uSampleCount',
        this._transmittanceSamples,
      );
    });

    this.skyViewEffect = new EffectWrapper({
      engine,
      name: ATMOSPHERE_SKY_VIEW_KEY,
      fragmentShader: ATMOSPHERE_SKY_VIEW_FRAGMENT,
      uniformNames: [...ATMOSPHERE_SKY_VIEW_UNIFORMS],
      samplerNames: [...ATMOSPHERE_SKY_VIEW_SAMPLERS],
      useAsPostProcess: true,
      allowEmptySourceTexture: true,
    });
    this.skyViewEffect.onApplyObservable.add(() => {
      const fx = this.skyViewEffect.effect as unknown as EffectLike;
      this.applyCommon(fx, {
        width: this._skyViewW,
        height: this._skyViewH,
      });
      fx.setFloat('uSampleCount', this._skyViewSamples);
      fx.setTexture('uTransmittanceLUT', this.transmittanceLut);
    });

    this.aerialEffect = new EffectWrapper({
      engine,
      name: ATMOSPHERE_AERIAL_KEY,
      fragmentShader: ATMOSPHERE_AERIAL_PERSPECTIVE_FRAGMENT,
      uniformNames: [...ATMOSPHERE_AERIAL_UNIFORMS],
      samplerNames: [...ATMOSPHERE_AERIAL_SAMPLERS],
      useAsPostProcess: true,
      allowEmptySourceTexture: true,
    });
    this.aerialEffect.onApplyObservable.add(() => {
      const fx = this.aerialEffect.effect as unknown as EffectLike;
      this.applyCommon(fx, {
        width: this._aerialW,
        height: this._aerialH,
      });
      fx.setFloat('uSampleCount', this._aerialSamples);
      fx.setFloat('uSliceZ', this._aerialSliceZ);
      fx.setFloat('uMaxDistance', 100_000);
      fx.setTexture('uTransmittanceLUT', this.transmittanceLut);
    });
  }

  get enabled(): boolean {
    return this._enabled;
  }

  /** True after at least one successful transmittance + sky-view bake. */
  get skyLutsReady(): boolean {
    return this._skyLutsBaked;
  }

  isReady(): boolean {
    return (
      this.transmittanceEffect.isReady() &&
      !!this.transmittanceEffect.effect?.isReady() &&
      this.skyViewEffect.isReady() &&
      !!this.skyViewEffect.effect?.isReady()
    );
  }

  /**
   * Sync from Atmosphere settings + sun light direction; rebake dirty LUTs.
   * Call once per frame (cheap no-op when keys unchanged).
   */
  sync(settings: AtmosphereSettings, sunLightDirWorld: readonly [number, number, number]): void {
    this._enabled = settings.enabled;
    if (!settings.enabled) return;

    this._model = settings.model;
    this._sunDir = [sunLightDirWorld[0], sunLightDirWorld[1], sunLightDirWorld[2]];
    this._skyViewSamples = settings.skyViewSamples;
    this._transmittanceSamples = settings.transmittanceSamples;
    this._aerialSamples = settings.aerialSamples;

    const modelKey = atmosphereModelKey(settings.model);
    const sunKey = `${this._sunDir[0].toFixed(4)},${this._sunDir[1].toFixed(4)},${this._sunDir[2].toFixed(4)}`;
    const qualityKey = [
      settings.qualityPreset,
      settings.skyViewSamples,
      settings.transmittanceSamples,
      settings.aerialSamples,
      settings.skyViewLutWidth,
      settings.skyViewLutHeight,
      settings.transmittanceLutWidth,
      settings.transmittanceLutHeight,
      settings.aerialLutWidth,
      settings.aerialLutHeight,
      settings.aerialLutDepth,
    ].join('|');

    if (!this.isReady()) return;

    const lutResized = this.ensureLutSizes(
      settings.skyViewLutWidth,
      settings.skyViewLutHeight,
      settings.transmittanceLutWidth,
      settings.transmittanceLutHeight,
      settings.aerialLutWidth,
      settings.aerialLutHeight,
      settings.aerialLutDepth,
    );

    let modelChanged = false;
    if (modelKey !== this.lastModelKey || lutResized) {
      this.bakeTransmittance();
      this.lastModelKey = modelKey;
      this.aerialDirty = true;
      modelChanged = true;
      this.lastSunKey = '';
      this._skyLutsBaked = false;
    }
    const qualityChanged = qualityKey !== this.lastQualityKey;
    if (qualityChanged) {
      this.lastQualityKey = qualityKey;
      this.aerialDirty = true;
      // Sample-count / resolution changes require a sky-view rebake even if the sun is unchanged.
      this.lastSunKey = '';
      if (!lutResized) {
        // Transmittance sample count alone still needs a rebake.
        this.bakeTransmittance();
        this._skyLutsBaked = false;
      }
    }
    if (sunKey !== this.lastSunKey || modelChanged) {
      this.bakeSkyView();
      this.lastSunKey = sunKey;
      this.aerialDirty = true;
      this._skyLutsBaked = true;
    }
    // Aerial is heavier — bake at most after sky LUTs, once per dirty flag.
    if (this.aerialDirty && this._skyLutsBaked) {
      this.bakeAerialPerspectiveCpu();
      this._aerialSliceZ = 0.5;
      if (this.aerialEffect.isReady() && this.aerialEffect.effect?.isReady()) {
        const rt = this.aerialSliceTarget.renderTarget;
        if (rt) {
          this.engine.bindFramebuffer(rt);
          this.engine.clear(this.aerialSliceTarget.clearColor, true, false, false);
          this.engine.unBindFramebuffer(rt);
          this.effectRenderer.render(this.aerialEffect, this.aerialSliceTarget);
        }
      }
      this.aerialDirty = false;
    }
  }

  dispose(): void {
    this.transmittanceEffect.dispose();
    this.skyViewEffect.dispose();
    this.aerialEffect.dispose();
    this.effectRenderer.dispose();
    this.transmittanceLut.dispose();
    this.skyViewLut.dispose();
    this.aerialSliceTarget.dispose();
    this.aerialPerspectiveLut?.dispose();
    this.aerialPerspectiveLut = null;
  }

  private ensureLutSizes(
    skyW: number,
    skyH: number,
    transW: number,
    transH: number,
    aerialW: number,
    aerialH: number,
    aerialD: number,
  ): boolean {
    let changed = false;
    if (skyW !== this._skyViewW || skyH !== this._skyViewH) {
      this.skyViewLut.resize({ width: skyW, height: skyH });
      this._skyViewW = skyW;
      this._skyViewH = skyH;
      changed = true;
    }
    if (transW !== this._transW || transH !== this._transH) {
      this.transmittanceLut.resize({ width: transW, height: transH });
      this._transW = transW;
      this._transH = transH;
      changed = true;
    }
    if (
      aerialW !== this._aerialW ||
      aerialH !== this._aerialH ||
      aerialD !== this._aerialD
    ) {
      this._aerialW = aerialW;
      this._aerialH = aerialH;
      this._aerialD = aerialD;
      this.aerialSliceTarget.resize({ width: aerialW, height: aerialH });
      this.aerialPerspectiveLut?.dispose();
      this.aerialPerspectiveLut = null;
      changed = true;
    }
    return changed;
  }

  private createLut2D(name: string, w: number, h: number): RenderTargetTexture {
    const tryHalf = new RenderTargetTexture(
      name,
      { width: w, height: h },
      this.scene,
      false,
      true,
      Constants.TEXTURETYPE_HALF_FLOAT,
      false,
      Constants.TEXTURE_BILINEAR_SAMPLINGMODE,
      false,
      false,
    );
    if (tryHalf.renderTarget) {
      tryHalf.clearColor = new Color4(0, 0, 0, 1);
      tryHalf.wrapU = Constants.TEXTURE_CLAMP_ADDRESSMODE;
      tryHalf.wrapV = Constants.TEXTURE_CLAMP_ADDRESSMODE;
      tryHalf.renderList = [];
      return tryHalf;
    }
    tryHalf.dispose();
    const rtt = new RenderTargetTexture(
      name,
      { width: w, height: h },
      this.scene,
      false,
      true,
      Constants.TEXTURETYPE_UNSIGNED_BYTE,
      false,
      Constants.TEXTURE_BILINEAR_SAMPLINGMODE,
      false,
      false,
    );
    rtt.clearColor = new Color4(0, 0, 0, 1);
    rtt.wrapU = Constants.TEXTURE_CLAMP_ADDRESSMODE;
    rtt.wrapV = Constants.TEXTURE_CLAMP_ADDRESSMODE;
    rtt.renderList = [];
    return rtt;
  }

  private bakeTransmittance(): void {
    if (!this.transmittanceEffect.isReady()) return;
    const rt = this.transmittanceLut.renderTarget;
    if (!rt) return;
    this.engine.bindFramebuffer(rt);
    this.engine.clear(this.transmittanceLut.clearColor, true, false, false);
    this.engine.unBindFramebuffer(rt);
    this.effectRenderer.render(this.transmittanceEffect, this.transmittanceLut);
  }

  private bakeSkyView(): void {
    if (!this.skyViewEffect.isReady()) return;
    const rt = this.skyViewLut.renderTarget;
    if (!rt) return;
    this.engine.bindFramebuffer(rt);
    this.engine.clear(this.skyViewLut.clearColor, true, false, false);
    this.engine.unBindFramebuffer(rt);
    this.effectRenderer.render(this.skyViewEffect, this.skyViewLut);
  }

  /** CPU twin of aerial perspective LUT for compose / distant haze sampling. */
  private bakeAerialPerspectiveCpu(): void {
    const m = this._model;
    if (!m) return;
    const width = this._aerialW;
    const height = this._aerialH;
    const depth = this._aerialD;
    const bytes = new Uint8Array(width * height * depth * 4);
    const towardSun: [number, number, number] = [
      -this._sunDir[0],
      -this._sunDir[1],
      -this._sunDir[2],
    ];
    const sunLen = Math.hypot(towardSun[0], towardSun[1], towardSun[2]) || 1;
    towardSun[0] /= sunLen;
    towardSun[1] /= sunLen;
    towardSun[2] /= sunLen;

    const maxDist = 80_000;
    const steps = Math.max(8, Math.min(64, this._aerialSamples));

    for (let z = 0; z < depth; z++) {
      const altFrac = depth <= 1 ? 0 : z / (depth - 1);
      const origin: [number, number, number] = [
        0,
        m.planetRadius + altFrac * (m.atmosphereRadius - m.planetRadius) * 0.35,
        0,
      ];
      for (let y = 0; y < height; y++) {
        const distFrac = height <= 1 ? 0 : y / (height - 1);
        const pathLen = 500 + distFrac * maxDist;
        for (let x = 0; x < width; x++) {
          const zenith = (width <= 1 ? 0 : x / (width - 1)) * Math.PI;
          const viewDir: [number, number, number] = [
            Math.sin(zenith),
            Math.cos(zenith),
            0,
          ];
          const ds = pathLen / steps;
          let lr = 0;
          let lg = 0;
          let lb = 0;
          let tr = 1;
          let tg = 1;
          let tb = 1;
          for (let s = 0; s < steps; s++) {
            const t = (s + 0.5) * ds;
            const px = origin[0] + viewDir[0] * t;
            const py = origin[1] + viewDir[1] * t;
            const pz = origin[2] + viewDir[2] * t;
            const r = Math.hypot(px, py, pz);
            const h = r - m.planetRadius;
            if (h < 0 || h > m.atmosphereRadius - m.planetRadius) continue;
            const dr = Math.exp(-Math.max(0, h) / m.rayleighScaleHeight);
            const dm = Math.exp(-Math.max(0, h) / m.mieScaleHeight);
            const mu =
              viewDir[0] * towardSun[0] +
              viewDir[1] * towardSun[1] +
              viewDir[2] * towardSun[2];
            const Tsun = atmosphereTransmittance(m, [px, py, pz], towardSun, 8);
            const pr = atmospherePhaseRayleigh(mu);
            const pm = atmospherePhaseHG(mu, m.mieG);
            for (let c = 0; c < 3; c++) {
              const scat =
                m.rayleighScattering[c] * dr * pr + m.mieScattering[c] * dm * pm;
              const ext =
                m.rayleighScattering[c] * dr +
                (m.mieScattering[c] + m.mieAbsorption[c]) * dm;
              const thr = c === 0 ? tr : c === 1 ? tg : tb;
              const add = thr * scat * Tsun[c] * m.solarIrradiance[c] * ds;
              if (c === 0) {
                lr += add;
                tr *= Math.exp(-ext * ds);
              } else if (c === 1) {
                lg += add;
                tg *= Math.exp(-ext * ds);
              } else {
                lb += add;
                tb *= Math.exp(-ext * ds);
              }
            }
          }
          const i = ((z * height + y) * width + x) * 4;
          bytes[i] = Math.min(255, Math.round(lr * 40));
          bytes[i + 1] = Math.min(255, Math.round(lg * 40));
          bytes[i + 2] = Math.min(255, Math.round(lb * 40));
          bytes[i + 3] = Math.min(255, Math.round(((tr + tg + tb) / 3) * 255));
        }
      }
    }

    if (this.aerialPerspectiveLut) {
      this.aerialPerspectiveLut.update(bytes);
    } else {
      this.aerialPerspectiveLut = new RawTexture3D(
        bytes,
        width,
        height,
        depth,
        Constants.TEXTUREFORMAT_RGBA,
        this.scene,
        false,
        false,
        Constants.TEXTURE_BILINEAR_SAMPLINGMODE,
        Constants.TEXTURETYPE_UNSIGNED_BYTE,
      );
      this.aerialPerspectiveLut.wrapU = Constants.TEXTURE_CLAMP_ADDRESSMODE;
      this.aerialPerspectiveLut.wrapV = Constants.TEXTURE_CLAMP_ADDRESSMODE;
      this.aerialPerspectiveLut.wrapR = Constants.TEXTURE_CLAMP_ADDRESSMODE;
    }
  }

  private applyCommon(
    effect: EffectLike,
    size: { width: number; height: number },
  ): void {
    const m = this._model;
    if (!m) return;
    effect.setVector3('uPlanetCenter', Vector3.Zero());
    effect.setFloat('uPlanetRadius', m.planetRadius);
    effect.setFloat('uAtmosphereRadius', m.atmosphereRadius);
    effect.setVector3('uRayleighScattering', new Vector3(...m.rayleighScattering));
    effect.setFloat('uRayleighScaleHeight', m.rayleighScaleHeight);
    effect.setVector3('uMieScattering', new Vector3(...m.mieScattering));
    effect.setVector3('uMieAbsorption', new Vector3(...m.mieAbsorption));
    effect.setFloat('uMieScaleHeight', m.mieScaleHeight);
    effect.setFloat('uMieG', m.mieG);
    effect.setVector3('uOzoneAbsorption', new Vector3(...m.ozoneAbsorption));
    effect.setFloat('uOzoneCenterHeight', m.ozoneCenterHeight);
    effect.setFloat('uOzoneWidth', m.ozoneWidth);
    effect.setVector3('uGroundAlbedo', new Vector3(...m.groundAlbedo));
    effect.setVector3('uSolarIrradiance', new Vector3(...m.solarIrradiance));
    effect.setVector3('uSunDirection', new Vector3(...this._sunDir));
    effect.setFloat('uEyeHeight', 1);
    effect.setVector2('uResolution', new Vector2(size.width, size.height));
  }
}

function atmosphereModelKey(m: AtmosphereModel): string {
  return [
    m.planetRadius,
    m.atmosphereRadius,
    m.rayleighScattering.join(','),
    m.rayleighScaleHeight,
    m.mieScattering.join(','),
    m.mieAbsorption.join(','),
    m.mieScaleHeight,
    m.mieG,
    m.ozoneAbsorption.join(','),
    m.ozoneCenterHeight,
    m.ozoneWidth,
    m.groundAlbedo.join(','),
    m.solarIrradiance.join(','),
  ].join('|');
}
