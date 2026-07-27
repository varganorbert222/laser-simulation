import { describe, expect, it } from 'vitest';
import {
  normalizeSurfaceMaterial,
  surfaceMaterialFromPreset,
} from './surface-material';
import {
  deriveBloomContribution,
  deriveHousingGlowScale,
} from './light-presentation';

describe('surface material', () => {
  it('normalizes unknown preset to default', () => {
    const m = normalizeSurfaceMaterial({ preset: 'nope' as never });
    expect(m.preset).toBe('anodized_aluminum');
  });

  it('loads preset knobs without housingCoupling', () => {
    const chrome = surfaceMaterialFromPreset('chrome');
    expect(chrome.metalness).toBe(1);
    expect(chrome.roughness).toBeCloseTo(0.12);
    expect('housingCoupling' in chrome).toBe(false);
  });

  it('glass_clear is dielectric with high transmission', () => {
    const glass = surfaceMaterialFromPreset('glass_clear');
    expect(glass.transmission).toBeGreaterThan(0.8);
    expect(glass.metalness).toBeLessThan(0.1);
    expect(glass.roughness).toBeLessThan(0.15);
  });
});

describe('housing glow / bloom', () => {
  it('chrome housing glows more than matte at same coupling', () => {
    const chrome = surfaceMaterialFromPreset('chrome');
    const matte = surfaceMaterialFromPreset('matte_black');
    const chromeGlow = deriveHousingGlowScale(chrome, 0.5, 1, 1);
    const matteGlow = deriveHousingGlowScale(matte, 0.5, 1, 1);
    expect(chromeGlow).toBeGreaterThan(matteGlow);
  });

  it('chrome blooms more than matte via specular boost', () => {
    const chrome = deriveBloomContribution(1, 1, surfaceMaterialFromPreset('chrome'));
    const matte = deriveBloomContribution(1, 1, surfaceMaterialFromPreset('matte_black'));
    expect(chrome).toBeGreaterThan(matte);
  });
});
