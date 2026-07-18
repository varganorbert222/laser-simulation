/**
 * @deprecated Import from `./surface-material` or `./light-presentation`.
 * Kept as re-exports for older import paths.
 */

export {
  SURFACE_FINISH_PRESETS as FIXTURE_FINISH_PRESETS,
  SURFACE_FINISH_PRESETS,
  apertureCouplingFromLegacyMaterial,
  clampUnit,
  defaultFixtureSurface,
  defaultGroundSurfaceMaterial,
  defaultSurfaceMaterial,
  fixtureSurfaceFromPreset,
  isFixtureFinishPreset,
  isSurfaceFinishPreset,
  normalizeFixtureSurface,
  normalizeSurfaceMaterial,
  specularLike,
  surfaceMaterialFromPreset,
  type FixtureFinishPreset,
  type LegacyFixtureSurfaceMaterial,
  type SurfaceFinishPreset,
  type SurfaceMaterial,
} from './surface-material';

export {
  deriveBloomContribution,
  deriveGlowContribution,
  deriveHousingGlowScale,
} from './light-presentation';
