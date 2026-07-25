import { lightWorldPose } from '../ecs/systems/world-transform';
import type { World } from '../ecs/world';
import { getTranslation } from '../math/mat4';
import type { Vec3 } from '../math/vec3';
import { normalize, sub } from '../math/vec3';
import {
  beamModelFromEmitter,
  beamModelToGpuParams,
} from '../physics/optics/beam-model';
import { mediaSpectralExponent } from '../physics/optics/scatter-model';
import {
  GPU_LAYER_INTERIOR,
  GPU_LAYER_OUTDOOR,
  GPU_LAYER_PARTICULATE,
  GPU_SCATTER_MODEL_CLIMATE,
  GPU_SCATTER_MODEL_RAYLEIGH,
  GPU_SCATTER_MODEL_TYNDALL,
} from '../physics/optics/atmosphere-climate';
import { isClimatePreset } from '../physics/optics/media-optical-presets';
import {
  environmentSunDirUnit,
  environmentVolumetricHemiRgb,
  environmentVolumetricSunRgb,
  resolveSceneAmbientLevel,
} from '../physics/optics/environment-lighting';
import {
  skyIrradianceApprox,
  sunIrradianceRgb,
} from '../physics/optics/atmosphere-model';
import { resolveAtmosphereSolarPosition } from '../physics/optics/atmosphere-settings';
import { isSunEmitter, refreshSceneSunBinding } from '../physics/optics/scene-sun';
import { resolveEmitterAppearance } from '../physics/optics/light-appearance';
import { resolveVisionBrightnessOpts } from '../physics/optics/display-vision';
import {
  PLUME_DISABLED_CONE_COS,
  coneCosFromHalfAngleDeg,
} from '../physics/optics/smoke-plume';
import {
  normalizeShadowQuality,
  shadowQualityIndex,
  shadowStepsForQuality,
} from './quality';
import { MAX_GPU_LIGHTS, MAX_GPU_MEDIA } from './contract/slots';

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
  /** Baked noise library asset id; empty string = none. */
  noiseAssetId: string;
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
    shadowQuality: number;
    shadowSteps: number;
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
    cloud: 13,
  };
  return map[kind] ?? 0;
}

function gpuLayerKind(layer: string): number {
  if (layer === 'interior') return GPU_LAYER_INTERIOR;
  if (layer === 'particulate') return GPU_LAYER_PARTICULATE;
  return GPU_LAYER_OUTDOOR;
}

function gpuScatterModel(vol: { layer: string; scatterModel: string }): number {
  if (vol.layer === 'outdoor' || vol.layer === 'interior')
    return GPU_SCATTER_MODEL_CLIMATE;
  return vol.scatterModel === 'tyndall'
    ? GPU_SCATTER_MODEL_TYNDALL
    : GPU_SCATTER_MODEL_RAYLEIGH;
}

/** Lower = earlier GPU slot (binder only uploads VOLUMETRIC_MEDIA_SLOTS). */
function mediaGpuPriority(m: GpuMedia): number {
  if (m.layerKind === GPU_LAYER_PARTICULATE) return 0;
  if (m.insulating > 0.5) return 1;
  return 2;
}

export function gatherRenderPack(world: World): GatheredFrame {
  const camPos = world.resources.Camera.position;
  const lights: GpuLight[] = [];
  const media: GpuMedia[] = [];
  const sunBinding = refreshSceneSunBinding(world);

  const envRes = world.resources.EnvironmentLighting;
  const atmo = world.resources.Atmosphere;
  const vision = world.resources.DisplayVision;
  const ambientLevel = resolveSceneAmbientLevel(envRes.ambientLevel, atmo);
  const visionOpts = resolveVisionBrightnessOpts(
    envRes.ambientLevel,
    atmo,
    vision.responseCurve,
  );

  for (const id of world.query('LightEmitter', 'Transform')) {
    if (lights.length >= MAX_GPU_LIGHTS) break;
    const emitter = world.get(id, 'LightEmitter');
    if (!emitter?.enabled) continue;
    // Sun key light uses env sun path (uEnvSun), not a GpuLight slot.
    if (isSunEmitter(emitter)) continue;

    const pose = lightWorldPose(world, id);
    const beam = beamModelFromEmitter(emitter);
    const gpu = beamModelToGpuParams(beam);

    const appearance = resolveEmitterAppearance(emitter, visionOpts);

    lights.push({
      originCam: worldToCamera(pose.position, camPos),
      directionCam: pose.direction,
      colorRgb: appearance.chroma,
      powerDisplay: appearance.powerDisplay,
      powerLinear: appearance.powerLinear,
      scatterWeight: appearance.scatterWeight,
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
      noiseAssetId: vol.noiseAssetId ?? '',
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

  // Prefer particulate → insulating interior → outdoor for early GPU slots.
  media.sort((a, b) => mediaGpuPriority(a) - mediaGpuPriority(b));

  const q = world.resources.Quality;
  let sunDirCam = normalize(environmentSunDirUnit() as Vec3);
  let sunRgb = environmentVolumetricSunRgb(ambientLevel);
  let hemiRgb = environmentVolumetricHemiRgb(ambientLevel);

  if (atmo?.enabled) {
    const spa = resolveAtmosphereSolarPosition(atmo);
    sunDirCam = normalize(spa.lightDirWorld as Vec3);
    sunRgb = sunIrradianceRgb(atmo.model, spa.lightDirWorld, ambientLevel);
    hemiRgb = skyIrradianceApprox(atmo.model, spa.lightDirWorld, ambientLevel);
  } else {
    const primarySunId = sunBinding.primaryId;
    if (primarySunId) {
      const sunEm = world.get(primarySunId, 'LightEmitter');
      if (sunEm?.enabled) {
        const pose = lightWorldPose(world, primarySunId);
        sunDirCam = normalize(pose.direction);
        const appearance = resolveEmitterAppearance(sunEm, visionOpts);
        const base = environmentVolumetricSunRgb(ambientLevel);
        const k = Math.min(4, 0.35 + appearance.powerLinear * 0.002);
        sunRgb = [
          base[0] * k * appearance.chroma[0],
          base[1] * k * appearance.chroma[1],
          base[2] * k * appearance.chroma[2],
        ];
      } else {
        sunRgb = [0, 0, 0];
      }
    }
  }

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
      shadowQuality: shadowQualityIndex(normalizeShadowQuality(q.shadowQuality)),
      shadowSteps: shadowStepsForQuality(normalizeShadowQuality(q.shadowQuality)),
    },
    env: {
      hemiRgb,
      sunRgb,
      sunDirCam,
      multiScatter: envRes.volumeMultiScatter,
    },
  };
}
