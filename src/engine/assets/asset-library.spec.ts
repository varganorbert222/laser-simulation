import { describe, expect, it } from 'vitest';
import { resolveAssetUrl, RuntimePaths } from './runtime-paths';
import { resolveRegistryClip } from './sfx-registry';
import type { SfxRegistry } from './audio-types';

describe('resolveAssetUrl', () => {
  it('joins assets base with relative path', () => {
    expect(resolveAssetUrl('models/fixtures/a.glb')).toBe('/assets/models/fixtures/a.glb');
    expect(resolveAssetUrl('/audio/music/x.mp3', '/assets/')).toBe('/assets/audio/music/x.mp3');
  });
});

describe('RuntimePaths', () => {
  it('exposes data and assets roots like rogue-leader', () => {
    expect(RuntimePaths.assetManifest).toBe('/data/manifest.json');
    expect(RuntimePaths.audioManifest).toBe('/data/audio/manifest.json');
    expect(RuntimePaths.assetsBase).toBe('/assets');
  });
});

describe('resolveRegistryClip', () => {
  it('resolves group basePath + files', () => {
    const registry: SfxRegistry = {
      groups: {
        'ui/click': { basePath: 'audio/sfx/ui', files: ['click.wav'] },
      },
    };
    expect(resolveRegistryClip(registry, 'ui/click')).toEqual({
      basePath: 'audio/sfx/ui',
      files: ['click.wav'],
    });
    expect(resolveRegistryClip(registry, 'missing')).toBeNull();
  });
});

describe('AssetManifest textures', () => {
  it('parses textures map with defaults shape', async () => {
    const { loadAssetManifest } = await import('./asset-manifest');
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          models: {},
          skyboxes: {
            studio_dark: {
              type: 'photodome',
              textures: ['textures/skybox/a.png'],
            },
          },
          textures: {
            night_sky_default: {
              label: 'Night sky',
              category: 'sky',
              path: 'textures/skybox/NightSky.jpg',
              usage: 'equirect',
            },
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )) as typeof fetch;
    try {
      const manifest = await loadAssetManifest('/data/manifest.json');
      expect(manifest.textures.night_sky_default?.path).toBe(
        'textures/skybox/NightSky.jpg',
      );
      expect(manifest.skyboxes.studio_dark?.type).toBe('photodome');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
