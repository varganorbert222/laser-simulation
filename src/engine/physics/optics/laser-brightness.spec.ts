import { describe, expect, it } from 'vitest';
import {
  eyeSensitivity,
  laserBeamLuminousProduct,
  laserDotLuminousProduct,
  packSideEyeAdaptationGain,
  photopicLuminousEfficacy,
  photopicVisionWeight,
  physicalLuminousScale,
  relativeBeamBrightness,
  relativeDotBrightness,
} from './laser-brightness';
import { scotopicLuminousEfficacy } from './scotopic-efficacy';

describe('laser brightness (photopic + Rayleigh)', () => {
  it('peaks photopic efficacy near 555 nm', () => {
    expect(photopicLuminousEfficacy(555)).toBeCloseTo(1, 5);
    expect(photopicLuminousEfficacy(532)).toBeGreaterThan(photopicLuminousEfficacy(650));
    expect(photopicLuminousEfficacy(450)).toBeLessThan(photopicLuminousEfficacy(532));
  });

  it('dot brightness scales with P·V(λ) like the calculator', () => {
    const a = { powerW: 0.2, wavelengthNm: 405 };
    const b = { powerW: 0.1, wavelengthNm: 532 };
    const ratio = relativeDotBrightness(a, b);
    const expected =
      laserDotLuminousProduct(a.powerW, a.wavelengthNm) /
      laserDotLuminousProduct(b.powerW, b.wavelengthNm);
    expect(ratio).toBeCloseTo(expected, 10);
    expect(ratio).toBeLessThan(0.05);
  });

  it('beam brightness multiplies Rayleigh (λ_ref/λ)^4', () => {
    const a = { powerW: 0.2, wavelengthNm: 405 };
    const b = { powerW: 0.1, wavelengthNm: 532 };
    const beam = relativeBeamBrightness(a, b);
    const dot = relativeDotBrightness(a, b);
    expect(beam).toBeGreaterThan(dot);
    expect(beam).toBeCloseTo(
      laserBeamLuminousProduct(a.powerW, a.wavelengthNm) /
        laserBeamLuminousProduct(b.powerW, b.wavelengthNm),
      10,
    );
  });

  it('matches calculator beam formula: dotRatio · (λ_b/λ_a)^4', () => {
    const a = { powerW: 0.2, wavelengthNm: 405 };
    const b = { powerW: 0.1, wavelengthNm: 532 };
    const dot = relativeDotBrightness(a, b);
    const expectedBeam = dot * Math.pow(b.wavelengthNm / a.wavelengthNm, 4);
    expect(relativeBeamBrightness(a, b)).toBeCloseTo(expectedBeam, 5);
  });

  it('relative ratios follow V(λ) (green ≫ red at equal power)', () => {
    const green = { powerW: 0.005, wavelengthNm: 532 };
    const red = { powerW: 0.005, wavelengthNm: 650 };
    expect(relativeDotBrightness(green, red)).toBeGreaterThan(5);
  });

  it('default ambient stays fully photopic', () => {
    expect(photopicVisionWeight(0.38)).toBe(1);
    expect(eyeSensitivity(555)).toBeCloseTo(photopicLuminousEfficacy(555), 10);
  });

  it('dark ambient blends toward scotopic (Purkinje: red collapses)', () => {
    expect(photopicVisionWeight(0)).toBe(0);
    expect(eyeSensitivity(507, 0)).toBeCloseTo(scotopicLuminousEfficacy(507), 5);
    const greenDark = laserDotLuminousProduct(0.005, 532, 0);
    const redDark = laserDotLuminousProduct(0.005, 650, 0);
    const greenDay = laserDotLuminousProduct(0.005, 532, 0.5);
    const redDay = laserDotLuminousProduct(0.005, 650, 0.5);
    expect(greenDark / redDark).toBeGreaterThan(greenDay / redDay);
  });

  it('sky ON disables pack-side eye adaptation gain', () => {
    expect(packSideEyeAdaptationGain({ ambientLevel: 0, packSideAdaptation: false })).toBe(1);
    const withGain = physicalLuminousScale(0.1, 532, { ambientLevel: 0 });
    const without = physicalLuminousScale(0.1, 532, {
      ambientLevel: 0,
      packSideAdaptation: false,
    });
    expect(withGain).toBeGreaterThan(without);
    expect(without).toBeCloseTo(
      laserDotLuminousProduct(0.1, 532, 0, false) / 35,
      5,
    );
  });
});
