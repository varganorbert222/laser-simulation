import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MOON_TEXTURE_ID,
  DEFAULT_NIGHT_SKY_TEXTURE_ID,
} from '../../../assets/asset-manifest';
import {
  createDefaultAtmosphereSettings,
  normalizeAtmosphereSettings,
} from './atmosphere-settings';

describe('AtmosphereSettings asset ids', () => {
  it('defaults night / moon texture ids and null skybox', () => {
    const a = createDefaultAtmosphereSettings();
    expect(a.skyboxAssetId).toBeNull();
    expect(a.nightSkyTextureId).toBe(DEFAULT_NIGHT_SKY_TEXTURE_ID);
    expect(a.moonTextureId).toBe(DEFAULT_MOON_TEXTURE_ID);
  });

  it('normalizes asset ids from saves', () => {
    const a = normalizeAtmosphereSettings({
      skyboxAssetId: '  studio_dark  ',
      nightSkyTextureId: 'custom_night',
      moonTextureId: '',
    });
    expect(a.skyboxAssetId).toBe('studio_dark');
    expect(a.nightSkyTextureId).toBe('custom_night');
    expect(a.moonTextureId).toBe(DEFAULT_MOON_TEXTURE_ID);
  });

  it('rejects NightSky id as moon texture', () => {
    const a = normalizeAtmosphereSettings({
      moonTextureId: DEFAULT_NIGHT_SKY_TEXTURE_ID,
    });
    expect(a.moonTextureId).toBe(DEFAULT_MOON_TEXTURE_ID);
  });

  it('defaults ground + equator colors', () => {
    const a = createDefaultAtmosphereSettings();
    expect(a.skyboxGroundColor[0]).toBeLessThan(0.05);
    expect(a.skyboxEquatorColor[0]).toBeGreaterThan(0.3);
  });

  it('clears skyboxAssetId when empty string', () => {
    const a = normalizeAtmosphereSettings({ skyboxAssetId: '   ' });
    expect(a.skyboxAssetId).toBeNull();
  });
});
