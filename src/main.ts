import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';
import {
  configureQualityRenderScale,
  studioAssets,
} from './engine';

async function loadQualityConfig(): Promise<void> {
  try {
    const res = await fetch('/catalog/quality.json', { cache: 'no-cache' });
    if (!res.ok) return;
    const json = (await res.json()) as {
      renderScaleMin?: number;
      renderScaleMax?: number;
    };
    configureQualityRenderScale(json);
  } catch {
    // Defaults from engine/render/quality.ts apply.
  }
}

async function loadAssetLibrary(): Promise<void> {
  try {
    await studioAssets.load();
  } catch (err) {
    console.warn('[Assets] library load failed — catalogs unavailable until retry', err);
  }
}

Promise.all([loadQualityConfig(), loadAssetLibrary()])
  .then(() => bootstrapApplication(AppComponent, appConfig))
  .catch((err) => console.error(err));
