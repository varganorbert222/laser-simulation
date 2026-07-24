/**
 * Shared NightSky + Moon textures for the procedural atmosphere skybox / IBL.
 * Paths come from `studioAssets` texture ids — never hardcode `/assets` URLs here.
 */
import { Constants, Texture, type Scene } from '@babylonjs/core';
import {
  DEFAULT_MOON_TEXTURE_ID,
  DEFAULT_NIGHT_SKY_TEXTURE_ID,
  studioAssets,
} from '@engine';

export class AtmosphereNightTextures {
  nightSky: Texture;
  moon: Texture;
  private nightSkyId = '';
  private moonId = '';

  constructor(private readonly scene: Scene) {
    this.nightSky = this.createPlaceholder('atmosphereNightSky');
    this.moon = this.createPlaceholder('atmosphereMoon');
    this.moon.hasAlpha = true;
    this.ensure(DEFAULT_NIGHT_SKY_TEXTURE_ID, DEFAULT_MOON_TEXTURE_ID);
  }

  /** Reload textures when catalog ids change. */
  ensure(nightSkyTextureId: string, moonTextureId: string): void {
    if (nightSkyTextureId !== this.nightSkyId) {
      this.nightSkyId = nightSkyTextureId;
      this.nightSky.dispose();
      this.nightSky = this.loadTexture(nightSkyTextureId, 'atmosphereNightSky', {
        wrapU: Constants.TEXTURE_WRAP_ADDRESSMODE,
        wrapV: Constants.TEXTURE_CLAMP_ADDRESSMODE,
        sampling: Texture.TRILINEAR_SAMPLINGMODE,
        invertY: true,
        hasAlpha: false,
      });
    }
    if (moonTextureId !== this.moonId) {
      this.moonId = moonTextureId;
      this.moon.dispose();
      this.moon = this.loadTexture(moonTextureId, 'atmosphereMoon', {
        wrapU: Constants.TEXTURE_CLAMP_ADDRESSMODE,
        wrapV: Constants.TEXTURE_CLAMP_ADDRESSMODE,
        sampling: Texture.BILINEAR_SAMPLINGMODE,
        invertY: true,
        hasAlpha: true,
      });
    }
  }

  dispose(): void {
    this.nightSky.dispose();
    this.moon.dispose();
  }

  private loadTexture(
    id: string,
    name: string,
    opts: {
      wrapU: number;
      wrapV: number;
      sampling: number;
      invertY: boolean;
      hasAlpha: boolean;
    },
  ): Texture {
    const url = studioAssets.getTextureUrl(id);
    if (!url) {
      const placeholder = this.createPlaceholder(name);
      placeholder.hasAlpha = opts.hasAlpha;
      return placeholder;
    }
    const tex = new Texture(
      url,
      this.scene,
      false,
      opts.invertY,
      opts.sampling,
    );
    tex.wrapU = opts.wrapU;
    tex.wrapV = opts.wrapV;
    tex.hasAlpha = opts.hasAlpha;
    tex.name = name;
    return tex;
  }

  private createPlaceholder(name: string): Texture {
    const tex = new Texture(null, this.scene);
    tex.name = name;
    return tex;
  }
}
