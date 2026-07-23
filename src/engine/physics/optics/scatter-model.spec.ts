import { describe, expect, it } from 'vitest';
import { rayleighScatterWeight } from './wavelength';
import {
  clampParticleSizeForModel,
  clampParticleSizeNm,
  defaultMieAnisotropy,
  defaultParticleSizeNm,
  mediaSpectralExponent,
  phaseHG,
  phaseRayleigh,
  spectralWeightFromRayleigh,
} from './scatter-model';

describe('scatter model', () => {
  it('defaults particle size aligned with media presets', () => {
    expect(defaultParticleSizeNm('rayleigh')).toBeCloseTo(0.3);
    expect(defaultParticleSizeNm('rayleigh')).toBeLessThan(10);
    expect(defaultParticleSizeNm('tyndall')).toBe(1000);
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

  it('clamps particle size by scatter regime', () => {
    expect(clampParticleSizeForModel('rayleigh', 500)).toBe(10);
    expect(clampParticleSizeForModel('tyndall', 1)).toBe(10);
    expect(clampParticleSizeForModel('tyndall', 250)).toBe(250);
  });

  it('Rayleigh phase is (3/16π)(1+μ²): forward=back, minimum at 90°', () => {
    const forward = phaseRayleigh(1);
    const side = phaseRayleigh(0);
    const back = phaseRayleigh(-1);
    expect(forward).toBeCloseTo(back, 10);
    expect(forward).toBeGreaterThan(side);
    expect(forward).toBeCloseTo((3 / (16 * Math.PI)) * 2, 10);
    expect(side).toBeCloseTo(3 / (16 * Math.PI), 10);
  });

  it('Henyey–Greenstein is isotropic at g=0 and mildly forward for fog g', () => {
    const inv4pi = 1 / (4 * Math.PI);
    expect(phaseHG(0, 0)).toBeCloseTo(inv4pi, 6);
    expect(phaseHG(1, 0)).toBeCloseTo(inv4pi, 6);
    expect(phaseHG(-1, 0)).toBeCloseTo(inv4pi, 6);

    const g = defaultMieAnisotropy('tyndall', 1000);
    expect(g).toBeGreaterThan(0.45);
    expect(g).toBeLessThan(0.65);
    const forward = phaseHG(1, g);
    const side = phaseHG(0, g);
    const back = phaseHG(-1, g);
    expect(forward).toBeGreaterThan(side);
    expect(side).toBeGreaterThan(back);
    expect(forward / back).toBeLessThan(80);
    expect(side / back).toBeGreaterThan(1.5);
    expect(side / inv4pi).toBeGreaterThan(0.35);
  });

  it('smoke-scale particles keep a milder g than fog', () => {
    const fogG = defaultMieAnisotropy('tyndall', 1000);
    const smokeG = defaultMieAnisotropy('tyndall', 250);
    expect(smokeG).toBeLessThan(fogG);
    expect(smokeG).toBeGreaterThan(0.3);
  });

  it('Rayleigh default Mie g is isotropic (unused; phaseRayleigh applies)', () => {
    expect(defaultMieAnisotropy('rayleigh')).toBe(0);
  });
});
