import { describe, expect, it } from 'vitest';
import { hexToRgb, rgbToHex } from '../display/color';
import {
  deriveFromWavelengthNm,
  rayleighScatterWeight,
  rgbToWavelengthNm,
  wavelengthToRgb,
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

  it('maps green wavelength to green-dominant RGB', () => {
    const [r, g, b] = wavelengthToRgb(532);
    expect(g).toBeGreaterThan(r);
    expect(g).toBeGreaterThan(b);
  });

  it('gives higher Rayleigh weight to blue than red', () => {
    expect(rayleighScatterWeight(450)).toBeGreaterThan(rayleighScatterWeight(650));
  });

  it('round-trips spectral λ → RGB → λ within a few nm', () => {
    for (const nm of [450, 532, 650]) {
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
