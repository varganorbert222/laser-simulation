/**
 * Solar Position Algorithm (SPA) — Julian day → azimuth / elevation → world direction.
 *
 * Azimuth: degrees clockwise from geographic north (0° = +Z north, 90° = +X east).
 * Elevation: degrees above the local horizon.
 * World: Y-up. Light travel direction (Babylon DirectionalLight) = −towardSun.
 *
 * Formulas follow the NOAA / NREL SPA geometric core (sufficient for skybox fidelity;
 * refraction is applied as a simple Saemundsson correction near the horizon).
 */

export interface SolarPositionInput {
  /** UTC milliseconds since epoch. */
  utcMs: number;
  latitudeDeg: number;
  longitudeDeg: number;
}

export interface SolarPosition {
  /** Degrees clockwise from north. */
  azimuthDeg: number;
  /** Degrees above horizon (−90…+90). */
  elevationDeg: number;
  /** Unit vector toward the sun (Y-up). */
  towardSun: readonly [number, number, number];
  /** Unit vector of light travel (from sun into scene) — matches engine env sun. */
  lightDirWorld: readonly [number, number, number];
  /** True when the geometric center is above the horizon. */
  aboveHorizon: boolean;
}

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

/** Julian Day Number (UTC) from Unix epoch ms. */
export function julianDayFromUtcMs(utcMs: number): number {
  return utcMs / 86_400_000 + 2_440_587.5;
}

function clampLat(lat: number): number {
  return Math.max(-90, Math.min(90, lat));
}

function wrap360(deg: number): number {
  const x = deg % 360;
  return x < 0 ? x + 360 : x;
}

/**
 * Apparent solar position at a geographic site.
 * Accuracy ~0.01° for visual use across 1950–2050.
 */
export function computeSolarPosition(input: SolarPositionInput): SolarPosition {
  const lat = clampLat(input.latitudeDeg) * DEG;
  const lon = input.longitudeDeg; // degrees, east positive
  const jd = julianDayFromUtcMs(input.utcMs);
  const T = (jd - 2_451_545.0) / 36_525.0;

  // Geometric mean longitude / anomaly of the Sun (degrees).
  let L0 = wrap360(280.46646 + T * (36_000.76983 + T * 0.0003032));
  const M = wrap360(357.52911 + T * (35_999.05029 - 0.0001537 * T));
  const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);

  const Mr = M * DEG;
  const C =
    Math.sin(Mr) * (1.914602 - T * (0.004817 + 0.000014 * T)) +
    Math.sin(2 * Mr) * (0.019993 - 0.000101 * T) +
    Math.sin(3 * Mr) * 0.000289;

  const sunTrueLong = L0 + C;
  const sunAppLong =
    sunTrueLong -
    0.00569 -
    0.00478 * Math.sin((125.04 - 1934.136 * T) * DEG);

  const obl0 = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60;
  const oblCorr = obl0 + 0.00256 * Math.cos((125.04 - 1934.136 * T) * DEG);
  const obl = oblCorr * DEG;
  const lambda = sunAppLong * DEG;

  const sinDec = Math.sin(obl) * Math.sin(lambda);
  const decl = Math.asin(sinDec);
  const cosDec = Math.cos(decl);

  // Equation of time (minutes).
  const y = Math.tan(obl * 0.5) ** 2;
  const L0r = L0 * DEG;
  const eqTime =
    4 *
    RAD *
    (y * Math.sin(2 * L0r) -
      2 * e * Math.sin(Mr) +
      4 * e * y * Math.sin(Mr) * Math.cos(2 * L0r) -
      0.5 * y * y * Math.sin(4 * L0r) -
      1.25 * e * e * Math.sin(2 * Mr));

  const minutes = ((input.utcMs % 86_400_000) + 86_400_000) % 86_400_000 / 60_000;
  const trueSolarTime = (minutes + eqTime + 4 * lon) % 1440;
  let hourAngle = trueSolarTime / 4 - 180;
  if (hourAngle < -180) hourAngle += 360;
  const ha = hourAngle * DEG;

  const cosZen =
    Math.sin(lat) * sinDec + Math.cos(lat) * cosDec * Math.cos(ha);
  let zenith = Math.acos(Math.max(-1, Math.min(1, cosZen))) * RAD;

  // Azimuth from north, clockwise.
  const azY = -Math.sin(ha);
  const azX = Math.tan(decl) * Math.cos(lat) - Math.sin(lat) * Math.cos(ha);
  let azimuth = Math.atan2(azY, azX) * RAD;
  azimuth = wrap360(azimuth);

  // Refraction correction (degrees) — Saemundsson approx for apparent elevation.
  const elevGeom = 90 - zenith;
  let refraction = 0;
  if (elevGeom > -0.575) {
    const eRad = elevGeom * DEG;
    refraction =
      1.02 /
      Math.tan(eRad + 10.3 / (elevGeom + 5.11) * DEG) /
      60;
  }
  const elevation = elevGeom + refraction;
  zenith = 90 - elevation;

  const el = elevation * DEG;
  const az = azimuth * DEG;
  const towardSun: [number, number, number] = [
    Math.sin(az) * Math.cos(el),
    Math.sin(el),
    Math.cos(az) * Math.cos(el),
  ];
  const len = Math.hypot(towardSun[0], towardSun[1], towardSun[2]) || 1;
  towardSun[0] /= len;
  towardSun[1] /= len;
  towardSun[2] /= len;

  const lightDirWorld: [number, number, number] = [
    -towardSun[0],
    -towardSun[1],
    -towardSun[2],
  ];

  return {
    azimuthDeg: azimuth,
    elevationDeg: elevation,
    towardSun,
    lightDirWorld,
    aboveHorizon: elevation > 0,
  };
}

/** Build UTC ms from civil local date/time + timezone offset (hours east of UTC). */
export function utcMsFromLocalCivil(opts: {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second?: number;
  timezoneOffsetHours: number;
}): number {
  const sec = opts.second ?? 0;
  // Treat components as UTC then subtract offset → local wall clock.
  const utc = Date.UTC(
    opts.year,
    opts.month - 1,
    opts.day,
    opts.hour,
    opts.minute,
    sec,
  );
  return utc - opts.timezoneOffsetHours * 3_600_000;
}

/** Inverse: local civil parts from UTC ms + timezone. */
export function localCivilFromUtcMs(
  utcMs: number,
  timezoneOffsetHours: number,
): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
} {
  const local = new Date(utcMs + timezoneOffsetHours * 3_600_000);
  return {
    year: local.getUTCFullYear(),
    month: local.getUTCMonth() + 1,
    day: local.getUTCDate(),
    hour: local.getUTCHours(),
    minute: local.getUTCMinutes(),
    second: local.getUTCSeconds(),
  };
}
