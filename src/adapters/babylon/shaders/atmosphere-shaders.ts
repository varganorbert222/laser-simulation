/**
 * Atmosphere shader keys + uniform/sampler name lists for LUT bake + skybox.
 */
import {
  ATMOSPHERE_AERIAL_PERSPECTIVE_FRAGMENT,
  ATMOSPHERE_ENV_CAPTURE_VERT,
  ATMOSPHERE_SKY_VIEW_FRAGMENT,
  ATMOSPHERE_SKYBOX_FRAG,
  ATMOSPHERE_SKYBOX_VERT,
  ATMOSPHERE_TRANSMITTANCE_FRAGMENT,
} from '../../../generated/shaders';

export {
  ATMOSPHERE_AERIAL_PERSPECTIVE_FRAGMENT,
  ATMOSPHERE_ENV_CAPTURE_VERT,
  ATMOSPHERE_SKY_VIEW_FRAGMENT,
  ATMOSPHERE_SKYBOX_FRAG,
  ATMOSPHERE_SKYBOX_VERT,
  ATMOSPHERE_TRANSMITTANCE_FRAGMENT,
};

export const ATMOSPHERE_TRANSMITTANCE_KEY = 'atmosphereTransmittance';
export const ATMOSPHERE_SKY_VIEW_KEY = 'atmosphereSkyView';
export const ATMOSPHERE_AERIAL_KEY = 'atmosphereAerial';
export const ATMOSPHERE_SKYBOX_SHADER = 'atmosphereSkybox';
/** Mesh capture for ReflectionProbe → scene.environmentTexture / material reflections. */
export const ATMOSPHERE_ENV_CAPTURE_SHADER = 'atmosphereEnvCapture';

export const ATMOSPHERE_COMMON_UNIFORMS = [
  'uPlanetCenter',
  'uPlanetRadius',
  'uAtmosphereRadius',
  'uRayleighScattering',
  'uRayleighScaleHeight',
  'uMieScattering',
  'uMieAbsorption',
  'uMieScaleHeight',
  'uMieG',
  'uOzoneAbsorption',
  'uOzoneCenterHeight',
  'uOzoneWidth',
  'uGroundAlbedo',
  'uSolarIrradiance',
  'uSunDirection',
  'uEyeHeight',
  'uResolution',
] as const;

export const ATMOSPHERE_TRANSMITTANCE_UNIFORMS = [...ATMOSPHERE_COMMON_UNIFORMS];

export const ATMOSPHERE_SKY_VIEW_UNIFORMS = [
  ...ATMOSPHERE_COMMON_UNIFORMS,
  'uSampleCount',
] as const;

export const ATMOSPHERE_SKY_VIEW_SAMPLERS = ['uTransmittanceLUT'] as const;

export const ATMOSPHERE_AERIAL_UNIFORMS = [
  ...ATMOSPHERE_COMMON_UNIFORMS,
  'uSampleCount',
  'uSliceZ',
  'uMaxDistance',
] as const;

export const ATMOSPHERE_AERIAL_SAMPLERS = ['uTransmittanceLUT'] as const;
