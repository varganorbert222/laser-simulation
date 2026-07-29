import { describe, expect, it } from 'vitest';
import { surfaceBrdfWeights } from './beam-model';
import { defaultGroundSurfaceMaterial, surfaceMaterialFromPreset } from './surface-material';
import { gaussianTem00Profile } from './laser';
import { laserSpotTerms } from './surface-spot';

describe('surface spot BRDF', () => {
  it('maps chrome to high reflectivity / low absorption / high shininess', () => {
    const chrome = surfaceBrdfWeights(surfaceMaterialFromPreset('chrome'));
    const matte = surfaceBrdfWeights(surfaceMaterialFromPreset('matte_black'));
    expect(chrome.reflectivity).toBeGreaterThan(matte.reflectivity);
    expect(chrome.absorption).toBeLessThan(matte.absorption);
    expect(chrome.shininess).toBeGreaterThan(matte.shininess);
  });

  it('roughness 0 keeps shininess in a visible educational range', () => {
    const glossy = surfaceBrdfWeights({
      ...defaultGroundSurfaceMaterial(),
      albedo: 1,
      metalness: 0.4,
      roughness: 0,
    });
    expect(glossy.shininess).toBeLessThanOrEqual(64);
    expect(glossy.shininess).toBeGreaterThanOrEqual(40);
    expect(glossy.specularWeight).toBeGreaterThan(0.3);
  });

  it('anodized aluminum keeps mid gloss (soft specular still possible)', () => {
    const al = surfaceBrdfWeights(surfaceMaterialFromPreset('anodized_aluminum'));
    expect(al.shininess).toBeGreaterThan(20);
    expect(al.shininess).toBeLessThan(50);
    expect(al.specularWeight).toBeGreaterThan(0.15);
  });

  it('Gaussian is brightest on axis', () => {
    expect(gaussianTem00Profile(0, 0.01)).toBeCloseTo(1, 5);
    expect(gaussianTem00Profile(0.01, 0.01)).toBeLessThan(0.4);
  });

  it('Lambert diffuse is view-independent (same nDotL, any view)', () => {
    const mat = surfaceBrdfWeights(surfaceMaterialFromPreset('painted_plastic'));
    const base = {
      powerDisplay: 1,
      radialM: 0,
      beamRadiusM: 0.01,
      nDotL: 0.85,
      absorption: mat.absorption,
      albedo: mat.albedo,
      metalness: mat.metalness,
      roughness: mat.roughness,
    };
    const a = laserSpotTerms({ ...base, nDotV: 1, nDotH: 0.1 });
    const b = laserSpotTerms({ ...base, nDotV: 0.2, nDotH: 0.1 });
    expect(a.diffuse).toBeCloseTo(b.diffuse, 10);
  });

  it('specular term changes with view / half-vector (physics)', () => {
    const glossy = surfaceBrdfWeights({
      preset: 'custom',
      albedo: 1,
      metalness: 0.5,
      roughness: 0.05,
      transmission: 0,
    });
    const base = {
      powerDisplay: 1,
      radialM: 0,
      beamRadiusM: 0.01,
      nDotL: 0.9,
      absorption: glossy.absorption,
      albedo: glossy.albedo,
      metalness: glossy.metalness,
      roughness: glossy.roughness,
    };
    const on = laserSpotTerms({ ...base, nDotV: 0.9, nDotH: 0.98 });
    const off = laserSpotTerms({ ...base, nDotV: 0.9, nDotH: 0.2 });
    expect(on.specular).toBeGreaterThan(off.specular);
    expect(on.diffuse).toBeCloseTo(off.diffuse, 10);
  });

  it('spot vanishes without irradiance (nDotL=0)', () => {
    const matte = surfaceBrdfWeights(surfaceMaterialFromPreset('painted_plastic'));
    expect(
      laserSpotTerms({
        powerDisplay: 1,
        radialM: 0,
        beamRadiusM: 0.01,
        nDotL: 0,
        nDotV: 1,
        nDotH: 1,
        absorption: matte.absorption,
        shininess: matte.shininess,
        diffuseWeight: matte.diffuseWeight,
        specularWeight: matte.specularWeight,
      }).total,
    ).toBe(0);
  });

  it('darker materials absorb more', () => {
    const chrome = surfaceBrdfWeights(surfaceMaterialFromPreset('chrome'));
    const black = surfaceBrdfWeights(surfaceMaterialFromPreset('matte_black'));
    expect(chrome.reflectivity * (1 - chrome.absorption)).toBeGreaterThan(
      black.reflectivity * (1 - black.absorption),
    );
  });
});
