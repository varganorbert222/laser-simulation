/**
 * Derive scene ambientLevel [0,1] from solar elevation (SPA).
 * Used when Atmosphere (procedural sky) is enabled — replaces the Vision slider.
 *
 * Elevation bands (approx. civil / nautical twilight):
 *   ≤ −12°  night floor
 *   −12…0°  twilight ramp
 *   0…90°   day (sin toward zenith)
 */
import { clampAmbientLevel } from './environment-lighting';

/** Ambient at deep night (sun well below horizon). */
export const AMBIENT_NIGHT_FLOOR = 0.04;

/** Ambient at geometric sunrise / sunset (elevation = 0). */
export const AMBIENT_HORIZON = 0.28;

/** Ambient with sun at zenith. */
export const AMBIENT_ZENITH = 1;

/**
 * Map solar elevation (degrees above horizon) → ambientLevel in [0, 1].
 */
export function ambientFromSolarElevation(elevationDeg: number): number {
  if (!Number.isFinite(elevationDeg)) return AMBIENT_HORIZON;
  const elev = Math.max(-90, Math.min(90, elevationDeg));

  if (elev <= -12) {
    // Astronomical night — slight lift toward nautical twilight.
    const t = Math.max(0, (elev + 18) / 6);
    return clampAmbientLevel(AMBIENT_NIGHT_FLOOR * (0.75 + 0.25 * t));
  }

  if (elev < 0) {
    // Civil / nautical twilight: smoothstep −12° → 0°.
    const u = (elev + 12) / 12;
    const s = u * u * (3 - 2 * u);
    return clampAmbientLevel(AMBIENT_NIGHT_FLOOR + s * (AMBIENT_HORIZON - AMBIENT_NIGHT_FLOOR));
  }

  // Day: sin elevation toward zenith (physical-ish daylight curve).
  const day = Math.sin((elev / 90) * (Math.PI / 2));
  return clampAmbientLevel(AMBIENT_HORIZON + day * (AMBIENT_ZENITH - AMBIENT_HORIZON));
}
