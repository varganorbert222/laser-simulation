import { describe, expect, it } from 'vitest';
import {
  clampSpill01,
  defaultOpticsSpill,
  hasOpticsSpill,
  normalizeOpticsSpill,
  OPTICS_SPILL_MAX,
  spillToGpuWeights,
} from './optics-spill';

describe('optics spill', () => {
  it('defaults are subtle but non-zero', () => {
    const d = defaultOpticsSpill();
    expect(d.strayPowerFraction).toBeGreaterThan(0);
    expect(d.strayPowerFraction).toBeLessThanOrEqual(OPTICS_SPILL_MAX);
    expect(hasOpticsSpill(d)).toBe(true);
  });

  it('normalizes missing / invalid fields', () => {
    expect(normalizeOpticsSpill(undefined).strayPowerFraction).toBe(
      defaultOpticsSpill().strayPowerFraction,
    );
    expect(normalizeOpticsSpill({ strayPowerFraction: 2 }).strayPowerFraction).toBe(
      OPTICS_SPILL_MAX,
    );
    expect(normalizeOpticsSpill({ strayPowerFraction: -1 }).strayPowerFraction).toBe(0);
    expect(clampSpill01(Number.NaN)).toBe(0);
  });

  it('migrates legacy three-channel spill into one fraction', () => {
    const n = normalizeOpticsSpill({
      strayLight: 1,
      internalReflection: 1,
      apertureSpill: 1,
    });
    expect(n.strayPowerFraction).toBeGreaterThan(0);
    expect(n.strayPowerFraction).toBeLessThanOrEqual(OPTICS_SPILL_MAX);
  });

  it('packs GPU weights from the single fraction', () => {
    const [a, b, c] = spillToGpuWeights({ strayPowerFraction: 0.2 });
    expect(a).toBeCloseTo(0.2);
    expect(b).toBeLessThanOrEqual(a);
    expect(c).toBeLessThanOrEqual(a * 1.01);
  });
});
