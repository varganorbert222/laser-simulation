import { describe, expect, it } from 'vitest';
import {
  atmosphereQualityTune,
  createAtmosphereSettingsForQuality,
  createDefaultAtmosphereSettings,
  matchAtmosphereQualityPreset,
} from './atmosphere-settings';

describe('atmosphere quality ladder (Unity/Unreal-class)', () => {
  it('medium matches Bruneton/UE-like LUT footprint', () => {
    const m = atmosphereQualityTune('medium');
    expect(m.skyViewLutWidth).toBe(256);
    expect(m.skyViewLutHeight).toBe(128);
    expect(m.transmittanceLutWidth).toBe(256);
    expect(m.transmittanceLutHeight).toBe(64);
    expect(m.aerialLutWidth).toBe(32);
    expect(m.aerialLutDepth).toBe(16);
    expect(m.envCubeSize).toBe(256);
    expect(m.skyViewSamples).toBe(64);
  });

  it('ultra is strictly heavier than high', () => {
    const h = atmosphereQualityTune('high');
    const u = atmosphereQualityTune('ultra');
    expect(u.skyViewSamples).toBeGreaterThan(h.skyViewSamples);
    expect(u.skyViewLutWidth * u.skyViewLutHeight).toBeGreaterThan(
      h.skyViewLutWidth * h.skyViewLutHeight,
    );
    expect(u.aerialLutWidth * u.aerialLutHeight * u.aerialLutDepth).toBeGreaterThanOrEqual(
      h.aerialLutWidth * h.aerialLutHeight * h.aerialLutDepth,
    );
  });

  it('createAtmosphereSettingsForQuality packs and matches preset', () => {
    const a = createAtmosphereSettingsForQuality('high');
    expect(a.qualityPreset).toBe('high');
    expect(matchAtmosphereQualityPreset(a)).toBe('high');
  });

  it('default atmosphere uses medium ladder', () => {
    const a = createDefaultAtmosphereSettings();
    expect(a.qualityPreset).toBe('medium');
    expect(a.skyViewLutWidth).toBe(256);
    expect(a.envCubeSize).toBe(256);
  });
});
