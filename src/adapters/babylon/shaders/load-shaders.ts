/**
 * Babylon Effect.ShadersStore keys + volumetric uniform/sampler name lists.
 * Shader source bodies live in src/generated/shaders (build-time codegen).
 */
import { VOLUMETRIC_LIGHT_SLOTS, VOLUMETRIC_MEDIA_SLOTS } from '@engine';
import {
  VOLUMETRIC_COMPOSE_FRAGMENT,
  VOLUMETRIC_FRAGMENT,
  VOLUMETRIC_LUMINANCE_FRAGMENT,
  VOLUMETRIC_LUMINANCE_REDUCE_FRAGMENT,
} from '../../../generated/shaders';

export {
  VOLUMETRIC_COMPOSE_FRAGMENT,
  VOLUMETRIC_FRAGMENT,
  VOLUMETRIC_LUMINANCE_FRAGMENT,
  VOLUMETRIC_LUMINANCE_REDUCE_FRAGMENT,
};

export const VOLUMETRIC_SHADER_KEY = 'volumetricFragmentShader';
export const VOLUMETRIC_COMPOSE_SHADER_KEY = 'volumetricComposeFragmentShader';

function lightUniformNames(slots: number): string[] {
  const names: string[] = ['uLightCount'];
  for (let i = 0; i < slots; i++) {
    names.push(
      `uLightOrigin${i}`,
      `uLightDir${i}`,
      `uLightColor${i}`,
      `uLightPower${i}`,
      `uLightScatter${i}`,
      `uLightMode${i}`,
      `uLightP0${i}`,
      `uLightP1${i}`,
      `uLightP2${i}`,
      `uLightP3${i}`,
      `uLightP4${i}`,
      `uLightP5${i}`,
      `uLightSpill${i}`,
    );
  }
  return names;
}

function mediaUniformNames(slots: number): string[] {
  const names: string[] = ['uMediaCount'];
  for (let i = 0; i < slots; i++) {
    names.push(
      `uMediaCenter${i}`,
      `uMediaHalfExt${i}`,
      `uMediaColor${i}`,
      `uMediaDensity${i}`,
      `uMediaFbmScale${i}`,
      `uMediaFbmTime${i}`,
      `uMediaNoiseLow${i}`,
      `uMediaNoiseHigh${i}`,
      `uMediaNoiseKind${i}`,
      `uMediaScatter${i}`,
      `uMediaScatterMie${i}`,
      `uMediaAbsorb${i}`,
      `uMediaSpectralExp${i}`,
      `uMediaMieG${i}`,
      `uMediaScatterModel${i}`,
      `uMediaTurbulence${i}`,
      `uMediaLayerKind${i}`,
      `uMediaInsulating${i}`,
      `uMediaEmission${i}`,
      `uMediaConeCos${i}`,
      `uMediaPlumeLen${i}`,
      `uMediaPlumeDir${i}`,
    );
  }
  return names;
}

function mediaNoiseSamplers(slots: number): string[] {
  const names: string[] = [];
  for (let i = 0; i < slots; i++) {
    names.push(`uMediaNoise2D${i}`, `uMediaNoise3D${i}`);
  }
  return names;
}

export const VOLUMETRIC_UNIFORMS = [
  'uResolution',
  'uTime',
  'uInvViewProj',
  'uView',
  'uCameraPos',
  'uUseSceneDepth',
  'uStepSize',
  'uMaxSteps',
  'uDensityThreshold',
  'uTransmittanceCut',
  'uShadowQuality',
  'uShadowSteps',
  'uEnvHemi',
  'uEnvSun',
  'uEnvSunDir',
  'uVolumeMultiScatter',
  ...lightUniformNames(VOLUMETRIC_LIGHT_SLOTS),
  ...mediaUniformNames(VOLUMETRIC_MEDIA_SLOTS),
];

export const VOLUMETRIC_SAMPLERS = ['uSceneDepth', ...mediaNoiseSamplers(VOLUMETRIC_MEDIA_SLOTS)];
