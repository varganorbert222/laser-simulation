/**
 * Static skybox from AssetLibrary skybox ids (photodome / cubemap).
 * Active when procedural atmosphere is disabled and `skyboxAssetId` is set.
 */
import {
  CubeTexture,
  PhotoDome,
  type BaseTexture,
  type Scene,
} from '@babylonjs/core';
import '@babylonjs/core/Materials/Textures/cubeTexture.js';
import { studioAssets, type SkyboxManifestEntry } from '@engine';

export class StaticSkybox {
  private assetId: string | null = null;
  private dome: PhotoDome | null = null;
  private cube: CubeTexture | null = null;
  private ownedEnv = false;

  constructor(private readonly scene: Scene) {}

  /**
   * Sync static sky to the given catalog id.
   * Pass `null` / empty to clear. No-op when id unchanged and still loaded.
   */
  sync(skyboxAssetId: string | null): void {
    const id = skyboxAssetId?.trim() || null;
    if (id === this.assetId && (this.dome || this.cube)) return;
    this.clear();
    this.assetId = id;
    if (!id) return;

    const entry = studioAssets.getSkybox(id);
    if (!entry) return;

    if (entry.type === 'photodome') {
      this.loadPhotodome(id, entry);
    } else {
      this.loadCubemap(id, entry);
    }
  }

  /** Environment cubemap for IBL when static sky owns one; else null. */
  get environmentTexture(): BaseTexture | null {
    return this.cube;
  }

  clear(): void {
    if (this.ownedEnv && this.scene.environmentTexture === this.cube) {
      this.scene.environmentTexture = null;
    }
    this.ownedEnv = false;
    this.dome?.dispose();
    this.dome = null;
    this.cube?.dispose();
    this.cube = null;
    this.assetId = null;
  }

  dispose(): void {
    this.clear();
  }

  private loadPhotodome(id: string, entry: Extract<SkyboxManifestEntry, { type: 'photodome' }>): void {
    const urls = studioAssets.getSkyboxUrls(id);
    const url = urls?.[0];
    if (!url) return;
    this.dome = new PhotoDome(
      `staticSky_${id}`,
      url,
      {
        resolution: entry.resolution ?? 32,
        size: entry.size ?? 1000,
        useDirectMapping: entry.useDirectMapping ?? false,
      },
      this.scene,
    );
    this.dome.mesh.isPickable = false;
  }

  private loadCubemap(id: string, entry: Extract<SkyboxManifestEntry, { type: 'cubemap' }>): void {
    const urls = studioAssets.getSkyboxUrls(id);
    if (!urls || urls.length < 6) return;
    // faces order in manifest: +X -X +Y -Y +Z -Z (Babylon CreateFromImages expects same).
    void entry;
    this.cube = CubeTexture.CreateFromImages(urls, this.scene);
    this.cube.name = `staticSkyCube_${id}`;
    this.scene.environmentTexture = this.cube;
    this.ownedEnv = true;
  }
}
