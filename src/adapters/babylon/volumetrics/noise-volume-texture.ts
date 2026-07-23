import {
  RawTexture,
  RawTexture3D,
  type BaseTexture,
  type Scene,
} from '@babylonjs/core';
import { Constants } from '@babylonjs/core/Engines/constants';
import type { BakedNoiseVolume } from '@engine';

export type NoiseGpuKind = 0 | 2 | 3;

export interface NoiseGpuBinding {
  kind: NoiseGpuKind;
  tex2D: BaseTexture;
  tex3D: BaseTexture;
}

interface CachedGpu {
  fingerprint: string;
  dimension: '2d' | '3d';
  tex2D: RawTexture | null;
  tex3D: RawTexture3D | null;
}

/**
 * GPU cache of baked noise assets (2D RawTexture / 3D RawTexture3D).
 * Always provides valid fallbacks so unused samplers stay legal.
 */
export class NoiseTextureCache {
  private readonly cache = new Map<string, CachedGpu>();
  private readonly fallback2D: RawTexture;
  private readonly fallback3D: RawTexture3D;

  constructor(private readonly scene: Scene) {
    this.fallback2D = new RawTexture(
      new Uint8Array([128]),
      1,
      1,
      Constants.TEXTUREFORMAT_R,
      scene,
      false,
      false,
      Constants.TEXTURE_BILINEAR_SAMPLINGMODE,
      Constants.TEXTURETYPE_UNSIGNED_BYTE,
    );
    this.fallback2D.wrapU = Constants.TEXTURE_WRAP_ADDRESSMODE;
    this.fallback2D.wrapV = Constants.TEXTURE_WRAP_ADDRESSMODE;
    this.fallback2D.name = 'noiseFallback2D';

    this.fallback3D = new RawTexture3D(
      new Uint8Array([128]),
      1,
      1,
      1,
      Constants.TEXTUREFORMAT_R,
      scene,
      false,
      false,
      Constants.TEXTURE_TRILINEAR_SAMPLINGMODE,
      Constants.TEXTURETYPE_UNSIGNED_BYTE,
    );
    this.fallback3D.wrapU = Constants.TEXTURE_WRAP_ADDRESSMODE;
    this.fallback3D.wrapV = Constants.TEXTURE_WRAP_ADDRESSMODE;
    this.fallback3D.wrapR = Constants.TEXTURE_WRAP_ADDRESSMODE;
    this.fallback3D.name = 'noiseFallback3D';
  }

  /** Replace / update GPU textures for the given library entries. */
  syncEntries(entries: ReadonlyArray<{ id: string; baked: BakedNoiseVolume }>): void {
    const keep = new Set(entries.map((e) => e.id));
    for (const [id, cached] of this.cache) {
      if (!keep.has(id)) {
        cached.tex2D?.dispose();
        cached.tex3D?.dispose();
        this.cache.delete(id);
      }
    }
    for (const { id, baked } of entries) {
      this.upload(id, baked);
    }
  }

  upload(id: string, baked: BakedNoiseVolume): void {
    const fingerprint = `${baked.dimension}:${baked.width}x${baked.height}x${baked.depth}:${baked.data.length}`;
    const prev = this.cache.get(id);
    if (prev && prev.fingerprint === fingerprint && prev.dimension === baked.dimension) {
      if (baked.dimension === '2d' && prev.tex2D) {
        prev.tex2D.update(baked.data);
        return;
      }
      if (baked.dimension === '3d' && prev.tex3D) {
        prev.tex3D.update(baked.data);
        return;
      }
    }
    prev?.tex2D?.dispose();
    prev?.tex3D?.dispose();

    if (baked.dimension === '2d') {
      const tex2D = new RawTexture(
        baked.data,
        baked.width,
        baked.height,
        Constants.TEXTUREFORMAT_R,
        this.scene,
        false,
        false,
        Constants.TEXTURE_TRILINEAR_SAMPLINGMODE,
        Constants.TEXTURETYPE_UNSIGNED_BYTE,
      );
      tex2D.wrapU = Constants.TEXTURE_WRAP_ADDRESSMODE;
      tex2D.wrapV = Constants.TEXTURE_WRAP_ADDRESSMODE;
      tex2D.name = `noise2D_${id}`;
      this.cache.set(id, { fingerprint, dimension: '2d', tex2D, tex3D: null });
      return;
    }

    const tex3D = new RawTexture3D(
      baked.data,
      baked.width,
      baked.height,
      baked.depth,
      Constants.TEXTUREFORMAT_R,
      this.scene,
      false,
      false,
      Constants.TEXTURE_TRILINEAR_SAMPLINGMODE,
      Constants.TEXTURETYPE_UNSIGNED_BYTE,
    );
    tex3D.wrapU = Constants.TEXTURE_WRAP_ADDRESSMODE;
    tex3D.wrapV = Constants.TEXTURE_WRAP_ADDRESSMODE;
    tex3D.wrapR = Constants.TEXTURE_WRAP_ADDRESSMODE;
    tex3D.name = `noise3D_${id}`;
    this.cache.set(id, { fingerprint, dimension: '3d', tex2D: null, tex3D });
  }

  bindingFor(assetId: string | null | undefined): NoiseGpuBinding {
    if (!assetId) {
      return { kind: 0, tex2D: this.fallback2D, tex3D: this.fallback3D };
    }
    const cached = this.cache.get(assetId);
    if (!cached) {
      return { kind: 0, tex2D: this.fallback2D, tex3D: this.fallback3D };
    }
    if (cached.dimension === '2d' && cached.tex2D) {
      return { kind: 2, tex2D: cached.tex2D, tex3D: this.fallback3D };
    }
    if (cached.dimension === '3d' && cached.tex3D) {
      return { kind: 3, tex2D: this.fallback2D, tex3D: cached.tex3D };
    }
    return { kind: 0, tex2D: this.fallback2D, tex3D: this.fallback3D };
  }

  dispose(): void {
    for (const cached of this.cache.values()) {
      cached.tex2D?.dispose();
      cached.tex3D?.dispose();
    }
    this.cache.clear();
    this.fallback2D.dispose();
    this.fallback3D.dispose();
  }
}
