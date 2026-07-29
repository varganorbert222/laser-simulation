/**
 * Surface-spot helpers (CPU twin of SurfaceRadiancePlugin):
 * - TEM00 étendue irradiance
 * - Lambert diffuse + GGX Cook–Torrance specular
 */

import { clamp01 } from '../../math/clamp';
import { evaluateMicrofacetBrdf } from './microfacet-brdf';
import { gaussianTem00Profile } from './laser';

/**
 * Separate diffuse (view-independent) and specular (view-dependent) spot terms.
 * Irradiance E = P · (2/(π w²)) · TEM00, then × microfacet BRDF.
 */
export function laserSpotTerms(input: {
  powerDisplay: number;
  radialM: number;
  beamRadiusM: number;
  nDotL: number;
  nDotV: number;
  nDotH: number;
  /** V·H for Fresnel; defaults inside BRDF to nDotV if omitted. */
  vDotH?: number;
  absorption: number;
  albedo?: number;
  metalness?: number;
  roughness?: number;
  /** Mapped to roughness when roughness is omitted. */
  shininess?: number;
  diffuseWeight?: number;
  specularWeight?: number;
}): { diffuse: number; specular: number; total: number } {
  const nDotL = clamp01(input.nDotL);
  if (nDotL <= 1e-6) return { diffuse: 0, specular: 0, total: 0 };

  const w = Math.max(input.beamRadiusM, 1e-6);
  const profile = gaussianTem00Profile(input.radialM, w);
  const E0 = (2 * Math.max(0, input.powerDisplay)) / (Math.PI * w * w);
  const E = E0 * profile * nDotL;

  const albedo =
    input.albedo ??
    Math.max(input.diffuseWeight ?? 0.5, input.specularWeight ?? 0.04);
  const metalness =
    input.metalness ??
    clamp01((input.specularWeight ?? 0.04) > 0.2 ? 0.6 : 0);
  const roughness =
    input.roughness ??
    (input.shininess != null
      ? Math.max(0.04, 1 - (Math.min(64, input.shininess) - 8) / 56)
      : 0.4);

  const brdf = evaluateMicrofacetBrdf({
    nDotL,
    nDotV: input.nDotV,
    nDotH: input.nDotH,
    vDotH: input.vDotH,
    albedo,
    metalness,
    roughness,
    absorption: input.absorption,
  });

  return {
    diffuse: E * brdf.diffuse,
    specular: E * brdf.specular,
    total: E * brdf.total,
  };
}
