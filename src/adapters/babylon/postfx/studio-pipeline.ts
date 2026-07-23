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
  type World,
} from '@engine';

export class StudioPipeline {
  readonly pipeline: DefaultRenderingPipeline;
  readonly glowLayer: GlowLayer;

  constructor(scene: Scene, camera: Camera) {
    this.pipeline = new DefaultRenderingPipeline('studioPipeline', true, scene, [camera]);
    this.pipeline.fxaaEnabled = true;
    this.pipeline.samples = 4;
    this.pipeline.bloomEnabled = true;
    this.pipeline.bloomThreshold = 0.75;
    this.pipeline.bloomWeight = 0.28;
    this.pipeline.bloomKernel = 40;
    this.pipeline.bloomScale = 0.5;
    // Keep image processing off materials: failed IP shaders spam glGetProgramiv.
    // Exposure / tonemap for beams is handled in volumetric compose.
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
    // Theatrical glow is presentation-only; physics path never depends on it.
    if (!world.resources.Quality.theatricalGlow) {
      this.pipeline.bloomEnabled = false;
      this.glowLayer.intensity = 0;
      return;
    }

    let bloomSum = 0;
    let glowSum = 0;
    let n = 0;
    for (const id of world.query('LightEmitter')) {
      const emitter = world.get(id, 'LightEmitter');
      if (!emitter?.enabled) continue;
      const power = laserDotDisplayBrightness(emitter.powerW, emitter.wavelengthNm, {
        ambientLevel: world.resources.EnvironmentLighting.ambientLevel,
        responseCurve: world.resources.DisplayVision.responseCurve,
      });
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
      this.pipeline.bloomEnabled = false;
      this.glowLayer.intensity = 0;
      return;
    }
    const bloomAvg = Math.min(1.0, bloomSum / n);
    const glowAvg = Math.min(1.0, glowSum / n);
    this.pipeline.bloomEnabled = bloomAvg > 0.02;
    this.pipeline.bloomWeight = Math.min(0.55, 0.18 + bloomAvg * 0.28);
    this.pipeline.bloomThreshold = Math.max(0.65, 0.9 - bloomAvg * 0.2);
    this.pipeline.bloomKernel = Math.min(64, 28 + bloomAvg * 24);
    this.glowLayer.intensity = Math.min(1.2, 0.25 + glowAvg * 0.45);
  }

  dispose(): void {
    this.glowLayer.dispose();
    this.pipeline.dispose();
  }
}
