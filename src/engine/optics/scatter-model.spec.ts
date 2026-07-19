import { describe, expect, it } from 'vitest';
import { rayleighScatterWeight } from './wavelength';
import {
  clampParticleSizeNm,
  defaultMieAnisotropy,
  defaultParticleSizeNm,
  mediaSpectralExponent,
  phaseHG,
  spectralWeightFromRayleigh,
} from './scatter-model';

describe('scatter model', () => {
  it('defaults particle size by regime', () => {
    expect(defaultParticleSizeNm('rayleigh')).toBeLessThan(10);
    expect(defaultParticleSizeNm('tyndall')).toBeGreaterThanOrEqual(10);
  });

  it('Rayleigh uses λ⁻⁴; Tyndall is nearly flat', () => {
    expect(mediaSpectralExponent('rayleigh', 1)).toBe(4);
    expect(mediaSpectralExponent('tyndall', 200)).toBeLessThan(0.5);
    expect(mediaSpectralExponent('tyndall', 1000)).toBeLessThan(
      mediaSpectralExponent('tyndall', 20),
    );
  });

  it('remaps Rayleigh weight to milder Tyndall curve', () => {
    const blue = rayleighScatterWeight(450);
    const red = rayleighScatterWeight(650);
    expect(blue).toBeGreaterThan(red);

    const tyndallBlue = spectralWeightFromRayleigh(blue, 0.1);
    const tyndallRed = spectralWeightFromRayleigh(red, 0.1);
    expect(Math.abs(tyndallBlue - tyndallRed)).toBeLessThan(Math.abs(blue - red) * 0.2);
    expect(spectralWeightFromRayleigh(blue, 4)).toBeCloseTo(blue, 10);
    expect(spectralWeightFromRayleigh(blue, 0)).toBe(1);
  });

  it('clamps particle size', () => {
    expect(clampParticleSizeNm(-1)).toBe(0.1);
    expect(clampParticleSizeNm(5000)).toBe(1000);
  });

  it('Henyey–Greenstein is isotropic at g=0 and forward-peaked for fog g', () => {
    const inv4pi = 1 / (4 * Math.PI);
    expect(phaseHG(0, 0)).toBeCloseTo(inv4pi, 6);
    expect(phaseHG(1, 0)).toBeCloseTo(inv4pi, 6);
    expect(phaseHG(-1, 0)).toBeCloseTo(inv4pi, 6);

    const g = defaultMieAnisotropy('tyndall', 200);
    expect(g).toBeGreaterThan(0.7);
    const forward = phaseHG(1, g);
    const side = phaseHG(0, g);
    const back = phaseHG(-1, g);
    expect(forward).toBeGreaterThan(side);
    expect(side).toBeGreaterThan(back);
  });

  it('Rayleigh default Mie g is isotropic', () => {
    expect(defaultMieAnisotropy('rayleigh')).toBe(0);
  });
});
