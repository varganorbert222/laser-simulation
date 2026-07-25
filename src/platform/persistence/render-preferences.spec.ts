import { describe, expect, it } from 'vitest';
import {
  createAtmosphereSettingsForQuality,
  createDemoWorld,
  createQuality,
  normalizeAtmosphereSettings,
  refreshQualityPresets,
} from '@engine';
import {
  RENDER_PREFERENCES_STORAGE_KEY,
  applyRenderPreferences,
  captureRenderPreferences,
  createDemoWorldWithPreferences,
  createEmptySceneLibrary,
  createMemoryPreferencesStorage,
  createMemorySceneStorage,
  normalizeRenderPreferences,
  readRenderPreferences,
  resolveStartupWorld,
  upsertSceneInLibrary,
  writeRenderPreferences,
  writeSceneLibrary,
} from './index';

describe('render preferences', () => {
  it('round-trips custom Quality + Atmosphere through storage', () => {
    const storage = createMemoryPreferencesStorage();
    const world = createDemoWorld();
    world.resources.Quality = refreshQualityPresets({
      ...createQuality('high'),
      stepSize: 0.08,
      maxSteps: 200,
    });
    world.resources.Atmosphere = normalizeAtmosphereSettings({
      ...world.resources.Atmosphere,
      skyViewSamples: 72,
      exposure: 2.1,
      enabled: true,
    });
    world.resources.Quality = refreshQualityPresets(
      world.resources.Quality,
      world.resources.Atmosphere.qualityPreset,
    );

    writeRenderPreferences(captureRenderPreferences(world), storage);
    const loaded = readRenderPreferences(storage);
    expect(loaded).not.toBeNull();
    expect(loaded!.quality.stepSize).toBeCloseTo(0.08);
    expect(loaded!.quality.maxSteps).toBe(200);
    expect(loaded!.quality.overallPreset).toBe('custom');
    expect(loaded!.atmosphere.skyViewSamples).toBe(72);
    expect(loaded!.atmosphere.exposure).toBeCloseTo(2.1);
    expect(loaded!.atmosphere.qualityPreset).toBe('custom');
    expect(loaded!.atmosphere.enabled).toBe(true);
  });

  it('leaves static preset packs unchanged when remembering custom', () => {
    const storage = createMemoryPreferencesStorage();
    const custom = createDemoWorld();
    custom.resources.Quality = refreshQualityPresets({
      ...createQuality('medium'),
      renderScale: 0.55,
    });
    writeRenderPreferences(captureRenderPreferences(custom), storage);

    expect(createQuality('high').stepSize).toBe(0.1);
    expect(createQuality('high').maxSteps).toBe(256);

    const restored = applyRenderPreferences(
      createDemoWorld(),
      readRenderPreferences(storage),
    );
    expect(restored.resources.Quality.renderScale).toBeCloseTo(0.55);
    expect(restored.resources.Quality.volumetricsPreset).toBe('custom');
    expect(createQuality('medium').renderScale).toBeLessThan(0.4);
  });

  it('createDemoWorldWithPreferences restores remembered settings', () => {
    const storage = createMemorySceneStorage();
    const seed = createDemoWorld();
    seed.resources.Quality = createQuality('ultra');
    seed.resources.Atmosphere = createAtmosphereSettingsForQuality(
      'ultra',
      normalizeAtmosphereSettings({
        ...seed.resources.Atmosphere,
        exposure: 1.8,
      }),
    );
    seed.resources.Quality = refreshQualityPresets(
      seed.resources.Quality,
      seed.resources.Atmosphere.qualityPreset,
    );
    expect(seed.resources.Quality.overallPreset).toBe('ultra');
    writeRenderPreferences(captureRenderPreferences(seed), storage);

    const demo = createDemoWorldWithPreferences(storage);
    expect(demo.resources.Quality.overallPreset).toBe('ultra');
    expect(demo.resources.Atmosphere.qualityPreset).toBe('ultra');
    expect(demo.resources.Atmosphere.exposure).toBeCloseTo(1.8);
  });

  it('resolveStartupWorld applies prefs only when no active scene', () => {
    const storage = createMemorySceneStorage();
    const prefsSeed = createDemoWorld();
    prefsSeed.resources.Quality = createQuality('low');
    prefsSeed.resources.Atmosphere = createAtmosphereSettingsForQuality(
      'low',
      prefsSeed.resources.Atmosphere,
    );
    prefsSeed.resources.Quality = refreshQualityPresets(
      prefsSeed.resources.Quality,
      prefsSeed.resources.Atmosphere.qualityPreset,
    );
    expect(prefsSeed.resources.Quality.overallPreset).toBe('low');
    writeRenderPreferences(captureRenderPreferences(prefsSeed), storage);

    const emptyBoot = resolveStartupWorld(storage);
    expect(emptyBoot.world.resources.Quality.overallPreset).toBe('low');
    expect(emptyBoot.world.resources.Atmosphere.qualityPreset).toBe('low');

    const sceneWorld = createDemoWorld();
    sceneWorld.resources.Quality = createQuality('high');
    sceneWorld.resources.Atmosphere = createAtmosphereSettingsForQuality(
      'high',
      sceneWorld.resources.Atmosphere,
    );
    sceneWorld.resources.Quality = refreshQualityPresets(
      sceneWorld.resources.Quality,
      sceneWorld.resources.Atmosphere.qualityPreset,
    );
    const { library } = upsertSceneInLibrary(createEmptySceneLibrary(), sceneWorld, {
      label: 'Saved',
    });
    writeSceneLibrary(library, storage);
    writeRenderPreferences(captureRenderPreferences(prefsSeed), storage);

    const withScene = resolveStartupWorld(storage);
    // Scene document wins — prefs stay low, but are not overlaid onto the active scene.
    expect(withScene.world.resources.Quality.volumetricsPreset).toBe('high');
    expect(withScene.world.resources.Atmosphere.qualityPreset).toBe('high');
    expect(withScene.world.resources.Quality.volumetricsPreset).not.toBe('low');
  });

  it('normalize rejects bad version / shape', () => {
    expect(normalizeRenderPreferences(null)).toBeNull();
    expect(normalizeRenderPreferences({ version: 99 })).toBeNull();
    expect(
      normalizeRenderPreferences({
        version: 1,
        quality: createQuality('medium'),
      }),
    ).toBeNull();
  });

  it('uses a dedicated storage key', () => {
    expect(RENDER_PREFERENCES_STORAGE_KEY).toBe('light-studio.render-preferences.v1');
  });
});
