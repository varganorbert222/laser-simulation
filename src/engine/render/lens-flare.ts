import { clampRange } from '../math/clamp';
import type { Vec3 } from '../math/vec3';

/**
 * Per-group screen-space lens flare look (presentation / render settings).
 * Separate packs for scene lights vs sun.
 */
export interface LensFlareGroupTune {
  /** Master enable for this group (global Quality.lensFlare must also be on). */
  enabled: boolean;
  /** HDR amplitude scale (0–4). */
  intensity: number;
  /** Ghost reflections weight (0–2). */
  ghosts: number;
  /** Anamorphic streaks weight (0–2). */
  streaks: number;
  /** Halo / aperture disc weight (0–2). */
  halo: number;
  /** Chromatic aberration amount (0–2). */
  chromatic: number;
  /** Procedural lens dirt amount (0–2). */
  dirt: number;
}

export function defaultLensFlareLightsTune(): LensFlareGroupTune {
  return {
    enabled: true,
    intensity: 1,
    ghosts: 1,
    streaks: 1,
    halo: 1,
    chromatic: 1,
    dirt: 0.85,
  };
}

export function defaultLensFlareSunTune(): LensFlareGroupTune {
  return {
    enabled: true,
    intensity: 1.15,
    ghosts: 1.1,
    streaks: 0.85,
    halo: 1.25,
    chromatic: 0.75,
    dirt: 1,
  };
}

function clampFlare01to2(v: number, fallback: number): number {
  return clampRange(v, 0, 2, fallback);
}

function clampFlareIntensity(v: number, fallback: number): number {
  return clampRange(v, 0, 4, fallback);
}

export function normalizeLensFlareGroupTune(
  raw: Partial<LensFlareGroupTune> | null | undefined,
  fallback: LensFlareGroupTune,
): LensFlareGroupTune {
  return {
    enabled: typeof raw?.enabled === 'boolean' ? raw.enabled : fallback.enabled,
    intensity: clampFlareIntensity(
      typeof raw?.intensity === 'number' ? raw.intensity : fallback.intensity,
      fallback.intensity,
    ),
    ghosts: clampFlare01to2(
      typeof raw?.ghosts === 'number' ? raw.ghosts : fallback.ghosts,
      fallback.ghosts,
    ),
    streaks: clampFlare01to2(
      typeof raw?.streaks === 'number' ? raw.streaks : fallback.streaks,
      fallback.streaks,
    ),
    halo: clampFlare01to2(
      typeof raw?.halo === 'number' ? raw.halo : fallback.halo,
      fallback.halo,
    ),
    chromatic: clampFlare01to2(
      typeof raw?.chromatic === 'number' ? raw.chromatic : fallback.chromatic,
      fallback.chromatic,
    ),
    dirt: clampFlare01to2(
      typeof raw?.dirt === 'number' ? raw.dirt : fallback.dirt,
      fallback.dirt,
    ),
  };
}

/**
 * Emission-axis weight for screen-space lens flare.
 * Omni / point → 1 from every view direction.
 * Directional (laser, spot, parallel, sun) → only when the beam faces the camera
 * (`lightDir · normalize(cam − light) > 0`), with a soft hemisphere edge.
 */
export function lensFlareFacingWeight(
  lightDir: Vec3,
  lightWorld: Vec3,
  camWorld: Vec3,
  omni: boolean,
): number {
  if (omni) return 1;
  const toCamX = camWorld[0] - lightWorld[0];
  const toCamY = camWorld[1] - lightWorld[1];
  const toCamZ = camWorld[2] - lightWorld[2];
  const toLen = Math.hypot(toCamX, toCamY, toCamZ);
  if (toLen < 1e-5) return 0;
  const dLen = Math.hypot(lightDir[0], lightDir[1], lightDir[2]) || 1;
  const facing =
    (lightDir[0] * toCamX + lightDir[1] * toCamY + lightDir[2] * toCamZ) /
    (dLen * toLen);
  if (facing < 0.02) return 0;
  const t = Math.min(1, Math.max(0, (facing - 0.02) / 0.33));
  return t * t * (3 - 2 * t);
}
