import { clampRange } from '../math/clamp';
import type { Vec3 } from '../math/vec3';
import { MAX_FLARE_ELEMENTS } from './contract/slots';

/** Optical flare element shape (camera lens-group reflection). */
export type LensFlareElementKind = 'ghost' | 'streak' | 'halo';

/**
 * One lens-stack reflection / anamorphic artifact.
 * Count of active elements = list length (capped at {@link MAX_FLARE_ELEMENTS}).
 */
export interface LensFlareElement {
  kind: LensFlareElementKind;
  /** Overlay tint RGB (0–1), multiplied with the light color. */
  color: Vec3;
  /** Relative size scale (0.05–4). */
  size: number;
  /**
   * Position along light↔screen-center optical axis.
   * 0 = at the light, 1 = mirrored through the image center (lens reflection).
   * Used by ghost / halo; ignored for streak.
   */
  axis: number;
  /** Per-element amplitude (0–2). */
  weight: number;
}

/**
 * Shared camera optical profile for screen-space lens flare.
 * Applied identically to every flare source; lights/sun only scale intensity.
 */
export interface LensFlareOptics {
  /** Chromatic aberration scale (0–2). */
  chromatic: number;
  /** Procedural sensor/lens dirt modulation (0–2). */
  dirt: number;
  /** Ordered optical elements; length is the element count. */
  elements: LensFlareElement[];
}

/**
 * Per-group screen-space lens flare strength (presentation).
 * Optical look lives in {@link LensFlareOptics}.
 */
export interface LensFlareGroupTune {
  /** Master enable for this group (global Quality.lensFlare must also be on). */
  enabled: boolean;
  /** HDR amplitude scale (0–4). */
  intensity: number;
  /**
   * Volumetric buffer coupling (0–2). How much raymarch glow boosts the flare.
   * Spatially averaged + log-compressed to limit sparkle flicker.
   */
  volBloom: number;
}

export { MAX_FLARE_ELEMENTS };

const WHITE: Vec3 = [1, 1, 1];

function clampFlare01to2(v: number, fallback: number): number {
  return clampRange(v, 0, 2, fallback);
}

function clampFlareIntensity(v: number, fallback: number): number {
  return clampRange(v, 0, 4, fallback);
}

function clampFlareSize(v: number, fallback: number): number {
  return clampRange(v, 0.05, 4, fallback);
}

function clampFlareAxis(v: number, fallback: number): number {
  return clampRange(v, 0, 2, fallback);
}

function clampColorChannel(v: number, fallback: number): number {
  return clampRange(v, 0, 1, fallback);
}

function normalizeColor(raw: unknown, fallback: Vec3): Vec3 {
  if (!Array.isArray(raw) || raw.length < 3) return [...fallback] as Vec3;
  return [
    clampColorChannel(typeof raw[0] === 'number' ? raw[0] : fallback[0], fallback[0]),
    clampColorChannel(typeof raw[1] === 'number' ? raw[1] : fallback[1], fallback[1]),
    clampColorChannel(typeof raw[2] === 'number' ? raw[2] : fallback[2], fallback[2]),
  ];
}

function isLensFlareElementKind(v: unknown): v is LensFlareElementKind {
  return v === 'ghost' || v === 'streak' || v === 'halo';
}

/** GPU kind code: 0 ghost, 1 streak, 2 halo. */
export function lensFlareElementKindCode(kind: LensFlareElementKind): number {
  if (kind === 'streak') return 1;
  if (kind === 'halo') return 2;
  return 0;
}

export function createLensFlareElement(
  kind: LensFlareElementKind = 'ghost',
): LensFlareElement {
  if (kind === 'streak') {
    return { kind: 'streak', color: [...WHITE] as Vec3, size: 1, axis: 0, weight: 1.15 };
  }
  if (kind === 'halo') {
    return { kind: 'halo', color: [...WHITE] as Vec3, size: 1, axis: 1, weight: 1.15 };
  }
  return { kind: 'ghost', color: [...WHITE] as Vec3, size: 1, axis: 0.5, weight: 0.85 };
}

/**
 * Default stack recreates the previous baked kernel
 * (6 ghosts along the optical axis + streak + halo).
 */
export function defaultLensFlareOptics(): LensFlareOptics {
  const ghosts: LensFlareElement[] = [];
  for (let i = 1; i <= 6; i++) {
    const t = i / 6;
    const sharp = 90 + i * 55;
    const fall = (1 - t * 0.55) * (0.55 + (0.45 * (7 - i)) / 6);
    ghosts.push({
      kind: 'ghost',
      color: [...WHITE] as Vec3,
      size: clampFlareSize(180 / sharp, 1),
      axis: clampFlareAxis(t * 1.15, t),
      weight: clampFlare01to2(fall * 0.85, 0.5),
    });
  }
  return {
    chromatic: 1,
    dirt: 0.85,
    elements: [
      ...ghosts,
      createLensFlareElement('streak'),
      createLensFlareElement('halo'),
    ],
  };
}

export function defaultLensFlareLightsTune(): LensFlareGroupTune {
  return {
    enabled: true,
    intensity: 1.75,
    volBloom: 1.1,
  };
}

export function defaultLensFlareSunTune(): LensFlareGroupTune {
  return {
    enabled: true,
    intensity: 1.9,
    volBloom: 0.85,
  };
}

export function normalizeLensFlareElement(
  raw: Partial<LensFlareElement> | null | undefined,
  fallback: LensFlareElement = createLensFlareElement('ghost'),
): LensFlareElement {
  const kind = isLensFlareElementKind(raw?.kind) ? raw!.kind : fallback.kind;
  return {
    kind,
    color: normalizeColor(raw?.color, fallback.color),
    size: clampFlareSize(
      typeof raw?.size === 'number' ? raw.size : fallback.size,
      fallback.size,
    ),
    axis: clampFlareAxis(
      typeof raw?.axis === 'number' ? raw.axis : fallback.axis,
      fallback.axis,
    ),
    weight: clampFlare01to2(
      typeof raw?.weight === 'number' ? raw.weight : fallback.weight,
      fallback.weight,
    ),
  };
}

export function normalizeLensFlareOptics(
  raw: Partial<LensFlareOptics> | null | undefined,
  fallback: LensFlareOptics = defaultLensFlareOptics(),
): LensFlareOptics {
  const src = Array.isArray(raw?.elements) ? raw!.elements : fallback.elements;
  const elements: LensFlareElement[] = [];
  for (let i = 0; i < src.length && elements.length < MAX_FLARE_ELEMENTS; i++) {
    const item = src[i];
    if (!item || typeof item !== 'object') continue;
    elements.push(
      normalizeLensFlareElement(
        item as Partial<LensFlareElement>,
        fallback.elements[i] ?? createLensFlareElement('ghost'),
      ),
    );
  }
  return {
    chromatic: clampFlare01to2(
      typeof raw?.chromatic === 'number' ? raw.chromatic : fallback.chromatic,
      fallback.chromatic,
    ),
    dirt: clampFlare01to2(
      typeof raw?.dirt === 'number' ? raw.dirt : fallback.dirt,
      fallback.dirt,
    ),
    elements,
  };
}

export function normalizeLensFlareGroupTune(
  raw: Partial<LensFlareGroupTune> | null | undefined,
  fallback: LensFlareGroupTune,
): LensFlareGroupTune {
  // Drop unknown legacy fields (ghosts/streaks/halo/chromatic/dirt) — use LensFlareOptics.
  return {
    enabled: typeof raw?.enabled === 'boolean' ? raw.enabled : fallback.enabled,
    intensity: clampFlareIntensity(
      typeof raw?.intensity === 'number' ? raw.intensity : fallback.intensity,
      fallback.intensity,
    ),
    volBloom: clampFlare01to2(
      typeof raw?.volBloom === 'number' ? raw.volBloom : fallback.volBloom,
      fallback.volBloom,
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
