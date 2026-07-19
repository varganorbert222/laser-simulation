/**
 * Surface-spot helpers (CPU twin of SurfaceRadiancePlugin):
 * - TEM00 étendue irradiance
 * - Lambert diffuse + GGX Cook–Torrance specular
 */

import { evaluateMicrofacetBrdf } from './microfacet-brdf';
import {
  gaussianTem00Profile,
  laserBeamRadius,
  m2FromParallelness,
} from './laser';

export { schlickFresnel } from './microfacet-brdf';
export {
  gaussianTem00Profile as gaussianBeamProfile,
  peakIrradiance,
  gaussianTem00Density,
} from './laser';

export function materialSpotFactor(reflectivity: number, absorption: number): number {
  return Math.max(0, reflectivity) * Math.max(0, 1 - absorption);
}

/** Fresnel-like term (1 − N·V)^power — used by Schlick and tests. */
export function fresnelTerm(nDotV: number, power = 5): number {
  const x = 1 - Math.min(1, Math.max(0, nDotV));
  return Math.pow(x, power);
}

/** @deprecated Prefer GGX — kept for legacy tests. */
export function phongSpecular(rDotV: number, shininess: number): number {
  return Math.pow(Math.min(1, Math.max(0, rDotV)), Math.max(1, shininess));
}

/** @deprecated Prefer GGX — kept for legacy tests. */
export function blinnSpecular(nDotH: number, shininess: number): number {
  return Math.pow(Math.min(1, Math.max(0, nDotH)), Math.max(1, Math.min(64, shininess)));
}

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
  /** @deprecated mapped to roughness */
  shininess?: number;
  diffuseWeight?: number;
  specularWeight?: number;
}): { diffuse: number; specular: number; total: number } {
  const nDotL = Math.min(1, Math.max(0, input.nDotL));
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
    Math.min(1, Math.max(0, (input.specularWeight ?? 0.04) > 0.2 ? 0.6 : 0));
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

/**
 * Laser spot intensity (scalar): diffuse + specular.
 */
export function laserSpotIntensity(input: {
  powerDisplay: number;
  radialM: number;
  beamRadiusM: number;
  nDotL: number;
  nDotV: number;
  nDotH: number;
  reflectivity?: number;
  absorption: number;
  shininess?: number;
  albedo?: number;
  metalness?: number;
  roughness?: number;
  diffuseWeight?: number;
  specularWeight?: number;
}): number {
  return laserSpotTerms(input).total;
}

/** Beam radius along a laser for surface hits (M²-aware Gaussian). */
export function laserBeamRadiusAtDistance(
  w0M: number,
  wavelengthNm: number,
  m2: number,
  distanceM: number,
): number {
  const lambdaM = Math.max(wavelengthNm, 1) * 1e-9;
  return laserBeamRadius(w0M, lambdaM, m2, distanceM);
}

/** @deprecated Use laserBeamRadiusAtDistance with m2. */
export function laserBeamRadiusAtDistanceLegacy(
  w0M: number,
  wavelengthNm: number,
  parallelness: number,
  distanceM: number,
): number {
  return laserBeamRadiusAtDistance(
    w0M,
    wavelengthNm,
    m2FromParallelness(parallelness),
    distanceM,
  );
}
