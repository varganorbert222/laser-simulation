import { Injectable, computed, inject } from '@angular/core';
import {
  createDemoWorld,
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
  atmosphereWithTimeOfDay,
  atmosphereWithTimePreset,
  atmosphereWithSeasonPreset,
  atmosphereWithUtcMs,
  syncPrimarySunFromAtmosphere,
  normalizeShadowQuality,
  normalizeColorProfile,
  clampOutputGamma,
  normalizeTonemapMode,
  applyVolumetricsPreset,
  applyShadowPreset,
  applyPresentationPreset,
  refreshQualityPresets,
  type AtmosphereSeasonPresetId,
  type AtmosphereSettings,
  type AtmosphereTimePresetId,
  type ColorProfile,
  type TonemapMode,
  type DisplayResponseCurve,
  type PresentationMode,
  type Quality,
  type QualityLadder,
  type QualityPresetSelection,
  type ShadowQuality,
  type World,
} from '@engine';
import {
  documentToWorld,
  downloadSceneJson,
  readFileAsText,
  sanitizeSceneFilename,
} from '@platform/persistence';
import { EngineHostService } from '../services/engine-host.service';
import { SceneLibraryService } from './scene-library.service';

@Injectable({ providedIn: 'root' })
export class SessionService {
  private readonly engine = inject(EngineHostService);
  private readonly scenes = inject(SceneLibraryService);

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
      world.bump();
    });
    this.engine.getHost()?.applyPresentationMode();
  }

  /** Global graphics preset — aligns volumetrics, shadow, presentation, and skybox. */
  setQuality(preset: QualityLadder): void {
    this.engine.mutate((world) => {
      const prev = world.resources.Quality;
      world.resources.Quality = createQuality(preset, {
        colorProfile: prev.colorProfile,
        outputGamma: prev.outputGamma,
      });
      world.resources.Atmosphere = createAtmosphereSettingsForQuality(
        preset,
        {
          ...world.resources.Atmosphere,
          skyboxHdrColors: prev.colorProfile === 'hdr',
        },
      );
      world.bump();
    });
    this.engine.getHost()?.applyQualitySettings();
  }

  setVolumetricsPreset(preset: QualityLadder): void {
    this.engine.mutate((world) => {
      world.resources.Quality = applyVolumetricsPreset(
        world.resources.Quality,
        preset,
        world.resources.Atmosphere.qualityPreset,
      );
      world.bump();
    });
    this.engine.getHost()?.applyQualitySettings();
  }

  setShadowPreset(preset: QualityLadder): void {
    this.engine.mutate((world) => {
      world.resources.Quality = applyShadowPreset(
        world.resources.Quality,
        preset,
        world.resources.Atmosphere.qualityPreset,
      );
      world.bump();
    });
    this.engine.getHost()?.applyQualitySettings();
  }

  setPresentationPreset(preset: QualityLadder): void {
    this.engine.mutate((world) => {
      world.resources.Quality = applyPresentationPreset(
        world.resources.Quality,
        preset,
        world.resources.Atmosphere.qualityPreset,
      );
      world.bump();
    });
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
      world.resources.Quality = this.withSkyRefresh(next);
      // Sky HDR emission follows display profile (Unity Camera.allowHDR semantics).
      if (partial.colorProfile !== undefined) {
        world.resources.Atmosphere = {
          ...world.resources.Atmosphere,
          skyboxHdrColors: next.colorProfile === 'hdr',
        };
      }
      world.bump();
    });
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
      world.bump();
    });
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
      world.bump();
    });
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
      world.bump();
    });
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
      world.bump();
    });
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
      world.bump();
    });
  }

  setAtmosphereTimePreset(id: AtmosphereTimePresetId): void {
    this.engine.mutate((world) => {
      world.resources.Atmosphere = atmosphereWithTimePreset(
        world.resources.Atmosphere,
        id,
      );
      this.syncSunIfAtmosphere(world);
      world.bump();
    });
  }

  setAtmosphereSeasonPreset(id: AtmosphereSeasonPresetId): void {
    this.engine.mutate((world) => {
      world.resources.Atmosphere = atmosphereWithSeasonPreset(
        world.resources.Atmosphere,
        id,
      );
      this.syncSunIfAtmosphere(world);
      world.bump();
    });
  }

  setAtmosphereTimeAnimating(animating: boolean): void {
    this.patchAtmosphere({ timeAnimating: animating });
  }

  setAtmosphereNow(): void {
    this.engine.mutate((world) => {
      world.resources.Atmosphere = atmosphereWithUtcMs(
        world.resources.Atmosphere,
        Date.now(),
      );
      this.syncSunIfAtmosphere(world);
      world.bump();
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
      world.bump();
    });
  }

  resetResponseCurve(): void {
    this.setResponseCurve(createDefaultDisplayResponseCurve());
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
      this.engine.replaceWorld(createDemoWorld());
    }
  }

  renameInLibrary(id: string, label: string): void {
    this.scenes.rename(id, label);
    if (this.scenes.activeId() === id) {
      this.engine.mutate((world) => {
        world.resources.ActiveScene = { sceneId: id, label: label.trim() || label };
        world.bump();
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
    const world = documentToWorld(text);
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
    this.engine.replaceWorld(createDemoWorld());
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
