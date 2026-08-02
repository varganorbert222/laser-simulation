precision highp float;
precision highp sampler3D;

varying vec2 vUV;
uniform sampler2D textureSampler;
uniform sampler2D volumetricTexture;
/** 0 = ACES, 1 = Reinhard, 2 = Hable (Uncharted 2). */
uniform float uTonemapMode;
/** 0 = SDR (stronger display map), 1 = HDR (full headroom into tonemap). */
uniform float uColorProfile;
/** Display gamma for canvas encode after tonemap (typically 2.2 / 2.4). */
uniform float uOutputGamma;
/** Pre-tonemap exposure (auto from HDR log-avg when sky ON; manual HDR/SDR baseline otherwise). */
uniform float uAutoExposure;
uniform float uAerialEnabled;
uniform sampler3D uAerialPerspectiveLUT;
/** Theatrical bloom weight (0 = off). Soft-threshold extract + cheap blur, pre-tonemap. */
uniform float uTheatricalBloomWeight;
uniform float uTheatricalBloomThreshold;

// @include postfx/lens_flare.glsl
// @include postfx/observer_apply.glsl

float acesFilmCurve(float x) {
  float a = 2.51;
  float b = 0.03;
  float c = 2.43;
  float d = 0.59;
  float e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

/** Uncharted 2 / Hable partial curve (no white scale). */
float hableCurve(float x) {
  float A = 0.15;
  float B = 0.50;
  float C = 0.10;
  float D = 0.20;
  float E = 0.02;
  float F = 0.30;
  return ((x * (A * x + C * B) + D * E) / (x * (A * x + B) + D * F)) - E / F;
}

vec3 tonemapLuminance(vec3 hdr, float mappedY) {
  float y = dot(hdr, vec3(0.2126, 0.7152, 0.0722));
  if (y < 1e-8) return vec3(0.0);
  vec3 mapped = hdr * (mappedY / y);
  float peak = max(mapped.r, max(mapped.g, mapped.b));
  if (peak > 1.0) mapped /= peak;
  return mapped;
}

vec3 acesLuminance(vec3 hdr) {
  float y = dot(hdr, vec3(0.2126, 0.7152, 0.0722));
  return tonemapLuminance(hdr, acesFilmCurve(y));
}

vec3 reinhardLuminance(vec3 hdr) {
  float y = dot(hdr, vec3(0.2126, 0.7152, 0.0722));
  return tonemapLuminance(hdr, y / (1.0 + y));
}

vec3 hableLuminance(vec3 hdr) {
  float y = dot(hdr, vec3(0.2126, 0.7152, 0.0722));
  // Exposure bias + white point (W = 11.2) — classic Uncharted 2 fit.
  float exposureBias = 2.0;
  float whiteScale = 1.0 / hableCurve(11.2);
  float mappedY = clamp(hableCurve(exposureBias * y) * whiteScale, 0.0, 1.0);
  return tonemapLuminance(hdr, mappedY);
}

vec3 applyTonemap(vec3 hdr) {
  if (uTonemapMode > 1.5) return hableLuminance(hdr);
  if (uTonemapMode > 0.5) return reinhardLuminance(hdr);
  return acesLuminance(hdr);
}

/** Power gamma for LDR canvas (Babylon image processing is off). */
vec3 applyDisplayGamma(vec3 linearRgb, float gamma) {
  float g = max(gamma, 1e-3);
  return pow(max(linearRgb, vec3(0.0)), vec3(1.0 / g));
}

/** Soft-threshold highlight residual (HDR). */
vec3 softThresholdHdr(vec3 c, float threshold) {
  float y = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float knee = max(threshold * 0.25, 1e-4);
  float soft = clamp((y - threshold + knee) / (2.0 * knee), 0.0, 1.0);
  float t = max(y - threshold, soft * soft * knee);
  return c * (t / max(y, 1e-6));
}

/** Scene + volumetrics at UV (linear HDR). */
vec3 sampleHdrComposite(vec2 uv) {
  return texture2D(textureSampler, uv).rgb + texture2D(volumetricTexture, uv).rgb;
}

/**
 * Cheap theatrical bloom on HDR composite (includes lasers).
 * Dual-radius weighted taps — not a full mip pyramid, but energy-correct pre-tonemap.
 */
vec3 theatricalBloom(vec2 uv, float weight, float threshold) {
  if (weight < 1e-4) return vec3(0.0);
  // ~1.5 px in UV space (resolution-aware).
  vec2 px = max(fwidth(uv), vec2(1e-5)) * 1.5;
  vec3 acc = softThresholdHdr(sampleHdrComposite(uv), threshold) * 0.28;
  acc += softThresholdHdr(sampleHdrComposite(uv + vec2( px.x, 0.0)), threshold) * 0.12;
  acc += softThresholdHdr(sampleHdrComposite(uv + vec2(-px.x, 0.0)), threshold) * 0.12;
  acc += softThresholdHdr(sampleHdrComposite(uv + vec2(0.0,  px.y)), threshold) * 0.12;
  acc += softThresholdHdr(sampleHdrComposite(uv + vec2(0.0, -px.y)), threshold) * 0.12;
  acc += softThresholdHdr(sampleHdrComposite(uv + vec2( px.x,  px.y)), threshold) * 0.06;
  acc += softThresholdHdr(sampleHdrComposite(uv + vec2(-px.x,  px.y)), threshold) * 0.06;
  acc += softThresholdHdr(sampleHdrComposite(uv + vec2( px.x, -px.y)), threshold) * 0.06;
  acc += softThresholdHdr(sampleHdrComposite(uv + vec2(-px.x, -px.y)), threshold) * 0.06;
  // Wider halo
  vec2 wide = px * 3.0;
  acc += softThresholdHdr(sampleHdrComposite(uv + vec2( wide.x, 0.0)), threshold) * 0.04;
  acc += softThresholdHdr(sampleHdrComposite(uv + vec2(-wide.x, 0.0)), threshold) * 0.04;
  acc += softThresholdHdr(sampleHdrComposite(uv + vec2(0.0,  wide.y)), threshold) * 0.04;
  acc += softThresholdHdr(sampleHdrComposite(uv + vec2(0.0, -wide.y)), threshold) * 0.04;
  return acc * weight;
}

void main(void) {
  vec3 scene = texture2D(textureSampler, vUV).rgb;
  // Optional distant aerial haze (Atmosphere LUT) — screen-space approx until depth-aware path.
  if (uAerialEnabled > 0.5) {
    float zen = clamp(1.0 - vUV.y, 0.0, 1.0);
    // WebGL2: texture(); precision highp sampler3D required (see raymarch.tpl.glsl).
    vec4 ap = texture(uAerialPerspectiveLUT, vec3(zen, 0.4, 0.25));
    float haze = (1.0 - ap.a) * 0.35;
    scene = mix(scene, scene * ap.a + ap.rgb, haze);
  }
  vec3 vol = texture2D(volumetricTexture, vUV).rgb;

  // Linear HDR composite first — never clamp volumetrics before tonemap (laser energy).
  float exposure = max(uAutoExposure, 1e-6);
  vec3 combined = (scene + vol) * exposure;

  // Theatrical bloom + lens flare on HDR (includes lasers), before tonemap — Unity/Unreal order.
  combined += theatricalBloom(vUV, uTheatricalBloomWeight, uTheatricalBloomThreshold) * exposure;
  combined += applyScreenSpaceLensFlare(vUV) * exposure;

  // SDR display profile: mild pre-exposure (stronger film compression into LDR).
  // HDR: full headroom into the same tonemap operator (sky/IBL may be >1).
  if (uColorProfile < 0.5) {
    combined *= 0.55;
  }

  // Perception post-layer on physical HDR (or radiance debug / bypass).
  vec3 perceptual = applyObserverAndDebugView(combined, vUV);

  // Tonemap once for the full frame (ACES / Reinhard / Hable).
  vec3 mapped = applyTonemap(perceptual);

  // Final display encode for the LDR canvas (both profiles).
  vec3 outc = applyDisplayGamma(mapped, uOutputGamma);

  gl_FragColor = vec4(outc, 1.0);
}
