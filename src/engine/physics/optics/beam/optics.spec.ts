import { describe, expect, it } from 'vitest';
import { hexToRgb, rgbToHex } from '../display/color';
import {
  deriveFromWavelengthNm,
  rayleighScatterWeight,
  rgbToDominantWavelength,
  rgbToWavelengthNm,
  wavelengthToRgb,
  wavelengthToRgb255,
  wavelengthToRgbLinear,
  clampVisibleWavelengthNm,
  VISIBLE_NM_MAX,
  VISIBLE_NM_MIN,
} from '../display/wavelength';
import { beamRadiusAt, divergenceMrad, rayleighRange } from './laser';
import { buildScienceReadout } from '../scene/science-readout';

describe('wavelength optics', () => {
  it('derives frequency and energy from λ', () => {
    const d = deriveFromWavelengthNm(532);
    expect(d.frequencyTHz).toBeGreaterThan(560);
    expect(d.frequencyTHz).toBeLessThan(570);
    expect(d.energyEv).toBeGreaterThan(2.3);
    expect(d.energyEv).toBeLessThan(2.4);
  });

  it('keeps linear chroma separate from display γ encode', () => {
    const lin = wavelengthToRgbLinear(532);
    const disp = wavelengthToRgb(532);
    expect(disp[1]).toBeGreaterThan(lin[1] - 1e-9);
    expect(Math.max(...lin)).toBeLessThanOrEqual(1);
  });

  it('maps green wavelength to green-dominant RGB (Bruton / colorUtils)', () => {
    const [r, g, b] = wavelengthToRgb(532);
    expect(g).toBeGreaterThan(r);
    expect(g).toBeGreaterThan(b);
  });

  it('matches colorUtils.js Dan Bruton locus at key wavelengths', () => {
    expect(wavelengthToRgb(300)).toEqual([0, 0, 0]);
    expect(wavelengthToRgb(701)).toEqual([0, 0, 0]);
    expect(wavelengthToRgb(780)).toEqual([0, 0, 0]);

    // 440 nm: start of cyan band (blue = 1)
    const at440 = wavelengthToRgb(440);
    expect(at440[0]).toBe(0);
    expect(at440[1]).toBe(0);
    expect(at440[2]).toBeCloseTo(1, 5);

    // 510 nm: green peak
    const at510 = wavelengthToRgb(510);
    expect(at510[0]).toBe(0);
    expect(at510[1]).toBeCloseTo(1, 5);
    expect(at510[2]).toBe(0);

    // 645 nm: pure red (factor = 1 through 680)
    const at645 = wavelengthToRgb(645);
    expect(at645[0]).toBeCloseTo(1, 5);
    expect(at645[1]).toBe(0);
    expect(at645[2]).toBe(0);

    // 700 nm: deep red with edge falloff (factor = 0.3)
    const at700 = wavelengthToRgbLinear(700);
    expect(at700[0]).toBeCloseTo(0.3, 5);
    expect(at700[1]).toBe(0);
    expect(at700[2]).toBe(0);

    // Near-UV intensity falloff
    expect(wavelengthToRgb(400)[2]).toBeLessThan(1);
    // Mid green band full green
    expect(wavelengthToRgb(550)[1]).toBeCloseTo(1, 5);
  });

  it('limits the colour spectrum to 380–700 nm', () => {
    expect(VISIBLE_NM_MIN).toBe(380);
    expect(VISIBLE_NM_MAX).toBe(700);
    expect(clampVisibleWavelengthNm(350)).toBe(380);
    expect(clampVisibleWavelengthNm(750)).toBe(700);
  });

  it('exposes 8-bit RGB matching colorUtils rounding', () => {
    const [r, g, b] = wavelengthToRgb255(500);
    expect(r).toBeGreaterThanOrEqual(0);
    expect(r).toBeLessThanOrEqual(255);
    expect(g).toBeGreaterThan(r);
    expect(b).toBeGreaterThan(0);
  });

  it('gives higher Rayleigh weight to blue than red', () => {
    expect(rayleighScatterWeight(450)).toBeGreaterThan(rayleighScatterWeight(650));
  });

  it('maps sRGB to CIE dominant wavelength', () => {
    const green = rgbToDominantWavelength([0, 1, 0]);
    expect(green.type).toBe('dominant');
    expect(green.wavelengthNm).toBeGreaterThan(500);
    expect(green.wavelengthNm).toBeLessThan(570);
    expect(green.purity).toBeGreaterThan(50);

    const gray = rgbToDominantWavelength([0.5, 0.5, 0.5]);
    expect(gray.type).toBe('achromatic');
    expect(gray.wavelengthNm).toBeNull();
  });

  it('reports complementary λ for line-of-purples (magenta)', () => {
    const magenta = rgbToDominantWavelength([1, 0, 1]);
    expect(magenta.type).toBe('complementary');
    expect(magenta.wavelengthNm).not.toBeNull();
    expect(magenta.purity).toBeGreaterThan(0);
    expect(magenta.purity!).toBeLessThanOrEqual(100);
  });

  it('gives lower purity to washed-out greens than saturated greens', () => {
    const vivid = rgbToDominantWavelength([0, 1, 0]);
    const pale = rgbToDominantWavelength([0.75, 0.9, 0.75]);
    expect(vivid.type).toBe('dominant');
    expect(pale.type).toBe('dominant');
    expect(pale.purity!).toBeLessThan(vivid.purity!);
  });

  it('round-trips spectral λ → RGB → dominant λ within tolerance', () => {
    // Bruton RGB is not exactly on the CIE locus — allow educational slack.
    for (const nm of [450, 532, 600]) {
      const rgb = wavelengthToRgb(nm);
      const back = rgbToWavelengthNm(rgb);
      expect(Math.abs(back - nm)).toBeLessThanOrEqual(25);
    }
  });
});

describe('color hex', () => {
  it('converts rgb ↔ hex', () => {
    expect(rgbToHex([1, 0, 0])).toBe('#ff0000');
    expect(hexToRgb('#00ff00')).toEqual([0, 1, 0]);
    expect(hexToRgb('#0f0')).toEqual([0, 1, 0]);
    expect(hexToRgb('notahex')).toBeNull();
    expect(hexToRgb('#gg0000')).toBeNull();
  });
});

describe('laser beam', () => {
  it('computes Rayleigh range and w(z)', () => {
    const w0 = 0.001;
    const lambda = 532e-9;
    const zR = rayleighRange(w0, lambda);
    expect(zR).toBeGreaterThan(5);
    const w = beamRadiusAt(w0, zR, zR);
    expect(w).toBeCloseTo(w0 * Math.SQRT2, 6);
    expect(divergenceMrad(w0, lambda)).toBeGreaterThan(0);
  });
});

describe('science readout', () => {
  it('tags approximated RGB and includes laser quantities', () => {
    const readout = buildScienceReadout({
      wavelengthNm: 650,
      powerW: 0.005,
      params: {
        mode: 'laser',
        laser: {
          w0M: 0.002,
          m2: 1.3,
          probeDistanceM: 10,
          ellipticRatio: 1,
          waistOffsetM: 0,
          topHatMix: 0,
          sphericalAberration: 0,
          coma: 0,
          astigmatism: 0,
        },
      },
    });
    expect(readout.quantities.some((q) => q.id === 'zR' && q.kind === 'calculated')).toBe(true);
    expect(readout.quantities.some((q) => q.id === 'rgb' && q.kind === 'approximated')).toBe(true);
    expect(readout.safetyNote).toBeTruthy();
  });
});
