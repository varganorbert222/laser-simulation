import {
  loadAssetManifest,
  modelAssetUrl,
  warnMissingOnce,
  type AssetManifest,
  type ModelManifestEntry,
  type SkyboxManifestEntry,
} from './asset-manifest';
import {
  loadAudioLibraries,
  loadAudioManifest,
} from './audio-library-loader';
import type {
  AudioLibraryDef,
  AudioManifest,
  MusicEntry,
  MusicSetDef,
  ResolvedAudioClip,
} from './audio-types';
import { RuntimePaths, resolveAssetUrl } from './runtime-paths';
import { loadSfxRegistry } from './sfx-registry';

/**
 * Rogue-leader-style asset library: JSON catalogs under `/data`, binaries under `/assets`.
 */
export class AssetLibrary {
  private assetManifest: AssetManifest | null = null;
  private audioManifest: AudioManifest | null = null;
  private libraries = new Map<string, AudioLibraryDef>();
  private clips = new Map<string, ResolvedAudioClip>();
  private loaded = false;

  get isLoaded(): boolean {
    return this.loaded;
  }

  async load(
    paths: {
      assetManifest?: string;
      audioManifest?: string;
      audioConfigBase?: string;
      assetsBase?: string;
    } = {},
  ): Promise<void> {
    const assetManifestUrl = paths.assetManifest ?? RuntimePaths.assetManifest;
    const audioManifestUrl = paths.audioManifest ?? RuntimePaths.audioManifest;
    const audioConfigBase = paths.audioConfigBase ?? RuntimePaths.audioConfigBase;
    const assetsBase = paths.assetsBase ?? RuntimePaths.assetsBase;

    this.assetManifest = await loadAssetManifest(assetManifestUrl);
    this.audioManifest = await loadAudioManifest(audioManifestUrl);
    const registry = await loadSfxRegistry(audioConfigBase);
    const { libraries, clips } = await loadAudioLibraries(
      this.audioManifest,
      audioConfigBase,
      assetsBase,
      registry,
    );
    this.libraries = libraries;
    this.clips = clips;
    this.loaded = true;
  }

  assetUrl(relativePath: string): string {
    return resolveAssetUrl(relativePath, RuntimePaths.assetsBase);
  }

  listModelIds(): string[] {
    return Object.keys(this.assetManifest?.models ?? {});
  }

  getModel(id: string): ModelManifestEntry | undefined {
    const entry = this.assetManifest?.models[id];
    if (!entry) warnMissingOnce(`model:${id}`);
    return entry;
  }

  getModelUrl(id: string): string | null {
    const entry = this.getModel(id);
    if (!entry) return null;
    return modelAssetUrl(entry, RuntimePaths.assetsBase);
  }

  listSkyboxIds(): string[] {
    return Object.keys(this.assetManifest?.skyboxes ?? {});
  }

  getSkybox(id: string): SkyboxManifestEntry | undefined {
    const entry = this.assetManifest?.skyboxes[id];
    if (!entry) warnMissingOnce(`skybox:${id}`);
    return entry;
  }

  listClipIds(): string[] {
    return [...this.clips.keys()];
  }

  getClip(id: string): ResolvedAudioClip | undefined {
    return this.clips.get(id);
  }

  listMusicIds(): string[] {
    return Object.keys(this.audioManifest?.music ?? {});
  }

  getMusic(id: string): MusicEntry | undefined {
    return this.audioManifest?.music[id];
  }

  getMusicUrl(id: string): string | null {
    const entry = this.getMusic(id);
    if (!entry) return null;
    return resolveAssetUrl(entry.path, RuntimePaths.assetsBase);
  }

  listMusicSetIds(): string[] {
    return Object.keys(this.audioManifest?.musicSets ?? {});
  }

  getMusicSet(id: string): MusicSetDef | undefined {
    return this.audioManifest?.musicSets?.[id];
  }

  listLibraryIds(): string[] {
    return [...this.libraries.keys()];
  }

  getLibrary(id: string): AudioLibraryDef | undefined {
    return this.libraries.get(id);
  }
}

/** Shared boot-time library instance. */
export const studioAssets = new AssetLibrary();
