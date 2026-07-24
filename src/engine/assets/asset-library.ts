import {
  loadAssetManifest,
  modelAssetUrl,
  textureAssetUrl,
  warnMissingOnce,
  type AssetManifest,
  type ModelManifestEntry,
  type SkyboxManifestEntry,
  type TextureManifestEntry,
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
 * Consumers resolve by id only — never hardcode `/assets` paths in adapters/UI.
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

  /** Loaded asset manifest (models / skyboxes / textures), or null before {@link load}. */
  getManifest(): AssetManifest | null {
    return this.assetManifest;
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

  /** Resolved face / photodome texture URLs for a skybox id. */
  getSkyboxUrls(id: string): string[] | null {
    const entry = this.getSkybox(id);
    if (!entry) return null;
    if (entry.type === 'cubemap') {
      return entry.faces.map((p) => resolveAssetUrl(p, RuntimePaths.assetsBase));
    }
    return entry.textures.map((p) => resolveAssetUrl(p, RuntimePaths.assetsBase));
  }

  listTextureIds(): string[] {
    return Object.keys(this.assetManifest?.textures ?? {});
  }

  /** Texture ids filtered by optional manifest `usage` (e.g. equirect / sprite). */
  listTextureIdsByUsage(usage: string): string[] {
    const textures = this.assetManifest?.textures ?? {};
    return Object.keys(textures).filter((id) => textures[id]?.usage === usage);
  }

  getTexture(id: string): TextureManifestEntry | undefined {
    const entry = this.assetManifest?.textures[id];
    if (!entry) warnMissingOnce(`texture:${id}`);
    return entry;
  }

  getTextureUrl(id: string): string | null {
    const entry = this.getTexture(id);
    if (!entry) return null;
    return textureAssetUrl(entry, RuntimePaths.assetsBase);
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
