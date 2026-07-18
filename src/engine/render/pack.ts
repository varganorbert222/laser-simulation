import { lightWorldPose } from '../ecs/systems/world-transform';
import type { World } from '../ecs/world';
import { getTranslation } from '../math/mat4';
import type { Vec3 } from '../math/vec3';
import { sub } from '../math/vec3';
import { laserBeamDisplayPower } from '../optics/laser-brightness';
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
/** Spot/Point surface emitters driving specular (aligned with GPU pack). */
export const SURFACE_LIGHT_SLOTS = MAX_GPU_LIGHTS;
/** `StandardMaterial.maxSimultaneousLights` = env + surface emitters. */
export const SURFACE_MAX_SIMULTANEOUS_LIGHTS = SURFACE_ENV_LIGHTS + SURFACE_LIGHT_SLOTS;

/** Fixed GPU light struct — camera-relative positions. */
export interface GpuLight {
  originCam: Vec3;
  directionCam: Vec3;
  colorRgb: Vec3;
  powerDisplay: number;
  scatterWeight: number;
  mode: number; // 0 omni, 1 spot, 2 parallel, 3 laser
  p0: number;
  p1: number;
  p2: number;
  p3: number;
  /** [strayLight, internalReflection, apertureSpill] 0–1. */
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

function modeCode(mode: string): number {
  switch (mode) {
    case 'omni_lamp':
      return 0;
    case 'spotlight':
      return 1;
    case 'parallel':
      return 2;
    case 'laser':
      return 3;
    default:
      return 3;
  }
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
    // Intensity only: V(λ) + power curve; Rayleigh via scatterWeight in the shader.
    const params = emitter.params;

    let p0 = 0;
    let p1 = 0;
    let p2 = 0;
    let p3 = 0;

    switch (params.mode) {
      case 'omni_lamp':
        p0 = params.omni.softRadiusM;
        p1 = params.omni.falloff;
        break;
      case 'spotlight':
        p0 = (params.spot.innerConeDeg * Math.PI) / 180;
        p1 = (params.spot.outerConeDeg * Math.PI) / 180;
        p2 = params.spot.apertureSharpness;
        break;
      case 'parallel':
        p0 = params.parallel.beamRadiusM;
        p1 = params.parallel.residualMrad * 1e-3;
        break;
      case 'laser':
        p0 = params.laser.w0M;
        p1 = params.laser.parallelness;
        p2 = emitter.wavelengthNm * 1e-9;
        p3 = params.laser.probeDistanceM;
        break;
    }

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
      powerDisplay: laserBeamDisplayPower(emitter.powerW, emitter.wavelengthNm, brightnessOpts),
      scatterWeight: rayleighScatterWeight(emitter.wavelengthNm),
      mode: modeCode(params.mode),
      p0,
      p1,
      p2,
      p3,
      spill: [
        emitter.spill.strayLight,
        emitter.spill.internalReflection,
        emitter.spill.apertureSpill,
      ],
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
