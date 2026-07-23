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
`;
}
