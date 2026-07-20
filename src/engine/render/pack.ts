import { lightWorldPose } from '../ecs/systems/world-transform';
import type { World } from '../ecs/world';
import { getTranslation } from '../math/mat4';
import type { Vec3 } from '../math/vec3';
import { normalize, sub } from '../math/vec3';
import { beamModelFromEmitter, beamModelToGpuParams } from '../optics/beam-model';
import {
  displayLuminousPower,
  physicalLuminousScale,
} from '../optics/laser-brightness';
import { mediaSpectralExponent } from '../optics/scatter-model';
import {
  GPU_LAYER_INTERIOR,
  GPU_LAYER_OUTDOOR,
  GPU_LAYER_PARTICULATE,
  GPU_SCATTER_MODEL_CLIMATE,
  GPU_SCATTER_MODEL_RAYLEIGH,
  GPU_SCATTER_MODEL_TYNDALL,
} from '../optics/atmosphere-climate';
import { isClimatePreset } from '../optics/media-optical-presets';
import {
  environmentSunDirUnit,
  environmentVolumetricHemiRgb,
  environmentVolumetricSunRgb,
} from '../optics/environment-lighting';
import { normalizeChromaticity } from '../optics/color';
import { rayleighScatterWeight, wavelengthToRgb } from '../optics/wavelength';
import {
  PLUME_DISABLED_CONE_COS,
  coneCosFromHalfAngleDeg,
} from '../optics/smoke-plume';

export const MAX_GPU_LIGHTS = 8;
/** Max MediaVolume entities packed per frame (shader slots match). */
export const MAX_GPU_MEDIA = 8;

export const VOLUMETRIC_LIGHT_SLOTS = MAX_GPU_LIGHTS;
export const VOLUMETRIC_MEDIA_SLOTS = MAX_GPU_MEDIA;

export const SURFACE_ENV_LIGHTS = 2;
export const SURFACE_LIGHT_SLOTS = MAX_GPU_LIGHTS;
export const SURFACE_MAX_SIMULTANEOUS_LIGHTS = SURFACE_ENV_LIGHTS;

export interface GpuLight {
  originCam: Vec3;
  directionCam: Vec3;
  colorRgb: Vec3;
  /** Surface/UI Weber–Fechner display scale. */
  powerDisplay: number;
  /** Linear P·V·exposure scale for volumetric in-scatter. */
  powerLinear: number;
  scatterWeight: number;
  mode: number;
  p0: number;
  p1: number;
  p2: number;
  p3: number;
  p4: number;
  p5: number;
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
  scatterMie: number;
  absorption: number;
  /** Legacy kind index (debug). */
  kind: number;
  spectralExponent: number;
  /** 0 Rayleigh, 1 Tyndall, 2 climate dual. */
  scatterModel: number;
  mieAnisotropy: number;
  turbulence: number;
  /** 0 outdoor, 1 interior, 2 particulate. */
  layerKind: number;
  /** 1 = insulating interior climate. */
  insulating: number;
  /** Plume emission multiplier (1 + coneCos&lt;0 = uniform AABB). */
  emissionRate: number;
  /** Nozzle direction in camera/world space (unit). */
  plumeDirCam: Vec3;
  /** cos(half-angle); &lt;0 disables plume envelope. */
  coneCos: number;
  plumeLengthM: number;
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
  env: {
    hemiRgb: Vec3;
    sunRgb: Vec3;
    sunDirCam: Vec3;
    multiScatter: number;
  };
}

function worldToCamera(p: Vec3, camPos: Vec3): Vec3 {
  return sub(p, camPos);
}

function mediaKindIndex(kind: string): number {
  const map: Record<string, number> = {
    fog: 0,
    smoke: 1,
    dust: 2,
    clearNight: 3,
    clearDay: 4,
    spring: 5,
    summerHumid: 6,
    autumnMist: 7,
    winterDry: 8,
    room: 9,
    lab: 10,
    hall: 11,
    haze: 12,
  };
  return map[kind] ?? 0;
}

function gpuLayerKind(layer: string): number {
  if (layer === 'interior') return GPU_LAYER_INTERIOR;
  if (layer === 'particulate') return GPU_LAYER_PARTICULATE;
  return GPU_LAYER_OUTDOOR;
}

function gpuScatterModel(vol: { layer: string; scatterModel: string }): number {
  if (vol.layer === 'outdoor' || vol.layer === 'interior') return GPU_SCATTER_MODEL_CLIMATE;
  return vol.scatterModel === 'tyndall'
    ? GPU_SCATTER_MODEL_TYNDALL
    : GPU_SCATTER_MODEL_RAYLEIGH;
}

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
      powerLinear: physicalLuminousScale(emitter.powerW, emitter.wavelengthNm, {
        ambientLevel: env.ambientLevel,
      }),
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

    const climate = isClimatePreset(vol.preset ?? vol.kind);
    const smoke = world.get(id, 'SmokeEmitter');
    let emissionRate = 1;
    let coneCos = PLUME_DISABLED_CONE_COS;
    let plumeLengthM = 4;
    let plumeDirCam: Vec3 = [0, 0, 1];
    if (smoke) {
      emissionRate = smoke.enabled ? smoke.emissionRate : 0;
      coneCos = coneCosFromHalfAngleDeg(smoke.coneAngleDeg);
      plumeLengthM = smoke.plumeLengthM;
      plumeDirCam = lightWorldPose(world, id).direction;
    }

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
      scatterMie: climate ? vol.scatterMie : 0,
      absorption: vol.absorption,
      kind: mediaKindIndex(vol.preset ?? vol.kind),
      spectralExponent: mediaSpectralExponent(
        climate ? 'tyndall' : vol.scatterModel,
        vol.particleSizeNm,
      ),
      scatterModel: gpuScatterModel(vol),
      mieAnisotropy: vol.mieAnisotropy,
      turbulence: climate ? vol.turbulence : 0,
      layerKind: gpuLayerKind(vol.layer),
      insulating: vol.insulating ? 1 : 0,
      emissionRate,
      plumeDirCam,
      coneCos,
      plumeLengthM,
    });
  }

  const q = world.resources.Quality;
  const envRes = world.resources.EnvironmentLighting;
  const sunDirCam = normalize(environmentSunDirUnit() as Vec3);

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
    env: {
      hemiRgb: environmentVolumetricHemiRgb(envRes.ambientLevel),
      sunRgb: environmentVolumetricSunRgb(envRes.ambientLevel),
      sunDirCam,
      multiScatter: envRes.volumeMultiScatter,
    },
  };
}
