import { Injectable, computed, inject } from '@angular/core';
import {
  createDemoWorld,
  createDefaultDisplayResponseCurve,
  createQuality,
  normalizeDisplayResponseCurve,
  normalizeDisplayVision,
  normalizeEnvironmentLighting,
  type DisplayResponseCurve,
  type PresentationMode,
  type QualityPreset,
} from '../../../engine';
import {
  documentToWorld,
  downloadSceneJson,
  readFileAsText,
  sanitizeSceneFilename,
} from '../../../platform/persistence';
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

  readonly quality = computed(() => {
    this.engine.epoch();
    return this.engine.world().resources.Quality.preset;
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

  setPresentation(mode: PresentationMode): void {
    this.engine.mutate((world) => {
      world.resources.PresentationMode = mode;
      world.bump();
    });
    this.engine.getHost()?.applyPresentationMode();
  }

  setQuality(preset: QualityPreset): void {
    this.engine.mutate((world) => {
      const prev = world.resources.Quality;
      world.resources.Quality = {
        ...createQuality(preset),
        antiAliasing: prev.antiAliasing,
        theatricalGlow: prev.theatricalGlow,
        tonemapMode: prev.tonemapMode,
      };
      world.bump();
    });
    this.engine.getHost()?.applyQualitySettings();
  }

  setAntiAliasing(enabled: boolean): void {
    this.engine.mutate((world) => {
      world.resources.Quality = { ...world.resources.Quality, antiAliasing: enabled };
      world.bump();
    });
    this.engine.getHost()?.applyQualitySettings();
  }

  setTheatricalGlow(enabled: boolean): void {
    this.engine.mutate((world) => {
      world.resources.Quality = { ...world.resources.Quality, theatricalGlow: enabled };
      world.bump();
    });
  }

  setTonemapMode(mode: 'aces' | 'reinhard'): void {
    this.engine.mutate((world) => {
      world.resources.Quality = { ...world.resources.Quality, tonemapMode: mode };
      world.bump();
    });
  }

  setAmbientLevel(ambientLevel: number): void {
    this.engine.mutate((world) => {
      world.resources.EnvironmentLighting = normalizeEnvironmentLighting({
        ...world.resources.EnvironmentLighting,
        ambientLevel,
      });
      world.bump();
    });
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
