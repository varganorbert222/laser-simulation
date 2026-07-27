import { type Scene, type StandardMaterial } from '@babylonjs/core';
import {
  beamModelFromEmitter,
  beamModelToGpuParams,
  isSunEmitter,
  lightWorldPose,
  MAX_GPU_LIGHTS,
  resolveEmitterAppearance,
  resolveVisionBrightnessOpts,
  surfaceBrdfWeights,
  type GatheredFrame,
  type SurfaceMaterial,
  type World,
} from '@engine';
import {
  getOrCreateSurfaceRadiancePlugin,
  type SurfaceRadianceCaustic,
  type SurfaceRadianceGpuLight,
  type SurfaceRadiancePlugin,
} from '../materials/surface-radiance-plugin';

/**
 * Maps BeamModel irradiance (includes DISPLAY_RADIANCE_SCALE) × display power
 * into a StandardMaterial-additive range comparable to the old SpotLight×2 path.
 * Optics stay in BeamModel; this is presentation scale only.
 */
const SURFACE_OPTICS_DISPLAY_GAIN = 1800;

/**
 * Optical surface lighting: LightEmitter → SurfaceRadiancePlugin
 * (Gaussian / cone / tube / omni field × Cook–Torrance GGX).
 *
 * No Babylon Spot/Point for emitters — those cannot carry w₀, M², aberrations.
 * Env hemi/sun remain Babylon lights on StandardMaterial.
 */
export class SurfaceLightSync {
  private readonly plugins = new Set<SurfaceRadiancePlugin>();
  private lastPack: SurfaceRadianceGpuLight[] = [];
  private lastCaustic: SurfaceRadianceCaustic = {
    strength: 0,
    fillHeight: 0.65,
    timeS: 0,
    sunDir: [0, -1, 0],
    sunRgb: [0, 0, 0],
    center: [0, 0, 0],
    halfExtents: [0, 0, 0],
    axisX: [1, 0, 0],
    axisY: [0, 1, 0],
    axisZ: [0, 0, 1],
    waveAmplitude: 0,
    waveFrequency: 1,
    waveSteepness: 0,
  };

  constructor(_scene: Scene) {}

  /** Register a surface StandardMaterial for optical radiance contribution. */
  attachMaterial(mat: StandardMaterial, sm: SurfaceMaterial | null): void {
    const plugin = getOrCreateSurfaceRadiancePlugin(mat);
    if (!plugin) return;
    this.plugins.add(plugin);
    if (sm) {
      this.applyBrdf(plugin, sm);
    } else {
      plugin.setMaterialPbr(0.35, 0.05, 0.55, 0.45);
    }
    plugin.setLights(this.lastPack);
    plugin.setCaustic(this.lastCaustic);
  }

  updateMaterialOptics(mat: StandardMaterial, sm: SurfaceMaterial): void {
    const plugin = getOrCreateSurfaceRadiancePlugin(mat);
    if (!plugin) return;
    this.plugins.add(plugin);
    this.applyBrdf(plugin, sm);
  }

  sync(world: World, frame?: GatheredFrame | null): void {
    const pack: SurfaceRadianceGpuLight[] = [];
    let bound = 0;

    for (const id of world.query('LightEmitter', 'Transform')) {
      const emitter = world.get(id, 'LightEmitter');
      if (!emitter?.enabled) continue;
      // Sun key light is Babylon DirectionalLight + volumetric env sun — not a surface slot.
      if (isSunEmitter(emitter)) continue;
      if (bound >= MAX_GPU_LIGHTS) continue;
      bound++;

      const pose = lightWorldPose(world, id);
      const appearance = resolveEmitterAppearance(
        emitter,
        resolveVisionBrightnessOpts(
          world.resources.EnvironmentLighting.ambientLevel,
          world.resources.Atmosphere,
          world.resources.DisplayVision.responseCurve,
        ),
      );
      const beam = beamModelFromEmitter(emitter);
      const gpu = beamModelToGpuParams(beam);

      pack.push({
        origin: [pose.position[0], pose.position[1], pose.position[2]],
        direction: [pose.direction[0], pose.direction[1], pose.direction[2]],
        color: [appearance.chroma[0], appearance.chroma[1], appearance.chroma[2]],
        power: Math.max(0, appearance.powerDisplay) * SURFACE_OPTICS_DISPLAY_GAIN,
        mode: gpu.mode,
        p0: gpu.p0,
        p1: gpu.p1,
        p2: gpu.p2,
        p3: gpu.p3,
        p4: gpu.p4,
        p5: gpu.p5,
        spill: gpu.spill,
      });
    }

    this.lastPack = pack;

    const water = frame?.waters[0];
    const sunGain = 90;
    const caustic: SurfaceRadianceCaustic = water
      ? {
          strength: Math.max(0.35, water.causticStrength),
          fillHeight: water.fillFraction,
          timeS: frame?.timeS ?? 0,
          sunDir: [...(frame?.env.sunDirCam ?? [0, -1, 0])] as [number, number, number],
          sunRgb: [
            Math.max(0.08, (frame?.env.sunRgb[0] ?? 0) * sunGain),
            Math.max(0.07, (frame?.env.sunRgb[1] ?? 0) * sunGain),
            Math.max(0.05, (frame?.env.sunRgb[2] ?? 0) * sunGain),
          ],
          center: [...water.centerWorld] as [number, number, number],
          halfExtents: [...water.halfExtents] as [number, number, number],
          axisX: [...water.axisX] as [number, number, number],
          axisY: [...water.axisY] as [number, number, number],
          axisZ: [...water.axisZ] as [number, number, number],
          waveAmplitude: water.waveAmplitude,
          waveFrequency: water.waveFrequency,
          waveSteepness: water.waveSteepness,
        }
      : {
          strength: 0,
          fillHeight: 0.65,
          timeS: 0,
          sunDir: [0, -1, 0],
          sunRgb: [0, 0, 0],
          center: [0, 0, 0],
          halfExtents: [0, 0, 0],
          axisX: [1, 0, 0],
          axisY: [0, 1, 0],
          axisZ: [0, 0, 1],
          waveAmplitude: 0,
          waveFrequency: 1,
          waveSteepness: 0,
        };
    this.lastCaustic = caustic;

    for (const plugin of this.plugins) {
      plugin.setLights(pack);
      plugin.setCaustic(caustic);
    }
  }

  dispose(): void {
    this.plugins.clear();
    this.lastPack = [];
  }

  private applyBrdf(plugin: SurfaceRadiancePlugin, sm: SurfaceMaterial): void {
    const w = surfaceBrdfWeights(sm);
    plugin.setMaterialPbr(w.albedo, w.metalness, w.roughness, w.absorption);
  }
}
