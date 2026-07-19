/**
 * Cook–Torrance microfacet BRDF (GGX + Schlick Fresnel + Smith G).
 * CPU twin of SurfaceRadiancePlugin fragment paths.
 */

const INV_PI = 1 / Math.PI;
const DIELECTRIC_F0 = 0.04;

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.min(1, Math.max(0, v));
}

/** Schlick Fresnel F(vDotH) with F0 (Cook–Torrance microfacet). */
export function schlickFresnel(vDotH: number, f0: number): number {
  const x = 1 - clamp01(vDotH);
  const f = clamp01(f0);
  return f + (1 - f) * Math.pow(x, 5);
}

/** GGX / Trowbridge–Reitz normal distribution. α = roughness². */
export function ggxDistribution(nDotH: number, alpha: number): number {
  const a = Math.max(alpha, 1e-4);
  const a2 = a * a;
  const nh = Math.max(nDotH, 0);
  const d = nh * nh * (a2 - 1) + 1;
  return a2 / (Math.PI * d * d);
}

/** Smith–GGX geometric shadowing for one direction. */
export function smithG1(nDotX: number, alpha: number): number {
  const a = Math.max(alpha, 1e-4);
  const nd = Math.max(nDotX, 1e-5);
  const a2 = a * a;
  return (2 * nd) / (nd + Math.sqrt(a2 + (1 - a2) * nd * nd));
}

export function smithG(nDotL: number, nDotV: number, alpha: number): number {
  return smithG1(nDotL, alpha) * smithG1(nDotV, alpha);
}

export function roughnessToAlpha(roughness: number): number {
  const r = clamp01(roughness);
  return Math.max(r * r, 1e-4);
}

export function specularF0(albedo: number, metalness: number): number {
  const m = clamp01(metalness);
  return DIELECTRIC_F0 * (1 - m) + clamp01(albedo) * m;
}

export interface MicrofacetBrdfInput {
  nDotL: number;
  nDotV: number;
  nDotH: number;
  /** V·H for Schlick Fresnel; defaults to nDotV if omitted. */
  vDotH?: number;
  albedo: number;
  metalness: number;
  roughness: number;
  /** Optional absorption (surface), reduces both lobes. */
  absorption?: number;
}

export interface MicrofacetBrdfResult {
  diffuse: number;
  specular: number;
  total: number;
  f0: number;
  alpha: number;
}

/**
 * Scalar Cook–Torrance: kd·albedo/π + D F G / (4 n·l n·v).
 * Multiply by irradiance E for reflected radiance.
 */
export function evaluateMicrofacetBrdf(input: MicrofacetBrdfInput): MicrofacetBrdfResult {
  const nDotL = Math.max(input.nDotL, 0);
  const nDotV = Math.max(input.nDotV, 1e-5);
  if (nDotL <= 1e-6) {
    return { diffuse: 0, specular: 0, total: 0, f0: DIELECTRIC_F0, alpha: 1 };
  }

  const metal = clamp01(input.metalness);
  const albedo = clamp01(input.albedo);
  const abs = clamp01(input.absorption ?? 0);
  const survive = Math.max(1 - abs, 0.05);
  const alpha = roughnessToAlpha(input.roughness);
  const f0 = specularF0(albedo, metal);
  const vDotH = Math.max(input.vDotH ?? nDotV, 0);
  const F = schlickFresnel(vDotH, f0);
  const D = ggxDistribution(Math.max(input.nDotH, 0), alpha);
  const G = smithG(nDotL, nDotV, alpha);
  const spec = (D * F * G) / Math.max(4 * nDotL * nDotV, 1e-5);

  // View-stable diffuse: use F0 (not F(n·v)) so Lambert stays view-independent.
  const kd = (1 - f0) * (1 - metal);
  const diffuse = kd * albedo * INV_PI * survive;
  const specular = spec * survive;

  return { diffuse, specular, total: diffuse + specular, f0, alpha };
}

/**
 * GGX lobe angular width (radians, approx) for reflect-ray soft cone.
 * Smooth → tight; rough → wide.
 */
export function ggxReflectSoftRadius(roughness: number): number {
  const a = roughnessToAlpha(roughness);
  return Math.min(0.55, Math.max(0.012, 0.55 * a));
}

/** GLSL twin shared by SurfaceRadiancePlugin. */
export function microfacetBrdfGlslFunctions(): string {
  return `
float mfSchlickFresnel(float vDotH, float f0) {
  float x = 1.0 - clamp(vDotH, 0.0, 1.0);
  return f0 + (1.0 - f0) * pow(x, 5.0);
}

float mfGgxD(float nDotH, float alpha) {
  float a = max(alpha, 1e-4);
  float a2 = a * a;
  float nh = max(nDotH, 0.0);
  float d = nh * nh * (a2 - 1.0) + 1.0;
  return a2 / (3.14159265 * d * d);
}

float mfSmithG1(float nDotX, float alpha) {
  float a = max(alpha, 1e-4);
  float nd = max(nDotX, 1e-5);
  float a2 = a * a;
  return (2.0 * nd) / (nd + sqrt(a2 + (1.0 - a2) * nd * nd));
}

float mfSmithG(float nDotL, float nDotV, float alpha) {
  return mfSmithG1(nDotL, alpha) * mfSmithG1(nDotV, alpha);
}

float mfSpecularF0(float albedo, float metalness) {
  return mix(0.04, clamp(albedo, 0.0, 1.0), clamp(metalness, 0.0, 1.0));
}

// Returns vec2(diffuse, specular) BRDF terms (multiply by irradiance E).
// Fresnel uses V·H (Cook–Torrance), not N·V.
vec2 mfEvaluate(float nDotL, float nDotV, float nDotH, float vDotH, float albedo, float metal, float rough, float absorption) {
  nDotL = max(nDotL, 0.0);
  nDotV = max(nDotV, 1e-5);
  if (nDotL <= 1e-6) return vec2(0.0);
  float alpha = max(rough * rough, 1e-4);
  float f0 = mfSpecularF0(albedo, metal);
  float F = mfSchlickFresnel(max(vDotH, 0.0), f0);
  float D = mfGgxD(nDotH, alpha);
  float G = mfSmithG(nDotL, nDotV, alpha);
  float spec = (D * F * G) / max(4.0 * nDotL * nDotV, 1e-5);
  float kd = (1.0 - f0) * (1.0 - metal);
  float survive = max(1.0 - clamp(absorption, 0.0, 1.0), 0.05);
  float diffuse = kd * albedo * 0.318309886 * survive;
  return vec2(diffuse, spec * survive);
}

float mfReflectSoftRadius(float rough) {
  float a = max(rough * rough, 1e-4);
  return clamp(0.55 * a, 0.012, 0.55);
}
`;
}
