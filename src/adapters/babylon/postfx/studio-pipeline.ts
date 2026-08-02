import {
  DefaultRenderingPipeline,
  GlowLayer,
  type Camera,
  type Scene,
} from '@babylonjs/core';
import '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline.js';
import {
  deriveBloomContribution,
  deriveGlowContribution,
  laserDotDisplayBrightness,
  resolveVisionBrightnessOpts,
  type World,
} from '@engine';

/** HDR theatrical bloom parameters applied in volumetric compose (pre-tonemap). */
export interface TheatricalBloomState {
  enabled: boolean;
  weight: number;
  threshold: number;
}

export class StudioPipeline {
  readonly pipeline: DefaultRenderingPipeline;
  readonly glowLayer: GlowLayer;

  /** Last sync result — compose samples this for pre-tonemap HDR bloom. */
  theatricalBloom: TheatricalBloomState = {
    enabled: false,
    weight: 0,
    threshold: 0.85,
  };

  constructor(scene: Scene, camera: Camera) {
    this.pipeline = new DefaultRenderingPipeline('studioPipeline', true, scene, [camera]);
    this.pipeline.fxaaEnabled = true;
    this.pipeline.samples = 4;
    // Bloom runs in volumetric compose (HDR, includes lasers). DRP bloom stays off (LDR / post-γ).
    this.pipeline.bloomEnabled = false;
    this.pipeline.imageProcessingEnabled = false;

    this.glowLayer = new GlowLayer('studioGlow', scene, {
      blurKernelSize: 24,
      mainTextureSamples: 2,
    });
    this.glowLayer.intensity = 0.55;
  }

  /** FXAA + pipeline MSAA (4× when on, 1× when off). */
  applyAntiAliasing(enabled: boolean): void {
    this.pipeline.fxaaEnabled = enabled;
    this.pipeline.samples = enabled ? 4 : 1;
  }

  syncBloomFromLights(world: World): void {
    this.pipeline.bloomEnabled = false;

    // Theatrical glow is presentation-only; physics path never depends on it.
    if (!world.resources.Quality.theatricalGlow) {
      this.theatricalBloom = { enabled: false, weight: 0, threshold: 0.85 };
      this.glowLayer.intensity = 0;
      return;
    }

    let bloomSum = 0;
    let glowSum = 0;
    let n = 0;
    for (const id of world.query('LightEmitter')) {
      const emitter = world.get(id, 'LightEmitter');
      if (!emitter?.enabled) continue;
      const power = laserDotDisplayBrightness(
        emitter.powerW,
        emitter.wavelengthNm,
        resolveVisionBrightnessOpts(
          world.resources.EnvironmentLighting.ambientLevel,
          world.resources.Atmosphere,
          world.resources.DisplayVision.responseCurve,
        ),
      );
      const sm = world.get(id, 'SurfaceMaterial') ?? null;
      bloomSum += deriveBloomContribution(emitter.bloomGain, power, sm);
      glowSum += deriveGlowContribution(
        emitter.glowGain,
        power,
        emitter.apertureCoupling,
        sm,
      );
      n += 1;
    }
    if (n === 0) {
      this.theatricalBloom = { enabled: false, weight: 0, threshold: 0.85 };
      this.glowLayer.intensity = 0;
      return;
    }
    const bloomAvg = Math.min(1.0, bloomSum / n);
    const glowAvg = Math.min(1.0, glowSum / n);
    this.theatricalBloom = {
      enabled: bloomAvg > 0.02,
      weight: Math.min(0.55, 0.18 + bloomAvg * 0.28),
      threshold: Math.max(0.65, 0.9 - bloomAvg * 0.2),
    };
    this.glowLayer.intensity = Math.min(1.2, 0.25 + glowAvg * 0.45);
  }

  dispose(): void {
    this.glowLayer.dispose();
    this.pipeline.dispose();
  }
}
