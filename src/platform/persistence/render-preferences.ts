/**
 * Browser-persisted global graphics preferences (Quality + sky render + GlobalSun).
 * These are project-level — not authored per scene. Civil time / site stay on the
 * scene's Atmosphere resource.
 */

import {
  createDefaultAtmosphereSettings,
  createDefaultGlobalSunVolumetrics,
  normalizeAtmosphereSettings,
  normalizeGlobalSunVolumetrics,
  normalizeQualityResource,
  refreshQualityPresets,
  type AtmosphereSettings,
  type GlobalSunVolumetrics,
  type Quality,
  type World,
} from '@engine';

export const RENDER_PREFERENCES_STORAGE_KEY = 'light-studio.render-preferences.v1';
export const RENDER_PREFERENCES_VERSION = 1 as const;

/** Minimal key/value store (localStorage-compatible). */
export interface PreferencesStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

export interface RenderPreferences {
  version: typeof RENDER_PREFERENCES_VERSION;
  quality: Quality;
  /**
   * Atmosphere *render* look (samples, exposure, LUTs, textures).
   * Civil time / site / enabled are scene-owned and preserved on scene load.
   */
  atmosphere: AtmosphereSettings;
  globalSunVolumetrics?: GlobalSunVolumetrics;
}

export interface ApplyRenderPreferencesOptions {
  /**
   * When true (scene load), keep the world's Atmosphere civil time / site / enabled
   * and only overlay render/look fields from prefs.
   */
  preserveSceneTimeOfDay?: boolean;
}

function browserStorage(): PreferencesStorage | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

export function createMemoryPreferencesStorage(
  initial: Record<string, string> = {},
): PreferencesStorage & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key]! : null;
    },
    setItem(key, value) {
      data[key] = value;
    },
    removeItem(key) {
      delete data[key];
    },
  };
}

export function defaultPreferencesStorage(): PreferencesStorage {
  return browserStorage() ?? createMemoryPreferencesStorage();
}

export function normalizeRenderPreferences(raw: unknown): RenderPreferences | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Partial<RenderPreferences>;
  if (obj.version !== RENDER_PREFERENCES_VERSION) return null;
  if (!obj.quality || typeof obj.quality !== 'object') return null;
  const quality = normalizeQualityResource(obj.quality);
  const atmosphere = normalizeAtmosphereSettings({
    ...(obj.atmosphere && typeof obj.atmosphere === 'object'
      ? obj.atmosphere
      : createDefaultAtmosphereSettings()),
    skyboxHdrColors: quality.colorProfile === 'hdr',
  });
  const globalSunVolumetrics = normalizeGlobalSunVolumetrics(
    obj.globalSunVolumetrics ?? createDefaultGlobalSunVolumetrics(),
  );
  return {
    version: RENDER_PREFERENCES_VERSION,
    quality: refreshQualityPresets(quality, atmosphere.qualityPreset),
    atmosphere,
    globalSunVolumetrics,
  };
}

export function readRenderPreferences(
  storage: PreferencesStorage = defaultPreferencesStorage(),
): RenderPreferences | null {
  try {
    const raw = storage.getItem(RENDER_PREFERENCES_STORAGE_KEY);
    if (!raw) return null;
    return normalizeRenderPreferences(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function writeRenderPreferences(
  prefs: RenderPreferences,
  storage: PreferencesStorage = defaultPreferencesStorage(),
): void {
  const normalized = normalizeRenderPreferences(prefs);
  if (!normalized) return;
  try {
    storage.setItem(RENDER_PREFERENCES_STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    // Quota / private mode — ignore.
  }
}

/** Snapshot live world graphics into browser preferences. */
export function captureRenderPreferences(world: World): RenderPreferences {
  return {
    version: RENDER_PREFERENCES_VERSION,
    quality: world.resources.Quality,
    atmosphere: world.resources.Atmosphere,
    globalSunVolumetrics: world.resources.GlobalSunVolumetrics,
  };
}

/**
 * Merge prefs Atmosphere render fields onto a scene Atmosphere, keeping civil
 * time / site / enabled from the scene.
 */
export function mergeAtmosphereKeepSceneTimeOfDay(
  sceneAtmosphere: AtmosphereSettings,
  prefsAtmosphere: AtmosphereSettings,
): AtmosphereSettings {
  return normalizeAtmosphereSettings({
    ...prefsAtmosphere,
    enabled: sceneAtmosphere.enabled,
    latitudeDeg: sceneAtmosphere.latitudeDeg,
    longitudeDeg: sceneAtmosphere.longitudeDeg,
    timezoneOffsetHours: sceneAtmosphere.timezoneOffsetHours,
    year: sceneAtmosphere.year,
    month: sceneAtmosphere.month,
    day: sceneAtmosphere.day,
    hour: sceneAtmosphere.hour,
    minute: sceneAtmosphere.minute,
    timeAnimating: sceneAtmosphere.timeAnimating,
    timeSpeedHoursPerSecond: sceneAtmosphere.timeSpeedHoursPerSecond,
    skyboxHdrColors: prefsAtmosphere.skyboxHdrColors,
  });
}

/** Apply remembered global graphics onto a world. */
export function applyRenderPreferences(
  world: World,
  prefs: RenderPreferences | null | undefined,
  opts?: ApplyRenderPreferencesOptions,
): World {
  if (!prefs) return world;
  const quality = normalizeQualityResource(prefs.quality);
  const prefsAtmosphere = normalizeAtmosphereSettings({
    ...prefs.atmosphere,
    skyboxHdrColors: quality.colorProfile === 'hdr',
  });
  const atmosphere = opts?.preserveSceneTimeOfDay
    ? mergeAtmosphereKeepSceneTimeOfDay(world.resources.Atmosphere, prefsAtmosphere)
    : prefsAtmosphere;

  world.resources.Quality = refreshQualityPresets(quality, atmosphere.qualityPreset);
  world.resources.Atmosphere = atmosphere;
  world.resources.GlobalSunVolumetrics = normalizeGlobalSunVolumetrics(
    prefs.globalSunVolumetrics ?? createDefaultGlobalSunVolumetrics(),
  );
  world.bump();
  return world;
}
