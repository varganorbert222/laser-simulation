import { describe, expect, it } from 'vitest';
import {
  clampSpill01,
  defaultOpticsSpill,
  hasOpticsSpill,
  normalizeOpticsSpill,
} from './optics-spill';

describe('optics spill', () => {
  it('defaults are subtle but non-zero', () => {
    const d = defaultOpticsSpill();
    expect(d.strayLight).toBeGreaterThan(0);
    expect(d.internalReflection).toBeGreaterThan(0);
    expect(d.apertureSpill).toBeGreaterThan(0);
    expect(hasOpticsSpill(d)).toBe(true);
  });

  it('normalizes missing / invalid fields', () => {
    expect(normalizeOpticsSpill(undefined).strayLight).toBe(defaultOpticsSpill().strayLight);
    expect(normalizeOpticsSpill({ strayLight: 2 }).strayLight).toBe(1);
    expect(normalizeOpticsSpill({ strayLight: -1 }).strayLight).toBe(0);
    expect(clampSpill01(Number.NaN)).toBe(0);
  });
});
