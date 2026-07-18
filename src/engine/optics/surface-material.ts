/**
 * Attachable surface appearance (PBR-ish knobs) for any entity.
 * Educational / display-oriented — not a calibrated radiometric BRDF.
 */

export type SurfaceFinishPreset =
  | 'matte_black'
  | 'anodized_aluminum'
  | 'painted_plastic'
  | 'brushed_metal'
  | 'chrome'
  | 'custom';

/** @deprecated Use SurfaceFinishPreset */
export type FixtureFinishPreset = SurfaceFinishPreset;

export const SURFACE_FINISH_PRESETS: readonly Exclude<SurfaceFinishPreset, 'custom'>[] = [
  'matte_black',
  'anodized_aluminum',
  'painted_plastic',
  'brushed_metal',
  'chrome',
] as const;

/** @deprecated Use SURFACE_FINISH_PRESETS */
export const FIXTURE_FINISH_PRESETS = SURFACE_FINISH_PRESETS;

export interface SurfaceMaterial {
  preset: SurfaceFinishPreset;
  /** Diffuse / base color albedo 0–1. */
  albedo: number;
  /** Metalness 0–1. */
  metalness: number;
  /** Roughness 0–1 (smooth → sharp specular). */
  roughness: number;
}

/** Legacy nested shape on LightEmitter saves (may include housingCoupling). */
export type LegacyFixtureSurfaceMaterial = Partial<SurfaceMaterial> & {
  housingCoupling?: number;
};

const PRESET_TABLE: Record<
  Exclude<SurfaceFinishPreset, 'custom'>,
  Omit<SurfaceMaterial, 'preset'>
> = {
  matte_black: { albedo: 0.06, metalness: 0.05, roughness: 0.85 },
  anodized_aluminum: { albedo: 0.28, metalness: 0.75, roughness: 0.45 },
  painted_plastic: { albedo: 0.22, metalness: 0.0, roughness: 0.7 },
  brushed_metal: { albedo: 0.35, metalness: 0.9, roughness: 0.55 },
  chrome: { albedo: 0.55, metalness: 1.0, roughness: 0.12 },
};

/** Default aperture coupling when migrating old housingCoupling presets. */
const PRESET_APERTURE_COUPLING: Record<Exclude<SurfaceFinishPreset, 'custom'>, number> = {
  matte_black: 0.35,
  anodized_aluminum: 0.4,
  painted_plastic: 0.45,
  brushed_metal: 0.38,
  chrome: 0.55,
};

export function clampUnit(v: number, fallback = 0): number {
  if (!Number.isFinite(v)) return fallback;
  return Math.min(1, Math.max(0, v));
}

export function surfaceMaterialFromPreset(
  preset: Exclude<SurfaceFinishPreset, 'custom'>,
): SurfaceMaterial {
  return { preset, ...PRESET_TABLE[preset] };
}

/** @deprecated Use surfaceMaterialFromPreset */
export function fixtureSurfaceFromPreset(
  preset: Exclude<SurfaceFinishPreset, 'custom'>,
): SurfaceMaterial {
  return surfaceMaterialFromPreset(preset);
}

export function defaultSurfaceMaterial(): SurfaceMaterial {
  return surfaceMaterialFromPreset('anodized_aluminum');
}

/** Neutral floor / environment default. */
export function defaultGroundSurfaceMaterial(): SurfaceMaterial {
  return {
    preset: 'custom',
    albedo: 0.18,
    metalness: 0.05,
    roughness: 0.82,
  };
}

/** @deprecated Use defaultSurfaceMaterial */
export function defaultFixtureSurface(): SurfaceMaterial {
  return defaultSurfaceMaterial();
}

export function isSurfaceFinishPreset(value: unknown): value is SurfaceFinishPreset {
  return (
    value === 'matte_black' ||
    value === 'anodized_aluminum' ||
    value === 'painted_plastic' ||
    value === 'brushed_metal' ||
    value === 'chrome' ||
    value === 'custom'
  );
}

/** @deprecated Use isSurfaceFinishPreset */
export const isFixtureFinishPreset = isSurfaceFinishPreset;

export function normalizeSurfaceMaterial(
  raw: Partial<SurfaceMaterial> | LegacyFixtureSurfaceMaterial | null | undefined,
): SurfaceMaterial {
  const d = defaultSurfaceMaterial();
  if (!raw || typeof raw !== 'object') return d;
  const preset = isSurfaceFinishPreset(raw.preset) ? raw.preset : d.preset;
  if (preset !== 'custom') {
    const hasCustom =
      typeof raw.albedo === 'number' ||
      typeof raw.metalness === 'number' ||
      typeof raw.roughness === 'number';
    if (!hasCustom) return surfaceMaterialFromPreset(preset);
  }
  return {
    preset,
    albedo: clampUnit(typeof raw.albedo === 'number' ? raw.albedo : d.albedo, d.albedo),
    metalness: clampUnit(
      typeof raw.metalness === 'number' ? raw.metalness : d.metalness,
      d.metalness,
    ),
    roughness: clampUnit(
      typeof raw.roughness === 'number' ? raw.roughness : d.roughness,
      d.roughness,
    ),
  };
}

/** @deprecated Use normalizeSurfaceMaterial */
export function normalizeFixtureSurface(
  raw: Partial<SurfaceMaterial> | LegacyFixtureSurfaceMaterial | null | undefined,
): SurfaceMaterial {
  return normalizeSurfaceMaterial(raw);
}

export function apertureCouplingFromLegacyMaterial(
  raw: LegacyFixtureSurfaceMaterial | null | undefined,
  fallback = 0.4,
): number {
  if (!raw || typeof raw !== 'object') return fallback;
  if (typeof raw.housingCoupling === 'number') {
    return clampUnit(raw.housingCoupling, fallback);
  }
  if (isSurfaceFinishPreset(raw.preset) && raw.preset !== 'custom') {
    return PRESET_APERTURE_COUPLING[raw.preset];
  }
  return fallback;
}

/** Specular-like energy 0–1 for bloom weighting. */
export function specularLike(m: SurfaceMaterial): number {
  const n = normalizeSurfaceMaterial(m);
  return (
    n.metalness * (0.25 + 0.75 * (1 - n.roughness)) +
    (1 - n.metalness) * 0.08 * (1 - n.roughness)
  );
}
