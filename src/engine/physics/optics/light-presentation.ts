/**
 * Light presentation helpers: housing glow / bloom when a SurfaceMaterial
 * is co-located with a LightEmitter. Spot intensity uses light gains only.
 */

import {
  clampUnit,
  normalizeSurfaceMaterial,
  specularLike,
  type SurfaceMaterial,
} from './surface-material';

function clampRange(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, Number.isFinite(v) ? v : lo));
}

/**
 * Emissive scale for fixture housing mesh (multiplies λ RGB).
 * Uses aperture coupling + glowGain + optional co-located material.
 */
export function deriveHousingGlowScale(
  material: SurfaceMaterial | null | undefined,
  apertureCoupling: number,
  glowGain: number,
  powerBrightness: number,
): number {
  const coupling = clampUnit(apertureCoupling, 0.4);
  const gain = Math.max(0, glowGain);
  const power = Math.max(0, powerBrightness);
  if (!material) {
    return clampRange(gain * coupling * power, 0, 8);
  }
  const m = normalizeSurfaceMaterial(material);
  const smooth = 1 - m.roughness;
  const albedoFactor = 0.5 + 0.5 * m.albedo;
  const scale = gain * coupling * power * (0.4 + 0.6 * smooth) * albedoFactor;
  return clampRange(scale, 0, 8);
}

/**
 * Bloom weight contribution for pipeline sync.
 * Optional co-located material adds a mild specular boost.
 */
export function deriveBloomContribution(
  bloomGain: number,
  powerBrightness: number,
  material: SurfaceMaterial | null | undefined,
): number {
  const gain = Math.max(0, bloomGain);
  const power = Math.max(0, powerBrightness);
  let w = gain * power;
  if (material) {
    w *= 1 + specularLike(material) * 0.35;
  }
  return clampRange(w, 0, 8);
}

/** GlowLayer intensity contribution (housing). */
export function deriveGlowContribution(
  glowGain: number,
  powerBrightness: number,
  apertureCoupling: number,
  material: SurfaceMaterial | null | undefined,
): number {
  return deriveHousingGlowScale(material, apertureCoupling, glowGain, powerBrightness);
}
