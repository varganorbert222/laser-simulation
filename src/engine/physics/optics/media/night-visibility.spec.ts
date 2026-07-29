import { describe, expect, it } from 'vitest';
import { climateOpticalRates, CLIMATE_OUTDOOR_HAZE_FLOOR_M } from '../atmosphere/atmosphere-climate';
import {
  displayLuminousPower,
  physicalLuminousScale,
} from '../display/laser-brightness';

describe('150 mW green night visibility (clearNight)', () => {
  const powerW = 0.15;
  const wavelengthNm = 525;
  const ambientNight = 0.05;
  const pathM = 30;

  it('physical luminous scale stays linear in power (no Weber–Fechner crush)', () => {
    const pLow = physicalLuminousScale(powerW, wavelengthNm, { ambientLevel: ambientNight });
    const pHigh = physicalLuminousScale(powerW * 10, wavelengthNm, {
      ambientLevel: ambientNight,
    });
    expect(pHigh / pLow).toBeCloseTo(10, 5);

    const dLow = displayLuminousPower(powerW, wavelengthNm, { ambientLevel: ambientNight });
    const dHigh = displayLuminousPower(powerW * 10, wavelengthNm, {
      ambientLevel: ambientNight,
    });
    // Display curve is compressive — ratio ≪ 10.
    expect(dHigh / dLow).toBeLessThan(4);
    expect(pLow).toBeGreaterThan(dLow);
  });

  it('clearNight haze + linear power → path integral ≫ old ~0.03 ACES-dim regime', () => {
    const rates = climateOpticalRates('clearNight', 0.45, 12);
    expect(rates.scatterMie).toBeGreaterThanOrEqual(CLIMATE_OUTDOOR_HAZE_FLOOR_M * 0.99);

    const powerLin = physicalLuminousScale(powerW, wavelengthNm, {
      ambientLevel: ambientNight,
    });
    const sigma = rates.scatterRayleigh + rates.scatterMie;
    const pathIntegral = powerLin * sigma * pathM;

    // Order-of-magnitude: educational yard-scale beam should land well above the
    // previous ~0.03 HDR crush (molecular-only × log power).
    expect(pathIntegral).toBeGreaterThan(1);
    expect(powerLin).toBeGreaterThan(10);
  });
});
