import { describe, expect, it } from 'vitest';
import {
  POWER_PRESETS_W,
  POWER_W_MAX,
  clampPowerW,
  formatPowerW,
  powerFromUnit,
  powerToUnit,
  powerWFromSliderT,
  sliderTFromPowerW,
} from './power';

describe('power units', () => {
  it('clamps custom power to 1 kW', () => {
    expect(POWER_W_MAX).toBe(1_000);
    expect(clampPowerW(2_000)).toBe(1_000);
    expect(clampPowerW(-1)).toBe(0);
  });

  it('presets top out at 50 W (no kW chips)', () => {
    expect(Math.max(...POWER_PRESETS_W)).toBe(50);
    expect(POWER_PRESETS_W.every((p) => p <= 50)).toBe(true);
  });

  it('converts mW / W / kW', () => {
    expect(powerFromUnit(1, 'kW')).toBe(1_000);
    expect(powerFromUnit(5, 'kW')).toBe(1_000); // clamped
    expect(powerToUnit(1_000, 'kW')).toBe(1);
    expect(powerFromUnit(5, 'mW')).toBeCloseTo(0.005);
    expect(formatPowerW(1_000)).toContain('kW');
    expect(formatPowerW(50)).toContain('W');
    expect(formatPowerW(0.005)).toContain('mW');
  });

  it('round-trips log slider ends', () => {
    expect(powerWFromSliderT(0)).toBeCloseTo(0.001, 6);
    expect(powerWFromSliderT(1)).toBe(POWER_W_MAX);
    expect(sliderTFromPowerW(POWER_W_MAX)).toBeCloseTo(1, 5);
  });
});
