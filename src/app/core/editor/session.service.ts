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
} from '../../../platform/persistence';
import { EngineHostService } from '../services/engine-host.service';

@Injectable({ providedIn: 'root' })
export class SessionService {
  private readonly engine = inject(EngineHostService);

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

  readonly displayVision = computed(() => {
    this.engine.epoch();
    return this.engine.world().resources.DisplayVision;
  });

  readonly responseCurve = computed(() => this.displayVision().responseCurve);

  readonly ambientLevel = computed(() => {
    this.engine.epoch();
    return this.engine.world().resources.EnvironmentLighting.ambientLevel;
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
      const antiAliasing = world.resources.Quality.antiAliasing;
      world.resources.Quality = { ...createQuality(preset), antiAliasing };
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

  saveScene(filename = 'light-studio-scene.json'): void {
    downloadSceneJson(this.engine.world(), filename);
  }

  async loadSceneFile(file: File): Promise<void> {
    const text = await readFileAsText(file);
    this.engine.replaceWorld(documentToWorld(text));
  }

  resetDemo(): void {
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
