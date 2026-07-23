import { describe, expect, it } from 'vitest';
import {
  CLIMATE_OUTDOOR_HAZE_FLOOR_M,
  CLIMATE_ROOM_AEROSOL_M,
  climateOpticalRates,
  humidityMieFactor,
  migrateLegacyPresetId,
  sampleLayeredMediaRates,
  temperatureTurbulence,
} from './atmosphere-climate';
import {
  MEDIA_OPTICS_ATMOSPHERE,
  MEDIA_OPTICS_FOG,
  defaultMediaVolumeForKind,
  opticalFieldsForMediaKind,
  opticalFieldsFromClimate,
} from './media-optical-presets';
import { normalizeMediaVolume } from '../ecs/components';

describe('atmosphere climate', () => {
  it('Mie factor follows RH^1.3', () => {
    expect(humidityMieFactor(1)).toBeCloseTo(1, 6);
    expect(humidityMieFactor(0.5)).toBeCloseTo(Math.pow(0.5, 1.3), 6);
    expect(humidityMieFactor(0.8)).toBeGreaterThan(humidityMieFactor(0.4));
  });

  it('summer Mie exceeds clear night; winter is drier than summer', () => {
    const clear = climateOpticalRates('clearNight', 0.35, 15);
    const summer = climateOpticalRates('summerHumid', 0.78, 28);
    const winter = climateOpticalRates('winterDry', 0.28, -5);
    expect(summer.scatterMie).toBeGreaterThan(clear.scatterMie);
    expect(winter.scatterMie).toBeLessThan(summer.scatterMie);
    expect(summer.scatterMie).toBeGreaterThan(summer.scatterRayleigh * 0.5);
  });

  it('legacy kind aliases resolve in climateOpticalRates', () => {
    const a = climateOpticalRates('atmosphere', 0.45, 12);
    const b = climateOpticalRates('clearNight', 0.45, 12);
    expect(a.scatterMie).toBeCloseTo(b.scatterMie, 10);
    expect(climateOpticalRates('summer', 0.78, 28).scatterMie).toBeCloseTo(
      climateOpticalRates('summerHumid', 0.78, 28).scatterMie,
      10,
    );
  });

  it('clearNight includes outdoor haze floor', () => {
    const night = climateOpticalRates('clearNight', 0.05, 10);
    expect(night.scatterMie).toBeGreaterThanOrEqual(CLIMATE_OUTDOOR_HAZE_FLOOR_M * 0.99);
  });

  it('room has indoor aerosol and weaker molecular Rayleigh than outdoor', () => {
    const outdoor = climateOpticalRates('clearNight', 0.42, 22);
    const room = climateOpticalRates('room', 0.42, 22);
    expect(room.scatterRayleigh).toBeLessThan(outdoor.scatterRayleigh);
    expect(room.scatterMie).toBeGreaterThanOrEqual(CLIMATE_ROOM_AEROSOL_M * 0.99);
  });

  it('warmer air increases educational turbulence', () => {
    expect(temperatureTurbulence(30)).toBeGreaterThan(temperatureTurbulence(5));
    expect(temperatureTurbulence(-10)).toBe(0);
  });

  it('opticalFieldsFromClimate updates dual σ from RH', () => {
    const dry = opticalFieldsFromClimate('summerHumid', 0.3, 28, 1);
    const wet = opticalFieldsFromClimate('summerHumid', 0.9, 28, 1);
    expect(wet.scatterMie).toBeGreaterThan(dry.scatterMie);
  });

  it('normalizeMediaVolume re-derives climate σ from RH/T', () => {
    const n = normalizeMediaVolume({
      kind: 'room',
      relativeHumidity: 0.55,
      temperatureC: 24,
      density: 1,
    });
    expect(n.kind).toBe('room');
    expect(n.layer).toBe('interior');
    expect(n.insulating).toBe(true);
    expect(n.scatterMie).toBeGreaterThan(0);
    expect(n.scatter).toBeGreaterThan(0);
    const expected = opticalFieldsFromClimate('room', 0.55, 24, 1);
    expect(n.scatter).toBeCloseTo(expected.scatter, 10);
    expect(n.scatterMie).toBeCloseTo(expected.scatterMie, 10);
  });

  it('legacy atmosphere kind migrates to clearNight', () => {
    expect(migrateLegacyPresetId('atmosphere')).toBe('clearNight');
    const atm = defaultMediaVolumeForKind('atmosphere');
    expect(atm.preset).toBe('clearNight');
    expect(atm.layer).toBe('outdoor');
    expect(atm.scatter).toBe(MEDIA_OPTICS_ATMOSPHERE.scatter);
    expect(atm.scatterMie).toBeGreaterThan(0);
    expect(opticalFieldsForMediaKind('fog').scatter).toBe(MEDIA_OPTICS_FOG.scatter);
    expect(opticalFieldsForMediaKind('fog').scatterMie).toBe(0);
  });

  it('insulating interior replaces outdoor; particulate stays additive', () => {
    const outdoor = climateOpticalRates('clearNight', 0.45, 12);
    const room = climateOpticalRates('room', 0.42, 22);
    const nested = sampleLayeredMediaRates([
      {
        layer: 'outdoor',
        insulating: false,
        halfExtents: [40, 12, 40],
        scatterRayleigh: outdoor.scatterRayleigh,
        scatterMie: outdoor.scatterMie,
        absorption: outdoor.absorption,
      },
      {
        layer: 'interior',
        insulating: true,
        halfExtents: [6, 3, 6],
        scatterRayleigh: room.scatterRayleigh,
        scatterMie: room.scatterMie,
        absorption: room.absorption,
      },
      {
        layer: 'particulate',
        insulating: false,
        halfExtents: [2, 2, 2],
        scatterRayleigh: 0,
        scatterMie: 0,
        absorption: 0.01,
        scatterParticulate: 0.05,
      },
    ]);
    expect(nested.usedInterior).toBe(true);
    expect(nested.scatterRayleigh).toBeCloseTo(room.scatterRayleigh, 10);
    expect(nested.scatterMie).toBeCloseTo(room.scatterMie + 0.05, 10);
    expect(nested.absorption).toBeCloseTo(room.absorption + 0.01, 10);
  });

  it('innermost insulating volume wins among overlapping rooms', () => {
    const large = sampleLayeredMediaRates([
      {
        layer: 'interior',
        insulating: true,
        halfExtents: [10, 4, 10],
        scatterRayleigh: 0.001,
        scatterMie: 0.002,
        absorption: 0.0001,
      },
      {
        layer: 'interior',
        insulating: true,
        halfExtents: [3, 2, 3],
        scatterRayleigh: 0.01,
        scatterMie: 0.02,
        absorption: 0.001,
      },
    ]);
    expect(large.scatterRayleigh).toBeCloseTo(0.01, 10);
    expect(large.scatterMie).toBeCloseTo(0.02, 10);
  });
});
