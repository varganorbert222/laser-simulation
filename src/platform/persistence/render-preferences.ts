/**
 * Browser-persisted last-used Quality + Atmosphere settings.
 * Named Low→Ultra packs stay static in code; this only remembers the live
 * values the user last had (including Custom tweaks).
 */

import {
  normalizeAtmosphereSettings,
  normalizeQualityResource,
  refreshQualityPresets,
  type AtmosphereSettings,
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
  atmosphere: AtmosphereSettings;
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
  if (!obj.atmosphere || typeof obj.atmosphere !== 'object') return null;
  const quality = normalizeQualityResource(obj.quality);
  const atmosphere = normalizeAtmosphereSettings({
    ...obj.atmosphere,
    skyboxHdrColors: quality.colorProfile === 'hdr',
  });
  return {
    version: RENDER_PREFERENCES_VERSION,
    quality: refreshQualityPresets(quality, atmosphere.qualityPreset),
    atmosphere,
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

/** Snapshot live world resources into browser preferences. */
export function captureRenderPreferences(world: World): RenderPreferences {
  return {
    version: RENDER_PREFERENCES_VERSION,
    quality: world.resources.Quality,
    atmosphere: world.resources.Atmosphere,
  };
}

/** Apply remembered Quality + Atmosphere onto a world (demo / unsaved session). */
export function applyRenderPreferences(
  world: World,
  prefs: RenderPreferences | null | undefined,
): World {
  if (!prefs) return world;
  const quality = normalizeQualityResource(prefs.quality);
  const atmosphere = normalizeAtmosphereSettings({
    ...prefs.atmosphere,
    skyboxHdrColors: quality.colorProfile === 'hdr',
  });
  world.resources.Quality = refreshQualityPresets(quality, atmosphere.qualityPreset);
  world.resources.Atmosphere = atmosphere;
  world.bump();
  return world;
}
