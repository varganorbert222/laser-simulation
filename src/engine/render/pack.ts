import { lightWorldPose } from '../ecs/systems/world-transform';
import type { World } from '../ecs/world';
import { getTranslation } from '../math/mat4';
import type { Vec3 } from '../math/vec3';
import { sub } from '../math/vec3';
import { beamModelFromEmitter, beamModelToGpuParams } from '../optics/beam-model';
import { displayLuminousPower } from '../optics/laser-brightness';
import { mediaSpectralExponent } from '../optics/scatter-model';
import { normalizeChromaticity } from '../optics/color';
import { rayleighScatterWeight, wavelengthToRgb } from '../optics/wavelength';

export const MAX_GPU_LIGHTS = 8;
export const MAX_GPU_MEDIA = 4;

/** Uniform slots wired in the volumetric fragment shader (must match shader gen). */
export const VOLUMETRIC_LIGHT_SLOTS = MAX_GPU_LIGHTS;
export const VOLUMETRIC_MEDIA_SLOTS = 2;

/** Hemi + directional env lights that consume Babylon material light slots. */
export const SURFACE_ENV_LIGHTS = 2;
/** Spot / Point / Directional surface emitters driving StandardMaterial specular. */
export const SURFACE_LIGHT_SLOTS = MAX_GPU_LIGHTS;
/** `StandardMaterial.maxSimultaneousLights` = env + surface emitters. */
export const SURFACE_MAX_SIMULTANEOUS_LIGHTS = SURFACE_ENV_LIGHTS + SURFACE_LIGHT_SLOTS;

/** Fixed GPU light struct — camera-relative positions. */
export interface GpuLight {
  originCam: Vec3;
  directionCam: Vec3;
  colorRgb: Vec3;
  /** Educational display luminous scale (V(λ) × power curve). */
  powerDisplay: number;
  scatterWeight: number;
  /** 0 omni, 1 cone, 2 tube, 3 gaussian */
  mode: number;
  p0: number;
  p1: number;
  p2: number;
  p3: number;
  p4: number;
  p5: number;
  /** [strayPowerFraction, unused, unused] — GPU uses .x as energy share. */
  spill: Vec3;
}

export interface GpuMedia {
  centerCam: Vec3;
  halfExtents: Vec3;
  density: number;
  colorRgb: Vec3;
  fbmScale: number;
  fbmTimeScale: number;
  noiseThresholdLow: number;
  noiseThresholdHigh: number;
  scatter: number;
  absorption: number;
  kind: number; // 0 fog, 1 smoke, 2 dust
  /** Spectral exponent n in σ_s ∝ λ⁻ⁿ (4 = Rayleigh, ~0 = Tyndall). */
  spectralExponent: number;
  /** 0 = rayleigh, 1 = tyndall (UI / debug). */
  scatterModel: number;
  /** Henyey–Greenstein Mie anisotropy g. */
  mieAnisotropy: number;
}

export interface GatheredFrame {
  lights: GpuLight[];
  media: GpuMedia[];
  cameraPosition: Vec3;
  timeS: number;
  quality: {
    stepSize: number;
    maxSteps: number;
    densityThreshold: number;
    transmittanceCut: number;
  };
}

function worldToCamera(p: Vec3, camPos: Vec3): Vec3 {
  return sub(p, camPos);
}

function mediaKind(kind: string): number {
  switch (kind) {
    case 'smoke':
      return 1;
    case 'dust':
      return 2;
    default:
      return 0;
  }
}

/** Gather serializable lights/media into camera-relative GPU packs. */
export function gatherRenderPack(world: World): GatheredFrame {
  const camPos = world.resources.Camera.position;
  const lights: GpuLight[] = [];
  const media: GpuMedia[] = [];

  for (const id of world.query('LightEmitter', 'Transform')) {
    if (lights.length >= MAX_GPU_LIGHTS) break;
    const emitter = world.get(id, 'LightEmitter');
    if (!emitter?.enabled) continue;

    const pose = lightWorldPose(world, id);
    const color = normalizeChromaticity(wavelengthToRgb(emitter.wavelengthNm));
    const beam = beamModelFromEmitter(emitter);
    const gpu = beamModelToGpuParams(beam);

    const env = world.resources.EnvironmentLighting;
    const vision = world.resources.DisplayVision;
    const brightnessOpts = {
      ambientLevel: env.ambientLevel,
      responseCurve: vision.responseCurve,
    };

    lights.push({
      originCam: worldToCamera(pose.position, camPos),
      directionCam: pose.direction,
      colorRgb: color,
      powerDisplay: displayLuminousPower(emitter.powerW, emitter.wavelengthNm, brightnessOpts),
      scatterWeight: rayleighScatterWeight(emitter.wavelengthNm),
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

  for (const id of world.query('MediaVolume', 'Transform')) {
    if (media.length >= MAX_GPU_MEDIA) break;
    const vol = world.get(id, 'MediaVolume');
    if (!vol || vol.density <= 0) continue;
    const xform = world.get(id, 'WorldXform');
    const transform = world.get(id, 'Transform');
    const center = xform
      ? getTranslation(xform.matrix)
      : (transform?.position ?? ([0, 0, 0] as Vec3));

    media.push({
      centerCam: worldToCamera(center, camPos),
      halfExtents: vol.halfExtents,
      density: vol.density,
      colorRgb: vol.color,
      fbmScale: vol.fbmScale,
      fbmTimeScale: vol.fbmTimeScale,
      noiseThresholdLow: vol.noiseThresholdLow,
      noiseThresholdHigh: vol.noiseThresholdHigh,
      scatter: vol.scatter,
      absorption: vol.absorption,
      kind: mediaKind(vol.kind),
      spectralExponent: mediaSpectralExponent(vol.scatterModel, vol.particleSizeNm),
      scatterModel: vol.scatterModel === 'tyndall' ? 1 : 0,
      mieAnisotropy: vol.mieAnisotropy,
    });
  }

  const q = world.resources.Quality;
  return {
    lights,
    media,
    cameraPosition: camPos,
    timeS: world.resources.Time.elapsedS,
    quality: {
      stepSize: q.stepSize,
      maxSteps: q.maxSteps,
      densityThreshold: q.densityThreshold,
      transmittanceCut: q.transmittanceCut,
    },
  };
}
