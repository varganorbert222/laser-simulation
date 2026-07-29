import { describe, expect, it } from 'vitest';
import {
  AMBIENT_HORIZON,
  AMBIENT_NIGHT_FLOOR,
  AMBIENT_ZENITH,
  ambientFromSolarElevation,
} from './ambient-from-solar';

describe('ambientFromSolarElevation', () => {
  it('is near night floor deep below the horizon', () => {
    expect(ambientFromSolarElevation(-30)).toBeLessThanOrEqual(AMBIENT_NIGHT_FLOOR + 0.02);
    expect(ambientFromSolarElevation(-12)).toBeCloseTo(AMBIENT_NIGHT_FLOOR, 2);
  });

  it('ramps through twilight toward horizon ambient', () => {
    const mid = ambientFromSolarElevation(-6);
    expect(mid).toBeGreaterThan(AMBIENT_NIGHT_FLOOR);
    expect(mid).toBeLessThan(AMBIENT_HORIZON);
    expect(ambientFromSolarElevation(0)).toBeCloseTo(AMBIENT_HORIZON, 2);
  });

  it('increases toward zenith during the day', () => {
    const morning = ambientFromSolarElevation(15);
    const noon = ambientFromSolarElevation(90);
    expect(morning).toBeGreaterThan(AMBIENT_HORIZON);
    expect(noon).toBeCloseTo(AMBIENT_ZENITH, 2);
    expect(noon).toBeGreaterThan(morning);
  });
});
