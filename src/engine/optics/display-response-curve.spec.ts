import { describe, expect, it } from 'vitest';
import {
  createDefaultDisplayResponseCurve,
  evaluateDisplayResponse,
  normalizeDisplayResponseCurve,
} from './display-response-curve';
import {
  eyeAdaptationGainFromAmbient,
  eyeSensitivity,
  laserDotDisplayBrightness,
  laserDotLuminousProduct,
  photopicLuminousEfficacy,
} from './laser-brightness';

describe('eye sensitivity V(λ)', () => {
  it('photopic peaks near 555 nm', () => {
    expect(photopicLuminousEfficacy(555)).toBeCloseTo(1, 5);
    expect(eyeSensitivity(555)).toBeCloseTo(1, 5);
  });

  it('same power: green ≫ red photopically', () => {
    expect(eyeSensitivity(532)).toBeGreaterThan(eyeSensitivity(650) * 3);
  });

  it('eye exposure rises as environment ambient falls', () => {
    const bright = eyeAdaptationGainFromAmbient(1);
    const dark = eyeAdaptationGainFromAmbient(0);
    expect(bright).toBeCloseTo(1, 5);
    expect(dark).toBeCloseTo(12, 5);
    const dayLum = laserDotLuminousProduct(0.005, 532, 1);
    const nightLum = laserDotLuminousProduct(0.005, 532, 0);
    expect(nightLum / dayLum).toBeGreaterThan(8);
  });
});

describe('display response curve', () => {
  it('default curve follows scientific luminous γ≈0.7 (CIE-ordered)', () => {
    const curve = createDefaultDisplayResponseCurve();
    const opts = { responseCurve: curve, ambientLevel: 0.38 };
    const m5 = laserDotDisplayBrightness(0.005, 532, opts);
    const w1 = laserDotDisplayBrightness(1, 532, opts);
    const k500 = laserDotDisplayBrightness(500_000, 532, opts);
    expect(w1).toBeGreaterThan(m5);
    expect(k500).toBeGreaterThan(w1);
    expect(k500).toBeLessThanOrEqual(96);
    const green = laserDotDisplayBrightness(1, 532, opts);
    const red = laserDotDisplayBrightness(1, 650, opts);
    expect(green).toBeGreaterThan(red);
  });

  it('custom two-point curve is monotonic and clamped', () => {
    const curve = normalizeDisplayResponseCurve({
      points: [
        { t: 0, hdr: 0 },
        { t: 1, hdr: 80 },
      ],
    });
    const lo = evaluateDisplayResponse(1, curve);
    const hi = evaluateDisplayResponse(1_000_000, curve);
    expect(hi).toBeGreaterThan(lo);
    expect(hi).toBeLessThanOrEqual(96);
  });
});
