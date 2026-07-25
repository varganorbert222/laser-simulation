import { describe, expect, it } from 'vitest';
import {
  acesFilmToneMap,
  acesLuminanceToneMap,
  displayRgb,
  normalizeChromaticity,
} from './color';
import { laserDotDisplayBrightness } from './laser-brightness';
import { wavelengthToRgb } from './wavelength';

describe('hue-preserving display', () => {
  it('normalizes chromaticity so max channel is 1', () => {
    const [r, g, b] = normalizeChromaticity([0.2, 0.8, 0.1]);
    expect(g).toBeCloseTo(1);
    expect(r).toBeCloseTo(0.25);
    expect(b).toBeCloseTo(0.125);
  });

  it('luminance ACES keeps 525 nm green-dominant at high intensity', () => {
    const chroma = normalizeChromaticity(wavelengthToRgb(525));
    const intensity = laserDotDisplayBrightness(50, 525);
    const [r, g, b] = displayRgb(chroma, intensity);
    expect(g).toBeGreaterThan(r);
    expect(g).toBeGreaterThan(b);
    expect(Math.max(r, g, b)).toBeLessThanOrEqual(1);
    expect(g / Math.max(r, 1e-9)).toBeGreaterThan(1.5);
  });

  it('luminance ACES preserves chroma ratios under huge HDR', () => {
    const chroma = normalizeChromaticity(wavelengthToRgb(525));
    const hot = acesLuminanceToneMap([chroma[0] * 100, chroma[1] * 100, chroma[2] * 100]);
    const ratioChroma = chroma[0] / chroma[1];
    const ratioHot = hot[0] / hot[1];
    expect(ratioHot).toBeCloseTo(ratioChroma, 5);
    expect(hot[1]).toBeGreaterThan(hot[0]);
  });

  it('per-channel ACES on extreme HDR collapses toward white (why we use luminance ACES)', () => {
    const chroma = normalizeChromaticity(wavelengthToRgb(525));
    const perChannel = acesFilmToneMap([chroma[0] * 100, chroma[1] * 100, chroma[2] * 100]);
    expect(perChannel[0]).toBeCloseTo(1, 2);
    expect(perChannel[1]).toBeCloseTo(1, 2);
  });

  it('power changes brightness but keeps R/G ratio (colour from λ only)', () => {
    const chroma = normalizeChromaticity(wavelengthToRgb(525));
    const opts = { ambientLevel: 1 as const };
    const lowI = laserDotDisplayBrightness(0.005, 525, opts);
    const highI = laserDotDisplayBrightness(1, 525, opts);
    expect(highI).toBeGreaterThan(lowI * 2);
    const low = displayRgb(chroma, lowI);
    const high = displayRgb(chroma, highI);
    const ratioLow = low[0] / Math.max(low[1], 1e-9);
    const ratioHigh = high[0] / Math.max(high[1], 1e-9);
    expect(Math.abs(ratioLow - ratioHigh)).toBeLessThan(1e-6);
    // LDR peak may both sit at 1 after ACES; hue must stay green-dominant.
    expect(high[1]).toBeGreaterThan(high[0]);
    expect(low[1]).toBeGreaterThan(low[0]);
  });
});

describe('display power decades', () => {
  it('Weber–Fechner default: decades grow through 1 kW; green ≫ red', () => {
    const opts = { ambientLevel: 1 as const }; // bright lab — no adaptation boost
    const m5 = laserDotDisplayBrightness(0.005, 532, opts);
    const w1 = laserDotDisplayBrightness(1, 532, opts);
    const w50 = laserDotDisplayBrightness(50, 532, opts);
    const k1 = laserDotDisplayBrightness(1000, 532, opts);
    expect(w1).toBeGreaterThan(m5);
    expect(w50).toBeGreaterThan(w1);
    expect(k1).toBeGreaterThan(w50);
    expect(k1).toBeLessThanOrEqual(96);
    expect(laserDotDisplayBrightness(1, 532, opts)).toBeGreaterThan(
      laserDotDisplayBrightness(1, 650, opts),
    );
  });
});
