import { describe, expect, it } from 'vitest';
import {
  evaluateMicrofacetBrdf,
  ggxDistribution,
  schlickFresnel,
  specularF0,
} from './microfacet-brdf';
import {
  gaussianTem00Density,
  gaussianTem00Profile,
  m2FromParallelness,
  peakIrradiance,
} from '../beam/laser';
import { laserSpotTerms } from './surface-spot';

describe('TEM00 / étendue', () => {
  it('uses exp(−2 r²/w²) footprint', () => {
    expect(gaussianTem00Profile(0, 0.01)).toBeCloseTo(1, 5);
    // At r=w: exp(-2) ≈ 0.1353
    expect(gaussianTem00Profile(0.01, 0.01)).toBeCloseTo(Math.exp(-2), 5);
  });

  it('density integrates to ~1 over the plane (Monte Carlo disk)', () => {
    const w = 0.02;
    const R = 4 * w;
    const n = 80;
    let sum = 0;
    const dA = ((2 * R) / n) ** 2;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const x = -R + ((i + 0.5) * 2 * R) / n;
        const y = -R + ((j + 0.5) * 2 * R) / n;
        sum += gaussianTem00Density(Math.hypot(x, y), w) * dA;
      }
    }
    expect(sum).toBeGreaterThan(0.95);
    expect(sum).toBeLessThan(1.05);
  });

  it('peak irradiance E0 = 2P/(π w²)', () => {
    const P = 2;
    const w = 0.01;
    expect(peakIrradiance(P, w)).toBeCloseTo((2 * P) / (Math.PI * w * w), 6);
  });

  it('maps parallelness=1 → M²=1', () => {
    expect(m2FromParallelness(1)).toBe(1);
    expect(m2FromParallelness(0)).toBe(4);
  });
});

describe('GGX Cook–Torrance', () => {
  it('Fresnel peaks at grazing', () => {
    expect(schlickFresnel(1, 0.04)).toBeCloseTo(0.04, 5);
    expect(schlickFresnel(0, 0.04)).toBeCloseTo(1, 5);
  });

  it('metal has no diffuse; dielectric has diffuse', () => {
    const metal = evaluateMicrofacetBrdf({
      nDotL: 1,
      nDotV: 1,
      nDotH: 1,
      albedo: 0.9,
      metalness: 1,
      roughness: 0.2,
    });
    const diel = evaluateMicrofacetBrdf({
      nDotL: 1,
      nDotV: 1,
      nDotH: 1,
      albedo: 0.9,
      metalness: 0,
      roughness: 0.2,
    });
    expect(metal.diffuse).toBeLessThan(1e-6);
    expect(diel.diffuse).toBeGreaterThan(0.1);
  });

  it('rough surface widens GGX lobe vs smooth', () => {
    const smooth = ggxDistribution(0.7, 0.04 * 0.04);
    const rough = ggxDistribution(0.7, 0.8 * 0.8);
    expect(smooth).toBeLessThan(rough);
  });

  it('F0 blends dielectric→albedo with metalness', () => {
    expect(specularF0(0.8, 0)).toBeCloseTo(0.04, 5);
    expect(specularF0(0.8, 1)).toBeCloseTo(0.8, 5);
  });

  it('laser spot diffuse is view-independent', () => {
    const base = {
      powerDisplay: 1,
      radialM: 0,
      beamRadiusM: 0.01,
      nDotL: 0.9,
      absorption: 0.2,
      albedo: 0.7,
      metalness: 0,
      roughness: 0.5,
    };
    const a = laserSpotTerms({ ...base, nDotV: 1, nDotH: 0.2 });
    const b = laserSpotTerms({ ...base, nDotV: 0.3, nDotH: 0.2 });
    expect(a.diffuse).toBeCloseTo(b.diffuse, 8);
  });
});
