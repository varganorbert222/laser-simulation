import { Injectable, computed, inject } from '@angular/core';
import {
  createDefaultDisplayResponseCurve,
  createQuality,
  createAtmosphereSettingsForQuality,
  clamp01,
  clampRange,
  clampRenderScale,
  normalizeDisplayResponseCurve,
  normalizeDisplayVision,
  normalizeEnvironmentLighting,
  normalizeAtmosphereSettings,
  normalizeGravityEnvironment,
  normalizeWindEnvironment,
  normalizeGlobalSunVolumetrics,
  applyGlobalSunLookPreset,
  applyGlobalSunQualityPreset,
  createGlobalSunVolumetricsForQuality,
  atmosphereWithTimeOfDay,
  atmosphereWithTimePreset,
  atmosphereWithSeasonPreset,
  atmosphereWithUtcMs,
  syncPrimarySunFromAtmosphere,
  normalizeShadowQuality,
  normalizeColorProfile,
  clampOutputGamma,
  normalizeTonemapMode,
  normalizeLensFlareGroupTune,
  normalizeLensFlareOptics,
  defaultLensFlareLightsTune,
  defaultLensFlareOptics,
  defaultLensFlareSunTune,
  createLensFlareElement,
  normalizeLensFlareElement,
  MAX_FLARE_ELEMENTS,
  applyVolumetricsPreset,
  applyShadowPreset,
  applyPresentationPreset,
  applyFluidsPreset,
  refreshQualityPresets,
  clampFluidJacobiIterations,
  clampFluidMaxSurfaceBounces,
  clampFluidSurfaceSamples,
  normalizeFluidAdvectionMode,
  normalizeFluidGridResQuality,
  normalizeFluidVorticityMode,
  type AtmosphereSeasonPresetId,
  type AtmosphereSettings,
  type AtmosphereTimePresetId,
  type GravityEnvironment,
  type WindEnvironment,
  type GlobalSunVolumetrics,
  type GlobalSunLookPresetId,
  type ColorProfile,
  type TonemapMode,
  type DisplayResponseCurve,
  type PresentationMode,
  type Quality,
  type QualityLadder,
  type QualityPresetSelection,
  type ShadowQuality,
  type LensFlareGroupTune,
  type LensFlareOptics,
  type LensFlareElement,
  type LensFlareElementKind,
  type ObserverId,
  type DebugViewMode,
  type ConeFatigueSettings,
  type World,
} from '@engine';
import {
  applyRenderPreferences,
  documentToWorld,
  downloadSceneJson,
  readFileAsText,
  readRenderPreferences,
  sanitizeSceneFilename,
  captureRenderPreferences,
  createDemoWorldWithPreferences,
  createEmptyWorldWithPreferences,
  writeRenderPreferences,
} from '@platform/persistence';
import { EngineHostService } from '../services/engine-host.service';
import { SceneLibraryService } from './scene-library.service';

@Injectable({ providedIn: 'root' })
export class SessionService {
  private readonly engine = inject(EngineHostService);
  private readonly scenes = inject(SceneLibraryService);

  /** Persist global graphics (Quality / sky look / GlobalSun) — not scene-bound. */
  private persistRenderPreferences(): void {
    writeRenderPreferences(captureRenderPreferences(this.engine.world()));
  }

  readonly presentationMode = computed(() => {
    this.engine.epoch();
    return this.engine.world().resources.PresentationMode;
  });

  readonly isEditMode = computed(() => this.presentationMode() === 'edit');

  readonly quality = computed((): QualityPresetSelection => {
    this.engine.epoch();
    return this.engine.world().resources.Quality.overallPreset;
  });

  /** Full Quality resource for the render-settings modal. */
  readonly qualitySettings = computed((): Quality => {
    this.engine.epoch();
    return this.engine.world().resources.Quality;
  });

  readonly antiAliasing = computed(() => {
    this.engine.epoch();
    return this.engine.world().resources.Quality.antiAliasing;
  });

  readonly theatricalGlow = computed(() => {
    this.engine.epoch();
    return this.engine.world().resources.Quality.theatricalGlow;
  });

  readonly lensFlare = computed(() => {
    this.engine.epoch();
    return this.engine.world().resources.Quality.lensFlare;
  });

  readonly tonemapMode = computed(() => {
    this.engine.epoch();
    return this.engine.world().resources.Quality.tonemapMode;
  });

  readonly shadowQuality = computed(() => {
    this.engine.epoch();
    return this.engine.world().resources.Quality.shadowQuality;
  });

  private skyPresetSelection(): QualityPresetSelection {
    return this.engine.world().resources.Atmosphere.qualityPreset;
  }

  private withSkyRefresh(q: Quality): Quality {
    return refreshQualityPresets(q, this.skyPresetSelection());
  }

  setPresentation(mode: PresentationMode): void {
    this.engine.mutate((world) => {
      world.resources.PresentationMode = mode;

    });
    this.engine.getHost()?.applyPresentationMode();
  }

  /** Global graphics preset — aligns volumetrics, shadow, presentation, skybox, and global sun. */
  setQuality(preset: QualityLadder): void {
    this.engine.mutate((world) => {
      const prev = world.resources.Quality;
      world.resources.Quality = createQuality(preset, {
        colorProfile: prev.colorProfile,
        outputGamma: prev.outputGamma,
        lensFlareOptics: prev.lensFlareOptics,
        lensFlareLights: prev.lensFlareLights,
        lensFlareSun: prev.lensFlareSun,
      });
      world.resources.Atmosphere = createAtmosphereSettingsForQuality(
        preset,
        {
          ...world.resources.Atmosphere,
          skyboxHdrColors: prev.colorProfile === 'hdr',
        },
      );
      world.resources.GlobalSunVolumetrics = createGlobalSunVolumetricsForQuality(
        preset,
        world.resources.GlobalSunVolumetrics,
      );

    });
    this.persistRenderPreferences();
    this.engine.getHost()?.applyQualitySettings();
  }

  setVolumetricsPreset(preset: QualityLadder): void {
    this.engine.mutate((world) => {
      world.resources.Quality = applyVolumetricsPreset(
        world.resources.Quality,
        preset,
        world.resources.Atmosphere.qualityPreset,
      );

    });
    this.persistRenderPreferences();
    this.engine.getHost()?.applyQualitySettings();
  }

  setFluidsPreset(preset: QualityLadder): void {
    this.engine.mutate((world) => {
      world.resources.Quality = applyFluidsPreset(
        world.resources.Quality,
        preset,
        world.resources.Atmosphere.qualityPreset,
      );
    });
    this.persistRenderPreferences();
    this.engine.getHost()?.applyQualitySettings();
  }

  setShadowPreset(preset: QualityLadder): void {
    this.engine.mutate((world) => {
      world.resources.Quality = applyShadowPreset(
        world.resources.Quality,
        preset,
        world.resources.Atmosphere.qualityPreset,
      );

    });
    this.persistRenderPreferences();
    this.engine.getHost()?.applyQualitySettings();
  }

  setPresentationPreset(preset: QualityLadder): void {
    this.engine.mutate((world) => {
      world.resources.Quality = applyPresentationPreset(
        world.resources.Quality,
        preset,
        world.resources.Atmosphere.qualityPreset,
      );

    });
    this.persistRenderPreferences();
    this.engine.getHost()?.applyQualitySettings();
  }

  /** Patch individual render settings; section + overall become Custom when they diverge. */
  patchQuality(partial: Partial<Quality>): void {
    this.engine.mutate((world) => {
      const cur = world.resources.Quality;
      const next: Quality = { ...cur, ...partial };
      if (partial.shadowQuality !== undefined) {
        next.shadowQuality = normalizeShadowQuality(partial.shadowQuality);
      }
      if (typeof partial.renderScale === 'number') {
        next.renderScale = clampRenderScale(partial.renderScale);
      }
      if (typeof partial.stepSize === 'number') {
        next.stepSize = Math.max(0.02, partial.stepSize);
      }
      if (typeof partial.maxSteps === 'number') {
        next.maxSteps = Math.round(clampRange(partial.maxSteps, 16, 512));
      }
      if (typeof partial.densityThreshold === 'number') {
        next.densityThreshold = Math.max(0, partial.densityThreshold);
      }
      if (typeof partial.transmittanceCut === 'number') {
        next.transmittanceCut = clamp01(partial.transmittanceCut);
      }
      if (partial.colorProfile !== undefined) {
        next.colorProfile = normalizeColorProfile(partial.colorProfile);
      }
      if (partial.outputGamma !== undefined) {
        next.outputGamma = clampOutputGamma(partial.outputGamma);
      }
      if (partial.tonemapMode !== undefined) {
        next.tonemapMode = normalizeTonemapMode(partial.tonemapMode);
      }
      if (partial.lensFlareOptics !== undefined) {
        next.lensFlareOptics = normalizeLensFlareOptics(
          partial.lensFlareOptics,
          cur.lensFlareOptics ?? defaultLensFlareOptics(),
        );
      }
      if (partial.lensFlareLights !== undefined) {
        next.lensFlareLights = normalizeLensFlareGroupTune(
          partial.lensFlareLights,
          cur.lensFlareLights ?? defaultLensFlareLightsTune(),
        );
      }
      if (partial.lensFlareSun !== undefined) {
        next.lensFlareSun = normalizeLensFlareGroupTune(
          partial.lensFlareSun,
          cur.lensFlareSun ?? defaultLensFlareSunTune(),
        );
      }
      if (partial.fluidGridRes !== undefined) {
        next.fluidGridRes = normalizeFluidGridResQuality(partial.fluidGridRes);
      }
      if (typeof partial.fluidJacobiIterations === 'number') {
        next.fluidJacobiIterations = clampFluidJacobiIterations(partial.fluidJacobiIterations);
      }
      if (partial.fluidAdvectionMode !== undefined) {
        next.fluidAdvectionMode = normalizeFluidAdvectionMode(partial.fluidAdvectionMode);
      }
      if (partial.fluidVorticityMode !== undefined) {
        next.fluidVorticityMode = normalizeFluidVorticityMode(partial.fluidVorticityMode);
      }
      if (typeof partial.fluidDissipation === 'number') {
        next.fluidDissipation = clampRange(partial.fluidDissipation, 0, 1);
      }
      if (typeof partial.fluidEnableRefraction === 'boolean') {
        next.fluidEnableRefraction = partial.fluidEnableRefraction;
      }
      if (typeof partial.fluidMaxSurfaceBounces === 'number') {
        next.fluidMaxSurfaceBounces = clampFluidMaxSurfaceBounces(
          partial.fluidMaxSurfaceBounces,
        );
      }
      if (typeof partial.fluidSurfaceSamples === 'number') {
        next.fluidSurfaceSamples = clampFluidSurfaceSamples(partial.fluidSurfaceSamples);
      }
      world.resources.Quality = this.withSkyRefresh(next);
      // Sky HDR emission follows display profile (Unity Camera.allowHDR semantics).
      if (partial.colorProfile !== undefined) {
        world.resources.Atmosphere = {
          ...world.resources.Atmosphere,
          skyboxHdrColors: next.colorProfile === 'hdr',
        };
      }

    });
    this.persistRenderPreferences();
    this.engine.getHost()?.applyQualitySettings();
  }

  setShadowQuality(shadowQuality: ShadowQuality): void {
    this.patchQuality({ shadowQuality: normalizeShadowQuality(shadowQuality) });
  }

  setAntiAliasing(enabled: boolean): void {
    this.patchQuality({ antiAliasing: enabled });
  }

  setTheatricalGlow(enabled: boolean): void {
    this.patchQuality({ theatricalGlow: enabled });
  }

  setLensFlare(enabled: boolean): void {
    this.patchQuality({ lensFlare: enabled });
  }

  patchLensFlareLights(partial: Partial<LensFlareGroupTune>): void {
    const cur = this.engine.world().resources.Quality.lensFlareLights;
    this.patchQuality({
      lensFlareLights: { ...cur, ...partial },
    });
  }

  patchLensFlareSun(partial: Partial<LensFlareGroupTune>): void {
    const cur = this.engine.world().resources.Quality.lensFlareSun;
    this.patchQuality({
      lensFlareSun: { ...cur, ...partial },
    });
  }

  patchLensFlareOptics(
    partial: Partial<Omit<LensFlareOptics, 'elements'>> & {
      elements?: LensFlareElement[];
    },
  ): void {
    const cur = this.engine.world().resources.Quality.lensFlareOptics ?? defaultLensFlareOptics();
    this.patchQuality({
      lensFlareOptics: {
        chromatic: partial.chromatic ?? cur.chromatic,
        dirt: partial.dirt ?? cur.dirt,
        elements: partial.elements ?? cur.elements,
      },
    });
  }

  addLensFlareElement(kind: LensFlareElementKind = 'ghost'): void {
    const cur = this.engine.world().resources.Quality.lensFlareOptics ?? defaultLensFlareOptics();
    if (cur.elements.length >= MAX_FLARE_ELEMENTS) return;
    this.patchLensFlareOptics({
      elements: [...cur.elements, createLensFlareElement(kind)],
    });
  }

  removeLensFlareElement(index: number): void {
    const cur = this.engine.world().resources.Quality.lensFlareOptics ?? defaultLensFlareOptics();
    if (index < 0 || index >= cur.elements.length) return;
    this.patchLensFlareOptics({
      elements: cur.elements.filter((_, i) => i !== index),
    });
  }

  patchLensFlareElement(index: number, partial: Partial<LensFlareElement>): void {
    const cur = this.engine.world().resources.Quality.lensFlareOptics ?? defaultLensFlareOptics();
    if (index < 0 || index >= cur.elements.length) return;
    const next = cur.elements.map((el, i) =>
      i === index ? normalizeLensFlareElement({ ...el, ...partial }, el) : el,
    );
    this.patchLensFlareOptics({ elements: next });
  }

  moveLensFlareElement(from: number, to: number): void {
    const cur = this.engine.world().resources.Quality.lensFlareOptics ?? defaultLensFlareOptics();
    if (
      from < 0 ||
      to < 0 ||
      from >= cur.elements.length ||
      to >= cur.elements.length ||
      from === to
    ) {
      return;
    }
    const next = [...cur.elements];
    const [item] = next.splice(from, 1);
    if (!item) return;
    next.splice(to, 0, item);
    this.patchLensFlareOptics({ elements: next });
  }

  setTonemapMode(mode: TonemapMode): void {
    this.patchQuality({ tonemapMode: normalizeTonemapMode(mode) });
  }

  setColorProfile(profile: ColorProfile): void {
    this.patchQuality({ colorProfile: normalizeColorProfile(profile) });
  }

  setOutputGamma(gamma: number): void {
    this.patchQuality({ outputGamma: clampOutputGamma(gamma) });
  }

  readonly displayVision = computed(() => {
    this.engine.epoch();
    return this.engine.world().resources.DisplayVision;
  });

  readonly responseCurve = computed(() => this.displayVision().responseCurve);

  readonly activeObserverId = computed(() => this.displayVision().activeObserverId);

  readonly debugViewMode = computed(() => this.displayVision().debugViewMode);

  readonly coneFatigue = computed(() => this.displayVision().coneFatigue);

  readonly ambientLevel = computed(() => {
    this.engine.epoch();
    return this.engine.world().resources.EnvironmentLighting.ambientLevel;
  });

  readonly sceneList = this.scenes.scenes;
  readonly activeSceneId = this.scenes.activeId;

  readonly activeSceneLabel = computed(() => {
    this.engine.epoch();
    return this.engine.world().resources.ActiveScene.label;
  });

  setAmbientLevel(ambientLevel: number): void {
    this.engine.mutate((world) => {
      world.resources.EnvironmentLighting = normalizeEnvironmentLighting({
        ...world.resources.EnvironmentLighting,
        ambientLevel,
      });

    });
  }

  readonly gravityEnvironment = computed(() => {
    this.engine.epoch();
    return this.engine.world().resources.GravityEnvironment;
  });

  readonly windEnvironment = computed(() => {
    this.engine.epoch();
    return this.engine.world().resources.WindEnvironment;
  });

  readonly globalSunVolumetrics = computed(() => {
    this.engine.epoch();
    return this.engine.world().resources.GlobalSunVolumetrics;
  });

  patchGravityEnvironment(partial: Partial<GravityEnvironment>): void {
    this.engine.mutate((world) => {
      world.resources.GravityEnvironment = normalizeGravityEnvironment({
        ...world.resources.GravityEnvironment,
        ...partial,
      });
    });
  }

  patchWindEnvironment(partial: Partial<WindEnvironment>): void {
    this.engine.mutate((world) => {
      world.resources.WindEnvironment = normalizeWindEnvironment({
        ...world.resources.WindEnvironment,
        ...partial,
      });
    });
  }

  setGlobalSunVolumetricsEnabled(enabled: boolean): void {
    this.patchGlobalSunVolumetrics({ enabled });
  }

  setGlobalSunLookPreset(preset: Exclude<GlobalSunLookPresetId, 'custom'>): void {
    this.engine.mutate((world) => {
      world.resources.GlobalSunVolumetrics = applyGlobalSunLookPreset(
        world.resources.GlobalSunVolumetrics,
        preset,
      );
    });
    this.persistRenderPreferences();
  }

  setGlobalSunQualityPreset(preset: QualityLadder): void {
    this.engine.mutate((world) => {
      world.resources.GlobalSunVolumetrics = applyGlobalSunQualityPreset(
        world.resources.GlobalSunVolumetrics,
        preset,
      );
    });
    this.persistRenderPreferences();
    this.engine.getHost()?.applyQualitySettings();
  }

  patchGlobalSunVolumetrics(partial: Partial<GlobalSunVolumetrics>): void {
    this.engine.mutate((world) => {
      world.resources.GlobalSunVolumetrics = normalizeGlobalSunVolumetrics({
        ...world.resources.GlobalSunVolumetrics,
        ...partial,
      });
    });
    this.persistRenderPreferences();
  }

  readonly atmosphere = computed(() => {
    this.engine.epoch();
    this.engine.atmosphereRevision();
    return this.engine.world().resources.Atmosphere;
  });

  setAtmosphereEnabled(enabled: boolean): void {
    this.engine.mutate((world) => {
      world.resources.Atmosphere = normalizeAtmosphereSettings({
        ...world.resources.Atmosphere,
        enabled,
      });
      if (enabled) {
        syncPrimarySunFromAtmosphere(world);
      }

    });
    this.persistRenderPreferences();
  }

  patchAtmosphere(partial: Partial<AtmosphereSettings>): void {
    this.engine.mutate((world) => {
      world.resources.Atmosphere = normalizeAtmosphereSettings({
        ...world.resources.Atmosphere,
        ...partial,
      });
      world.resources.Quality = refreshQualityPresets(
        world.resources.Quality,
        world.resources.Atmosphere.qualityPreset,
      );
      if (world.resources.Atmosphere.enabled) {
        syncPrimarySunFromAtmosphere(world);
      }

    });
    this.persistRenderPreferences();
  }

  setAtmosphereQuality(preset: QualityLadder): void {
    this.engine.mutate((world) => {
      world.resources.Atmosphere = createAtmosphereSettingsForQuality(
        preset,
        world.resources.Atmosphere,
      );
      world.resources.Quality = refreshQualityPresets(
        world.resources.Quality,
        world.resources.Atmosphere.qualityPreset,
      );
      this.syncSunIfAtmosphere(world);

    });
    this.persistRenderPreferences();
    this.engine.getHost()?.applyQualitySettings();
  }

  /** Decimal hour-of-day [0, 24) for the time-of-day slider. */
  setAtmosphereTimeOfDay(hourOfDay: number): void {
    this.engine.mutate((world) => {
      world.resources.Atmosphere = atmosphereWithTimeOfDay(
        world.resources.Atmosphere,
        hourOfDay,
      );
      this.syncSunIfAtmosphere(world);
    });
  }

  setAtmosphereTimePreset(id: AtmosphereTimePresetId): void {
    this.engine.mutate((world) => {
      world.resources.Atmosphere = atmosphereWithTimePreset(
        world.resources.Atmosphere,
        id,
      );
      this.syncSunIfAtmosphere(world);
    });
  }

  setAtmosphereSeasonPreset(id: AtmosphereSeasonPresetId): void {
    this.engine.mutate((world) => {
      world.resources.Atmosphere = atmosphereWithSeasonPreset(
        world.resources.Atmosphere,
        id,
      );
      this.syncSunIfAtmosphere(world);
    });
  }

  setAtmosphereTimeAnimating(animating: boolean): void {
    this.engine.mutate((world) => {
      world.resources.Atmosphere = normalizeAtmosphereSettings({
        ...world.resources.Atmosphere,
        timeAnimating: animating,
      });
    });
  }

  setAtmosphereNow(): void {
    this.engine.mutate((world) => {
      world.resources.Atmosphere = atmosphereWithUtcMs(
        world.resources.Atmosphere,
        Date.now(),
      );
      this.syncSunIfAtmosphere(world);
    });
  }

  private syncSunIfAtmosphere(world: World): void {
    if (world.resources.Atmosphere.enabled) {
      syncPrimarySunFromAtmosphere(world);
    }
  }

  setResponseCurve(curve: DisplayResponseCurve): void {
    this.engine.mutate((world) => {
      world.resources.DisplayVision = normalizeDisplayVision({
        ...world.resources.DisplayVision,
        responseCurve: normalizeDisplayResponseCurve(curve),
      });

    });
  }

  resetResponseCurve(): void {
    this.setResponseCurve(createDefaultDisplayResponseCurve());
  }

  setActiveObserverId(id: ObserverId): void {
    this.engine.mutate((world) => {
      world.resources.DisplayVision = normalizeDisplayVision({
        ...world.resources.DisplayVision,
        activeObserverId: id,
      });
    });
  }

  setDebugViewMode(mode: DebugViewMode): void {
    this.engine.mutate((world) => {
      world.resources.DisplayVision = normalizeDisplayVision({
        ...world.resources.DisplayVision,
        debugViewMode: mode,
      });
    });
  }

  setConeFatigue(partial: Partial<ConeFatigueSettings>): void {
    this.engine.mutate((world) => {
      world.resources.DisplayVision = normalizeDisplayVision({
        ...world.resources.DisplayVision,
        coneFatigue: {
          ...world.resources.DisplayVision.coneFatigue,
          ...partial,
        },
      });
    });
  }

  /** Persist current world into the browser scene library (overwrite or create). */
  saveToLibrary(opts?: { id?: string | null; label?: string; asNew?: boolean }): void {
    const world = this.engine.world();
    this.scenes.saveWorld(world, opts);
    this.engine.tickEpoch();
  }

  loadFromLibrary(id: string): boolean {
    const world = this.scenes.loadWorld(id);
    if (!world) return false;
    this.engine.replaceWorld(world);
    return true;
  }

  deleteFromLibrary(id: string): void {
    const wasActive = this.scenes.activeId() === id;
    this.scenes.delete(id);
    if (wasActive) {
      this.engine.replaceWorld(createEmptyWorldWithPreferences());
    }
  }

  renameInLibrary(id: string, label: string): void {
    this.scenes.rename(id, label);
    if (this.scenes.activeId() === id) {
      this.engine.mutate((world) => {
        world.resources.ActiveScene = { sceneId: id, label: label.trim() || label };
      });
    }
  }

  /** Download current scene as JSON file (export). */
  exportSceneFile(filename?: string): void {
    const world = this.engine.world();
    const name = filename ?? sanitizeSceneFilename(world.resources.ActiveScene.label);
    downloadSceneJson(world, name);
  }

  async importSceneFile(file: File, opts?: { alsoSaveToLibrary?: boolean }): Promise<void> {
    const text = await readFileAsText(file);
    let world = documentToWorld(text);
    world = applyRenderPreferences(world, readRenderPreferences(), {
      preserveSceneTimeOfDay: true,
    });
    const label =
      world.resources.ActiveScene.label?.trim() ||
      file.name.replace(/\.json$/i, '') ||
      'Importált jelenet';
    if (opts?.alsoSaveToLibrary !== false) {
      this.scenes.saveWorld(world, { asNew: true, label });
    }
    this.engine.replaceWorld(world);
  }

  resetDemo(): void {
    this.scenes.clearActive();
    this.engine.replaceWorld(createDemoWorldWithPreferences());
  }

  /** Load a fresh empty scene (floor + sun); clears library active id. */
  newEmptyScene(): void {
    this.scenes.clearActive();
    this.engine.replaceWorld(createEmptyWorldWithPreferences());
  }

  screenshot(): void {
    const prev = this.engine.world().resources.PresentationMode;
    this.setPresentation('photo');
    requestAnimationFrame(() => {
      this.engine.screenshot();
      this.setPresentation(prev);
    });
  }
}
