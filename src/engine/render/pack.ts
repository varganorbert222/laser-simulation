import { lightWorldPose } from '../ecs/systems/world-transform';
import type { World } from '../ecs/world';
import { getBasis, getTranslation } from '../math/mat4';
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
import { normalizeGlobalSunVolumetrics } from '../physics/optics/global-sun-volumetrics';
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
  fluidAdvectionModeIndex,
  fluidVorticityStrengthForMode,
  normalizeShadowQuality,
  shadowQualityIndex,
  shadowStepsForQuality,
} from './quality';
import { MAX_GPU_FOGS, MAX_GPU_LIGHTS, MAX_GPU_MEDIA, MAX_GPU_WATERS, MAX_LENS_FLARES } from './contract/slots';
import { fluidAtlasLayout } from '../physics/fluid/atlas';
import { resolveGravityAccel } from '../physics/fluid/gravity-environment';
import { resolveWindForce } from '../physics/fluid/wind-environment';
import { particleCountForFill } from '../physics/fluid/sph-sim';

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

/** Screen-space lens flare source (camera-relative origin or far sun sample). */
export interface GpuLensFlare {
  /** World − cameraPos (same space as GpuLight.originCam). */
  originCam: Vec3;
  /** Emission / light-travel direction (unit, world axes). Ignored when omni. */
  directionCam: Vec3;
  colorRgb: Vec3;
  /** Pre-tonemap HDR flare strength (already includes per-light intensity). */
  intensity: number;
  /** 1 = sun / infinite (depth handling), 0 = positional. */
  directional: number;
  /** 1 = omni / point — flare from every view direction. */
  omni: number;
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

/** @deprecated Prefer GpuFog; kept as volumetric fog slot payload (kind always smoke). */
export const GPU_FLUID_KIND_SMOKE = 0;
/** @deprecated Water is SPH GpuWater — not packed as GpuFluid. */
export const GPU_FLUID_KIND_WATER = 1;

/** Grid NS fog / smoke volume for FogBinder + raymarch. */
export interface GpuFog {
  entityId: string;
  centerCam: Vec3;
  halfExtents: Vec3;
  emitterDirCam: Vec3;
  gridRes: number;
  tilesX: number;
  tilesY: number;
  atlasWidth: number;
  atlasHeight: number;
  viscosity: number;
  dissipation: number;
  buoyancy: number;
  vorticityStrength: number;
  temperatureAmbient: number;
  emissionRate: number;
  opticalDensity: number;
  colorRgb: Vec3;
  scatter: number;
  absorption: number;
  boundaryPad: number;
  jacobiIterations: number;
  advectionMode: number;
  maxDensity: number;
  boundaryMode: number;
  coneCos: number;
  plumeLengthM: number;
  centerWorld: Vec3;
  axisX: Vec3;
  axisY: Vec3;
  axisZ: Vec3;
  windCoupling: number;
  inertiaCoupling: number;
}

/** @deprecated Alias — FogBinder still reads `fluids` / GpuFluid.kind. */
export type GpuFluid = GpuFog & {
  kind: number;
  fillHeight: number;
  causticStrength: number;
  foamStrength: number;
};

/** Analytical water tank for WaterOpticsBinder. */
export interface GpuWater {
  entityId: string;
  centerCam: Vec3;
  halfExtents: Vec3;
  centerWorld: Vec3;
  axisX: Vec3;
  axisY: Vec3;
  axisZ: Vec3;
  /** Derived from fillFraction × OBB / particleRadius packing. */
  particleCount: number;
  particleRadius: number;
  fillFraction: number;
  restDensity: number;
  stiffness: number;
  viscosity: number;
  opticalDensity: number;
  colorRgb: Vec3;
  scatter: number;
  absorption: number;
  ior: number;
  causticStrength: number;
  foamStrength: number;
  waveAmplitude: number;
  waveFrequency: number;
  waveSteepness: number;
  /** Optional named look preset for binders / UI. */
  presetId?: string;
  /**
   * Serialized ECS field — not applied by WaterOpticsBinder (no SPH wind force).
   * Kept for save compatibility / future coupling.
   */
  windCoupling: number;
  inertiaCoupling: number;
}

export interface GatheredFrame {
  lights: GpuLight[];
  /** Screen-space lens flare candidates (lights + sun). */
  lensFlares: GpuLensFlare[];
  media: GpuMedia[];
  /** Fog / smoke volumes (grid NS). */
  fogs: GpuFog[];
  /** SPH water tanks. */
  waters: GpuWater[];
  /**
   * @deprecated Compatibility shim for FogBinder / volumetric fog slots.
   * Same as fogs with kind=SMOKE.
   */
  fluids: GpuFluid[];
  cameraPosition: Vec3;
  timeS: number;
  quality: {
    stepSize: number;
    maxSteps: number;
    densityThreshold: number;
    transmittanceCut: number;
    shadowQuality: number;
    shadowSteps: number;
    fluidEnableRefraction: number;
    fluidMaxSurfaceBounces: number;
    fluidSurfaceSamples: number;
  };
  env: {
    hemiRgb: Vec3;
    sunRgb: Vec3;
    sunDirCam: Vec3;
    multiScatter: number;
  };
  globalSun: {
    enabled: number;
    intensity: number;
    density: number;
    scatter: number;
    absorption: number;
    mieG: number;
    mieWeight: number;
    shaftPower: number;
    hemiFill: number;
    multiScatter: number;
    maxDistance: number;
    stepScale: number;
  };
  forces: {
    gravity: Vec3;
    wind: Vec3;
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

/** Soft-compress luminous scale into a stable HDR flare amplitude. */
function flareIntensityFromPower(powerLinear: number, gain: number): number {
  const p = Math.max(0, powerLinear);
  const soft = Math.log1p(p * 0.35) * 0.85;
  return Math.min(12, soft * Math.max(0, gain));
}

export function gatherRenderPack(world: World): GatheredFrame {
  const camPos = world.resources.Camera.position;
  const lights: GpuLight[] = [];
  const lensFlares: GpuLensFlare[] = [];
  const media: GpuMedia[] = [];
  const sunBinding = refreshSceneSunBinding(world);

  const envRes = world.resources.EnvironmentLighting;
  const globalSunRes = normalizeGlobalSunVolumetrics(world.resources.GlobalSunVolumetrics);
  const atmo = world.resources.Atmosphere;
  const vision = world.resources.DisplayVision;
  const ambientLevel = resolveSceneAmbientLevel(envRes.ambientLevel, atmo);
  const visionOpts = resolveVisionBrightnessOpts(
    envRes.ambientLevel,
    atmo,
    vision.responseCurve,
  );
  const globalFlare = world.resources.Quality.lensFlare !== false;
  const lightsTune = world.resources.Quality.lensFlareLights;
  const sunTune = world.resources.Quality.lensFlareSun;
  const lightsFlareOn = globalFlare && lightsTune?.enabled !== false;
  const sunFlareOn = globalFlare && sunTune?.enabled !== false;

  for (const id of world.query('LightEmitter', 'Transform')) {
    if (lights.length >= MAX_GPU_LIGHTS && lensFlares.length >= MAX_LENS_FLARES) break;
    const emitter = world.get(id, 'LightEmitter');
    if (!emitter?.enabled) continue;
    // Sun key light uses env sun path (uEnvSun), not a GpuLight slot.
    if (isSunEmitter(emitter)) continue;

    const pose = lightWorldPose(world, id);
    const beam = beamModelFromEmitter(emitter);
    const gpu = beamModelToGpuParams(beam);

    const appearance = resolveEmitterAppearance(emitter, visionOpts);
    const originCam = worldToCamera(pose.position, camPos);

    if (lights.length < MAX_GPU_LIGHTS) {
      lights.push({
        originCam,
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

    if (
      lightsFlareOn &&
      emitter.lensFlareEnabled !== false &&
      lensFlares.length < MAX_LENS_FLARES
    ) {
      const intensity = flareIntensityFromPower(
        appearance.powerLinear,
        (emitter.lensFlareIntensity ?? 1) * (lightsTune?.intensity ?? 1),
      );
      if (intensity > 1e-4) {
        lensFlares.push({
          originCam,
          directionCam: pose.direction,
          colorRgb: appearance.chroma,
          intensity,
          directional: 0,
          // Point lamp: isotropic. Laser / spot / parallel / flashlight: beam axis only.
          omni: emitter.params.mode === 'omni_lamp' ? 1 : 0,
        });
      }
    }
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

  const fogs: GpuFog[] = [];
  const waters: GpuWater[] = [];
  const qEarly = world.resources.Quality;
  const jacobiIterations = qEarly.fluidJacobiIterations;
  const advectionMode = fluidAdvectionModeIndex(qEarly.fluidAdvectionMode);
  const qualityVorticity = fluidVorticityStrengthForMode(qEarly.fluidVorticityMode);

  for (const id of world.query('FogVolume', 'Transform')) {
    if (fogs.length >= MAX_GPU_FOGS) break;
    const vol = world.get(id, 'FogVolume');
    if (!vol?.enabled) continue;
    const xform = world.get(id, 'WorldXform');
    const transform = world.get(id, 'Transform');
    const center = xform
      ? getTranslation(xform.matrix)
      : (transform?.position ?? ([0, 0, 0] as Vec3));
    const basis = xform
      ? getBasis(xform.matrix)
      : { x: [1, 0, 0] as Vec3, y: [0, 1, 0] as Vec3, z: [0, 0, 1] as Vec3 };
    const gridRes = qEarly.fluidGridRes || vol.gridRes;
    const layout = fluidAtlasLayout(gridRes);
    const smoke = world.get(id, 'SmokeEmitter');
    let emissionRate = vol.emissionRate;
    let coneCos = PLUME_DISABLED_CONE_COS;
    let plumeLengthM = 4;
    if (smoke) {
      emissionRate = smoke.enabled ? smoke.emissionRate * vol.emissionRate : 0;
      coneCos = coneCosFromHalfAngleDeg(smoke.coneAngleDeg);
      plumeLengthM = smoke.plumeLengthM;
    }
    const dissipation = qEarly.fluidDissipation;
    const vorticityStrength =
      qEarly.fluidVorticityMode === 'off'
        ? 0
        : Math.max(vol.vorticityStrength * 0.5, qualityVorticity);
    fogs.push({
      entityId: id,
      centerCam: worldToCamera(center, camPos),
      halfExtents: vol.halfExtents,
      emitterDirCam: lightWorldPose(world, id).direction,
      gridRes: layout.gridRes,
      tilesX: layout.tilesX,
      tilesY: layout.tilesY,
      atlasWidth: layout.atlasWidth,
      atlasHeight: layout.atlasHeight,
      viscosity: vol.viscosity,
      dissipation,
      buoyancy: vol.buoyancy,
      vorticityStrength,
      temperatureAmbient: vol.temperatureAmbient,
      emissionRate,
      opticalDensity: vol.opticalDensity,
      colorRgb: vol.color,
      scatter: vol.scatter,
      absorption: vol.absorption,
      boundaryPad: vol.boundaryPad,
      jacobiIterations,
      advectionMode,
      maxDensity: vol.maxDensity,
      boundaryMode: vol.boundaryMode === 'openTop' ? 1 : 0,
      coneCos,
      plumeLengthM,
      centerWorld: center,
      axisX: basis.x,
      axisY: basis.y,
      axisZ: basis.z,
      windCoupling: vol.windCoupling,
      inertiaCoupling: vol.inertiaCoupling,
    });
  }

  for (const id of world.query('FluidVolume', 'Transform')) {
    if (waters.length >= MAX_GPU_WATERS) break;
    const vol = world.get(id, 'FluidVolume');
    if (!vol?.enabled) continue;
    const xform = world.get(id, 'WorldXform');
    const transform = world.get(id, 'Transform');
    const center = xform
      ? getTranslation(xform.matrix)
      : (transform?.position ?? ([0, 0, 0] as Vec3));
    const basis = xform
      ? getBasis(xform.matrix)
      : { x: [1, 0, 0] as Vec3, y: [0, 1, 0] as Vec3, z: [0, 0, 1] as Vec3 };
    waters.push({
      entityId: id,
      centerCam: worldToCamera(center, camPos),
      halfExtents: vol.halfExtents,
      centerWorld: center,
      axisX: basis.x,
      axisY: basis.y,
      axisZ: basis.z,
      particleCount: particleCountForFill(vol.halfExtents, vol.fillFraction, vol.particleRadius),
      particleRadius: vol.particleRadius,
      fillFraction: vol.fillFraction,
      restDensity: vol.restDensity,
      stiffness: vol.stiffness,
      viscosity: vol.viscosity,
      opticalDensity: vol.opticalDensity,
      colorRgb: vol.color,
      scatter: vol.scatter,
      absorption: vol.absorption,
      ior: vol.ior,
      causticStrength: vol.causticStrength,
      foamStrength: vol.foamStrength,
      waveAmplitude: vol.waveAmplitude,
      waveFrequency: vol.waveFrequency,
      waveSteepness: vol.waveSteepness,
      presetId: vol.presetId,
      windCoupling: vol.windCoupling,
      inertiaCoupling: vol.inertiaCoupling,
    });
  }

  const fluids: GpuFluid[] = fogs.map((fog) => ({
    ...fog,
    kind: GPU_FLUID_KIND_SMOKE,
    fillHeight: 0,
    causticStrength: 0,
    foamStrength: 0,
  }));

  const q = world.resources.Quality;
  const timeS = world.resources.Time.elapsedS;
  const gravity = resolveGravityAccel(world.resources.GravityEnvironment);
  const wind = resolveWindForce(world.resources.WindEnvironment, timeS);
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

  // Sun / sky key light → optional directional lens flare (not a GpuLight slot).
  if (sunFlareOn && lensFlares.length < MAX_LENS_FLARES) {
    let sunFlareOk = true;
    let sunGain = 1.25;
    let sunChroma: Vec3 = [
      Math.max(sunRgb[0], 1e-6),
      Math.max(sunRgb[1], 1e-6),
      Math.max(sunRgb[2], 1e-6),
    ];
    const primarySunId = sunBinding.primaryId;
    if (primarySunId) {
      const sunEm = world.get(primarySunId, 'LightEmitter');
      if (!sunEm?.enabled || sunEm.lensFlareEnabled === false) {
        sunFlareOk = false;
      } else {
        sunGain = sunEm.lensFlareIntensity ?? 1.25;
        const appearance = resolveEmitterAppearance(sunEm, visionOpts);
        sunChroma = appearance.chroma;
      }
    } else if (!atmo?.enabled) {
      sunFlareOk = false;
    }
    const sunLum = 0.2126 * sunRgb[0] + 0.7152 * sunRgb[1] + 0.0722 * sunRgb[2];
    if (sunFlareOk && sunLum > 1e-4) {
      // Prefer the sun entity sky position (already toward-sun); else −lightDir.
      let originCam: Vec3;
      if (primarySunId) {
        const pose = lightWorldPose(world, primarySunId);
        originCam = worldToCamera(pose.position, camPos);
      } else {
        const far = 5000;
        originCam = [
          -sunDirCam[0] * far,
          -sunDirCam[1] * far,
          -sunDirCam[2] * far,
        ];
      }
      lensFlares.push({
        originCam,
        directionCam: sunDirCam,
        colorRgb: sunChroma,
        intensity: Math.min(
          14,
          Math.log1p(sunLum * 2.5) * 1.1 * sunGain * (sunTune?.intensity ?? 1),
        ),
        directional: 1,
        omni: 0,
      });
    }
  }

  return {
    lights,
    lensFlares,
    media,
    fogs,
    waters,
    fluids,
    cameraPosition: camPos,
    timeS,
    quality: {
      stepSize: q.stepSize,
      maxSteps: q.maxSteps,
      densityThreshold: q.densityThreshold,
      transmittanceCut: q.transmittanceCut,
      shadowQuality: shadowQualityIndex(normalizeShadowQuality(q.shadowQuality)),
      shadowSteps: shadowStepsForQuality(normalizeShadowQuality(q.shadowQuality)),
      fluidEnableRefraction: q.fluidEnableRefraction ? 1 : 0,
      fluidMaxSurfaceBounces: q.fluidMaxSurfaceBounces,
      fluidSurfaceSamples: q.fluidSurfaceSamples,
    },
    env: {
      hemiRgb,
      sunRgb,
      sunDirCam,
      multiScatter: envRes.volumeMultiScatter,
    },
    globalSun: {
      enabled: globalSunRes.enabled ? 1 : 0,
      intensity: globalSunRes.intensity,
      density: globalSunRes.density,
      scatter: globalSunRes.scatter,
      absorption: globalSunRes.absorption,
      mieG: globalSunRes.mieG,
      mieWeight: globalSunRes.mieWeight,
      shaftPower: globalSunRes.shaftPower,
      hemiFill: globalSunRes.hemiFill,
      multiScatter: globalSunRes.multiScatter,
      maxDistance: globalSunRes.maxDistance,
      stepScale: globalSunRes.stepScale,
    },
    forces: {
      gravity,
      wind,
    },
  };
}
