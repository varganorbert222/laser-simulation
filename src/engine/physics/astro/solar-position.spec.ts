import { describe, expect, it } from 'vitest';
import {
  computeSolarPosition,
  julianDayFromUtcMs,
  utcMsFromLocalCivil,
} from './solar-position';

describe('solar-position SPA', () => {
  it('julian day for known Unix epoch offset', () => {
    // 2000-01-01 12:00 UTC → JD 2451545.0
    const utc = Date.UTC(2000, 0, 1, 12, 0, 0);
    expect(julianDayFromUtcMs(utc)).toBeCloseTo(2_451_545.0, 4);
  });

  it('equator equinox noon: sun near zenith', () => {
    // 2026-03-20 ~12:00 local at lon 0, lat 0 (approx equinox)
    const utcMs = utcMsFromLocalCivil({
      year: 2026,
      month: 3,
      day: 20,
      hour: 12,
      minute: 0,
      timezoneOffsetHours: 0,
    });
    const p = computeSolarPosition({
      utcMs,
      latitudeDeg: 0,
      longitudeDeg: 0,
    });
    expect(p.elevationDeg).toBeGreaterThan(70);
    expect(p.aboveHorizon).toBe(true);
    expect(p.towardSun[1]).toBeGreaterThan(0.9);
  });

  it('Budapest summer solstice noon: high elevation ~66°', () => {
    const utcMs = utcMsFromLocalCivil({
      year: 2026,
      month: 6,
      day: 21,
      hour: 12,
      minute: 0,
      timezoneOffsetHours: 2,
    });
    const p = computeSolarPosition({
      utcMs,
      latitudeDeg: 47.5,
      longitudeDeg: 19.04,
    });
    // 90 − 47.5 + 23.4 ≈ 65.9° at solar noon
    expect(p.elevationDeg).toBeGreaterThan(55);
    expect(p.elevationDeg).toBeLessThan(75);
    expect(p.lightDirWorld[1]).toBeLessThan(0); // light travels downward
  });

  it('midnight midwinter: sun below horizon at 47°N', () => {
    const utcMs = utcMsFromLocalCivil({
      year: 2026,
      month: 12,
      day: 21,
      hour: 0,
      minute: 0,
      timezoneOffsetHours: 1,
    });
    const p = computeSolarPosition({
      utcMs,
      latitudeDeg: 47.5,
      longitudeDeg: 19.04,
    });
    expect(p.elevationDeg).toBeLessThan(0);
    expect(p.aboveHorizon).toBe(false);
  });
});
