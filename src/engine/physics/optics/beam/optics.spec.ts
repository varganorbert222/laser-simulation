import { describe, expect, it } from 'vitest';
import { hexToRgb, rgbToHex } from '../display/color';
import {
  deriveFromWavelengthNm,
  rayleighScatterWeight,
  rgbToWavelengthNm,
  wavelengthToRgb,
  wavelengthToRgb255,
  wavelengthToRgbAcademoOriginal,
  wavelengthToRgbLinear,
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
    // Display applies γ=0.8 → mid channels rise toward 1 vs linear.
    expect(disp[1]).toBeGreaterThan(lin[1] - 1e-9);
    expect(Math.max(...lin)).toBeLessThanOrEqual(1);
  });

  it('maps green wavelength to green-dominant RGB', () => {
    const [r, g, b] = wavelengthToRgb(532);
    expect(g).toBeGreaterThan(r);
    expect(g).toBeGreaterThan(b);
  });

  it('matches refined Academo nm→RGB locus at key wavelengths', () => {
    // Outside visible → black
    expect(wavelengthToRgb(300)).toEqual([0, 0, 0]);
    expect(wavelengthToRgb(800)).toEqual([0, 0, 0]);

    // 439 nm: end of violet→blue ramp (blue peak 0.9)
    const at439 = wavelengthToRgb(439);
    expect(at439[1]).toBe(0);
    expect(at439[2]).toBeCloseTo(Math.pow(0.9, 0.8), 5);

    // 440 nm: start of cyan band (blue held at 0.75)
    const at440 = wavelengthToRgb(440);
    expect(at440[0]).toBe(0);
    expect(at440[1]).toBe(0);
    expect(at440[2]).toBeCloseTo(Math.pow(0.75, 0.8), 5);

    // 510 nm: green peak softened to 0.85 → after γ
    const at510 = wavelengthToRgb(510);
    expect(at510[0]).toBe(0);
    expect(at510[1]).toBeCloseTo(Math.pow(0.85, 0.8), 5);
    expect(at510[2]).toBe(0);

    // 645 nm: pure red at the start of the deep-red band (factor = 1)
    const at645 = wavelengthToRgb(645);
    expect(at645[0]).toBeCloseTo(1, 5);
    expect(at645[1]).toBe(0);
    expect(at645[2]).toBe(0);

    // Near-UV intensity falloff (factor starts at 0.15)
    expect(wavelengthToRgb(400)[2]).toBeLessThan(Math.pow(0.9, 0.8));
    // Mid green band uses 0.85 peak (not full 1.0)
    expect(wavelengthToRgb(550)[1]).toBeCloseTo(Math.pow(0.85, 0.8), 5);
    // Refined curve is less saturated in the violet peak than classic Academo
    expect(wavelengthToRgb(400)[2]).toBeLessThan(wavelengthToRgbAcademoOriginal(400)[2]);
  });

  it('exposes 8-bit RGB for UI previews', () => {
    const [r, g, b] = wavelengthToRgb255(500);
    expect(r).toBeGreaterThanOrEqual(0);
    expect(r).toBeLessThanOrEqual(255);
    expect(g).toBeGreaterThan(r);
    expect(b).toBeGreaterThan(0);
  });

  it('gives higher Rayleigh weight to blue than red', () => {
    expect(rayleighScatterWeight(450)).toBeGreaterThan(rayleighScatterWeight(650));
  });

  it('round-trips spectral λ → RGB → λ within a few nm', () => {
    // Skip the flat deep-red band (≥645 nm): maps to nearly the same RGB.
    for (const nm of [450, 532, 600]) {
      const rgb = wavelengthToRgb(nm);
      const back = rgbToWavelengthNm(rgb);
      expect(Math.abs(back - nm)).toBeLessThanOrEqual(3);
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
        laser: { w0M: 0.002, m2: 1.3, probeDistanceM: 10, ellipticRatio: 1, waistOffsetM: 0, topHatMix: 0, sphericalAberration: 0, coma: 0, astigmatism: 0 },
      },
    });
    expect(readout.quantities.some((q) => q.id === 'zR' && q.kind === 'calculated')).toBe(true);
    expect(readout.quantities.some((q) => q.id === 'rgb' && q.kind === 'approximated')).toBe(true);
    expect(readout.safetyNote).toBeTruthy();
  });
});
