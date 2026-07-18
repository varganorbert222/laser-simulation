import { describe, expect, it } from 'vitest';
import {
  POWER_W_MAX,
  clampPowerW,
  formatPowerW,
  powerFromUnit,
  powerToUnit,
  powerWFromSliderT,
  sliderTFromPowerW,
} from './power';

describe('power units', () => {
  it('clamps to 500 kW', () => {
    expect(POWER_W_MAX).toBe(500_000);
    expect(clampPowerW(600_000)).toBe(500_000);
    expect(clampPowerW(-1)).toBe(0);
  });

  it('converts mW / W / kW', () => {
    expect(powerFromUnit(500, 'kW')).toBe(500_000);
    expect(powerToUnit(500_000, 'kW')).toBe(500);
    expect(powerFromUnit(5, 'mW')).toBeCloseTo(0.005);
    expect(formatPowerW(500_000)).toContain('kW');
    expect(formatPowerW(0.005)).toContain('mW');
  });

  it('round-trips log slider ends', () => {
    expect(powerWFromSliderT(0)).toBeCloseTo(0.001, 6);
    expect(powerWFromSliderT(1)).toBe(POWER_W_MAX);
    expect(sliderTFromPowerW(POWER_W_MAX)).toBeCloseTo(1, 5);
  });
});
