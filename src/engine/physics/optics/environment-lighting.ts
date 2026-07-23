/**
 * Scene fill / key ambient that drives both viewport lighting and eye exposure.
 * 0 = dark lab, 1 = bright day — no separate day/night vision modes.
 *
 * Volumetric media also receive this as environment irradiance (cloud lighting):
 * hemi + sun in-scatter, plus an isotropic multiple-scatter fraction around emitters.
 */
import { clampUnit } from '../../math/clamp';

export interface EnvironmentLighting {
  /**
   * Relative environment brightness in [0, 1].
   * Controls hemispheric + directional fill and eyeAdaptationGain (inverse).
   */
  ambientLevel: number;
  /**
   * Isotropic multiple-scatter fraction for volumetrics [0, 1].
   * 0 = pure single-scatter phase; higher → fog/smoke “glows” around beams (cheap MS).
   */
  volumeMultiScatter: number;
}

/** Default matches the previous fixed hemi≈0.22 / sun≈0.12 look. */
export const ENVIRONMENT_AMBIENT_DEFAULT = 0.38;

/** Default educational multi-scatter fill in volumes. */
export const ENVIRONMENT_VOLUME_MS_DEFAULT = 0.42;

/** World-space key light direction (matches Babylon directional “sun”). */
export const ENVIRONMENT_SUN_DIR_WORLD: readonly [number, number, number] = [
  -0.4, -1, -0.3,
];

export function clampAmbientLevel(level: number): number {
  return clampUnit(level, ENVIRONMENT_AMBIENT_DEFAULT);
}

export function clampVolumeMultiScatter(v: number): number {
  return clampUnit(v, ENVIRONMENT_VOLUME_MS_DEFAULT);
}

export function createDefaultEnvironmentLighting(): EnvironmentLighting {
  return {
    ambientLevel: ENVIRONMENT_AMBIENT_DEFAULT,
    volumeMultiScatter: ENVIRONMENT_VOLUME_MS_DEFAULT,
  };
}

export function normalizeEnvironmentLighting(
  raw: Partial<EnvironmentLighting> | null | undefined,
): EnvironmentLighting {
  const base = createDefaultEnvironmentLighting();
  if (!raw || typeof raw !== 'object') return base;
  return {
    ambientLevel: clampAmbientLevel(
      typeof raw.ambientLevel === 'number' ? raw.ambientLevel : base.ambientLevel,
    ),
    volumeMultiScatter: clampVolumeMultiScatter(
      typeof raw.volumeMultiScatter === 'number'
        ? raw.volumeMultiScatter
        : base.volumeMultiScatter,
    ),
  };
}

/** Hemispheric intensity from ambient level. */
export function environmentHemiIntensity(ambientLevel: number): number {
  const a = clampAmbientLevel(ambientLevel);
  return 0.02 + a * 0.53;
}

/** Key directional intensity from ambient level. */
export function environmentSunIntensity(ambientLevel: number): number {
  const a = clampAmbientLevel(ambientLevel);
  return 0.01 + a * 0.34;
}

/** Clear-color RGB from ambient level (dark lab → brighter plate). */
export function environmentClearRgb(ambientLevel: number): [number, number, number] {
  const a = clampAmbientLevel(ambientLevel);
  const night: [number, number, number] = [0.008, 0.01, 0.016];
  const day: [number, number, number] = [0.07, 0.085, 0.11];
  return [
    night[0] + (day[0] - night[0]) * a,
    night[1] + (day[1] - night[1]) * a,
    night[2] + (day[2] - night[2]) * a,
  ];
}

/**
 * Cool skylight tint for volumetric hemi in-scatter (educational RGB).
 * Scaled so fog / haze visibly responds to ambient without washing out beams.
 */
export function environmentVolumetricHemiRgb(
  ambientLevel: number,
): [number, number, number] {
  const i = environmentHemiIntensity(ambientLevel) * 0.55;
  return [i * 0.72, i * 0.82, i * 1.0];
}

/** Warm-key sun tint for volumetric directional in-scatter. */
export function environmentVolumetricSunRgb(
  ambientLevel: number,
): [number, number, number] {
  const i = environmentSunIntensity(ambientLevel) * 0.85;
  return [i * 1.0, i * 0.94, i * 0.82];
}

/** Normalize sun direction for packing (world → unit). */
export function environmentSunDirUnit(): [number, number, number] {
  const [x, y, z] = ENVIRONMENT_SUN_DIR_WORLD;
  const len = Math.hypot(x, y, z) || 1;
  return [x / len, y / len, z / len];
}
