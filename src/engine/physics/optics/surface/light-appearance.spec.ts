import { describe, expect, it } from 'vitest';
import {
  colorTemperatureToRgb,
  estimateIntensityLmFromSpectral,
  normalizeLightEmitter,
  resolveEmitterAppearance,
  resolveHdrChroma,
  srgbToLinear,
  defaultLightEmitter,
  defaultLightEmitterForMode,
} from '../../../index';

describe('light appearance (HDR lamps)', () => {
  it('maps CCT to warm/cool RGB', () => {
    const warm = colorTemperatureToRgb(2700);
    const cool = colorTemperatureToRgb(9000);
    expect(warm[0]).toBeGreaterThan(warm[2]!);
    expect(cool[2]).toBeGreaterThan(cool[0]!);
  });

  it('decodes sRGB lamp RGB to linear chromaticity', () => {
    const midGray = resolveHdrChroma({
      colorRgb: [0.5, 0.5, 0.5],
      intensityLm: 100,
      useColorTemperature: false,
      colorTemperatureK: 6500,
    });
    const expected = srgbToLinear([0.5, 0.5, 0.5])[0]!;
    // After max-normalize, mid gray stays equal channels at 1.
    expect(midGray[0]).toBeCloseTo(1, 5);
    expect(midGray[1]).toBeCloseTo(1, 5);
    expect(midGray[2]).toBeCloseTo(1, 5);
    // Non-equal sRGB: red channel stays dominant after linearize+normalize.
    const red = resolveHdrChroma({
      colorRgb: [0.8, 0.2, 0.1],
      intensityLm: 100,
      useColorTemperature: false,
      colorTemperatureK: 6500,
    });
    expect(red[0]).toBeCloseTo(1, 5);
    expect(red[1]).toBeLessThan(red[0]!);
    expect(red[2]).toBeLessThan(red[1]!);
    expect(srgbToLinear([0.5, 0.5, 0.5])[0]).toBeCloseTo(expected, 5);
  });

  it('resolves lasers spectrally and lamps via lumens', () => {
    const laser = defaultLightEmitter();
    const lamp = defaultLightEmitterForMode('spotlight');
    const a = resolveEmitterAppearance(laser);
    const b = resolveEmitterAppearance(lamp);
    expect(a.scatterNm).toBe(532);
    expect(b.powerLinear).toBeGreaterThan(0);
    expect(lamp.intensityLm).toBeGreaterThan(0);
    expect(lamp.useColorTemperature).toBe(false);
  });

  it('migrates legacy spectral-only emitters to HDR fields', () => {
    const n = normalizeLightEmitter({
      wavelengthNm: 560,
      powerW: 2,
      params: { mode: 'omni_lamp', omni: { softRadiusM: 0.4, falloff: 2 } },
    } as never);
    expect(n.colorRgb[1]).toBeGreaterThan(0);
    expect(n.intensityLm).toBeCloseTo(estimateIntensityLmFromSpectral(2, 560), 0);
  });

  it('sun defaults use color temperature', () => {
    const sun = defaultLightEmitterForMode('sun');
    expect(sun.useColorTemperature).toBe(true);
    expect(sun.colorTemperatureK).toBeGreaterThan(5000);
    const app = resolveEmitterAppearance(sun);
    expect(app.chroma[0]).toBeGreaterThan(0);
  });

  it('defaults enable screen-space lens flare', () => {
    const laser = defaultLightEmitter();
    const sun = defaultLightEmitterForMode('sun');
    expect(laser.lensFlareEnabled).toBe(true);
    expect(sun.lensFlareEnabled).toBe(true);
    const n = normalizeLightEmitter({
      wavelengthNm: 532,
      powerW: 1,
    } as never);
    expect(n.lensFlareEnabled).toBe(true);
    expect(n.lensFlareIntensity).toBe(1);
  });
});
