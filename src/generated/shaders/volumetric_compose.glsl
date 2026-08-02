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

/**
 * Screen-space optical lens flare (pre-tonemap HDR).
 * Configurable camera lens-stack elements (ghost / streak / halo) with
 * per-element color, size, optical axis, and weight.
 * Visibility from camera-space depth; bloom boost from volumetric buffer.
 */

#ifndef LENS_FLARE_SLOTS
#define LENS_FLARE_SLOTS 5
#endif

#ifndef FLARE_ELEMENT_SLOTS
#define FLARE_ELEMENT_SLOTS 12
#endif

uniform float uLensFlareEnabled;
uniform float uFlareCount;
uniform float uUseSceneDepthFlare;
uniform sampler2D uSceneDepthFlare;
/** xy = screen UV, z = camera-space depth (Babylon DepthRenderer). */
uniform vec3 uFlareScreen0;
uniform vec3 uFlareScreen1;
uniform vec3 uFlareScreen2;
uniform vec3 uFlareScreen3;
uniform vec3 uFlareScreen4;
uniform vec3 uFlareColor0;
uniform vec3 uFlareColor1;
uniform vec3 uFlareColor2;
uniform vec3 uFlareColor3;
uniform vec3 uFlareColor4;
uniform float uFlareIntensity0;
uniform float uFlareIntensity1;
uniform float uFlareIntensity2;
uniform float uFlareIntensity3;
uniform float uFlareIntensity4;
uniform float uFlareDirectional0;
uniform float uFlareDirectional1;
uniform float uFlareDirectional2;
uniform float uFlareDirectional3;
uniform float uFlareDirectional4;

/** Lights / sun volumetric coupling. */
uniform float uFlareLightsVolBloom;
uniform float uFlareSunVolBloom;

/** Shared camera optical profile. */
uniform float uFlareElementCount;
uniform float uFlareChromatic;
uniform float uFlareDirt;
uniform float uFlareElKind0;
uniform float uFlareElKind1;
uniform float uFlareElKind2;
uniform float uFlareElKind3;
uniform float uFlareElKind4;
uniform float uFlareElKind5;
uniform float uFlareElKind6;
uniform float uFlareElKind7;
uniform float uFlareElKind8;
uniform float uFlareElKind9;
uniform float uFlareElKind10;
uniform float uFlareElKind11;
uniform vec3 uFlareElColor0;
uniform vec3 uFlareElColor1;
uniform vec3 uFlareElColor2;
uniform vec3 uFlareElColor3;
uniform vec3 uFlareElColor4;
uniform vec3 uFlareElColor5;
uniform vec3 uFlareElColor6;
uniform vec3 uFlareElColor7;
uniform vec3 uFlareElColor8;
uniform vec3 uFlareElColor9;
uniform vec3 uFlareElColor10;
uniform vec3 uFlareElColor11;
uniform float uFlareElSize0;
uniform float uFlareElSize1;
uniform float uFlareElSize2;
uniform float uFlareElSize3;
uniform float uFlareElSize4;
uniform float uFlareElSize5;
uniform float uFlareElSize6;
uniform float uFlareElSize7;
uniform float uFlareElSize8;
uniform float uFlareElSize9;
uniform float uFlareElSize10;
uniform float uFlareElSize11;
uniform float uFlareElAxis0;
uniform float uFlareElAxis1;
uniform float uFlareElAxis2;
uniform float uFlareElAxis3;
uniform float uFlareElAxis4;
uniform float uFlareElAxis5;
uniform float uFlareElAxis6;
uniform float uFlareElAxis7;
uniform float uFlareElAxis8;
uniform float uFlareElAxis9;
uniform float uFlareElAxis10;
uniform float uFlareElAxis11;
uniform float uFlareElWeight0;
uniform float uFlareElWeight1;
uniform float uFlareElWeight2;
uniform float uFlareElWeight3;
uniform float uFlareElWeight4;
uniform float uFlareElWeight5;
uniform float uFlareElWeight6;
uniform float uFlareElWeight7;
uniform float uFlareElWeight8;
uniform float uFlareElWeight9;
uniform float uFlareElWeight10;
uniform float uFlareElWeight11;

float flareHash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

/** Bilinear value noise — avoids floor(uv)*amp block artifacts on HDR flares. */
float flareValueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = flareHash(i);
  float b = flareHash(i + vec2(1.0, 0.0));
  float c = flareHash(i + vec2(0.0, 1.0));
  float d = flareHash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float flareDirt(vec2 uv) {
  float d =
    flareValueNoise(uv * 18.0) * 0.45 +
    flareValueNoise(uv * 47.0 + 3.1) * 0.35 +
    flareValueNoise(uv * 97.0 - 1.7) * 0.20;
  return mix(0.88, 1.12, d);
}

float flareVisibility(vec2 lightUV, float lightDepth, float directional) {
  if (uUseSceneDepthFlare < 0.5) return 1.0;
  float vis = 0.0;
  const int N = 5;
  for (int i = 0; i < N; i++) {
    float a = float(i) * 1.256637;
    float r = float(i) * 0.0045;
    vec2 o = (i == 0) ? vec2(0.0) : vec2(cos(a), sin(a)) * r;
    vec2 s = clamp(lightUV + o, vec2(0.0), vec2(1.0));
    float sceneZ = texture2D(uSceneDepthFlare, s).r;
    if (directional > 0.5) {
      vis += sceneZ < 1e-3 ? 1.0 : smoothstep(80.0, 400.0, sceneZ);
    } else {
      float soft = 0.12 + lightDepth * 0.01;
      vis += smoothstep(lightDepth - soft, lightDepth + soft * 0.35, sceneZ);
    }
  }
  return clamp(vis / float(N), 0.0, 1.0);
}

vec3 flareGhostAt(
  vec2 uv,
  vec2 lightUV,
  vec3 color,
  float chromatic,
  float size,
  float axis,
  float weight
) {
  vec2 center = vec2(0.5);
  vec2 mirror = center - (lightUV - center);
  vec2 g = mix(lightUV, mirror, clamp(axis, 0.0, 2.0));
  float sz = max(size, 0.05);
  float sharp = 180.0 / sz;
  float caScale = clamp(chromatic, 0.0, 2.0);
  vec2 dir = normalize(g - center + 1e-5);
  float ca = (0.004 + clamp(axis, 0.0, 1.5) * 0.01) * caScale;
  float r = exp(-dot(uv - (g + dir * ca), uv - (g + dir * ca)) * sharp);
  float gr = exp(-dot(uv - g, uv - g) * sharp);
  float b = exp(-dot(uv - (g - dir * ca), uv - (g - dir * ca)) * sharp);
  return vec3(r, gr, b) * color * weight;
}

vec3 flareStreakAt(
  vec2 uv,
  vec2 lightUV,
  vec3 color,
  float chromatic,
  float size,
  float weight
) {
  vec2 d = uv - lightUV;
  float sx = max(28.0 / max(size, 0.05), 4.0);
  float sy = max(520.0 / max(size, 0.05), 40.0);
  float hx = exp(-abs(d.x) * sx) * exp(-abs(d.y) * sy);
  float hy = exp(-abs(d.y) * (sx * 0.8)) * exp(-abs(d.x) * (sy * 0.92));
  float streak = hx * 0.55 + hy * 0.12;
  float caOff = 0.002 * clamp(chromatic, 0.0, 2.0) * size;
  vec3 ca = vec3(
    exp(-abs(d.x - caOff) * sx) * exp(-abs(d.y) * sy),
    hx,
    exp(-abs(d.x + caOff) * sx) * exp(-abs(d.y) * sy)
  );
  return (vec3(streak) * 0.65 + ca * 0.35) * color * weight;
}

vec3 flareHaloAt(
  vec2 uv,
  vec2 lightUV,
  vec3 color,
  float size,
  float axis,
  float weight
) {
  float lightR = length(lightUV - vec2(0.5)) * mix(0.85, 1.25, clamp(axis, 0.0, 1.0));
  float r = length(uv - vec2(0.5));
  float ringW = 10.0 / max(size, 0.05);
  float ring = 1.0 - abs(r - lightR) * ringW;
  ring = pow(max(ring, 0.0), 5.0);
  float discSharp = 180.0 / max(size, 0.05);
  float disc = exp(-dot(uv - lightUV, uv - lightUV) * discSharp);
  return color * (ring * 0.12 + disc * 0.35) * weight;
}

float flareElKind(int i) {
  if (i == 0) return uFlareElKind0;
  if (i == 1) return uFlareElKind1;
  if (i == 2) return uFlareElKind2;
  if (i == 3) return uFlareElKind3;
  if (i == 4) return uFlareElKind4;
  if (i == 5) return uFlareElKind5;
  if (i == 6) return uFlareElKind6;
  if (i == 7) return uFlareElKind7;
  if (i == 8) return uFlareElKind8;
  if (i == 9) return uFlareElKind9;
  if (i == 10) return uFlareElKind10;
  return uFlareElKind11;
}

vec3 flareElColor(int i) {
  if (i == 0) return uFlareElColor0;
  if (i == 1) return uFlareElColor1;
  if (i == 2) return uFlareElColor2;
  if (i == 3) return uFlareElColor3;
  if (i == 4) return uFlareElColor4;
  if (i == 5) return uFlareElColor5;
  if (i == 6) return uFlareElColor6;
  if (i == 7) return uFlareElColor7;
  if (i == 8) return uFlareElColor8;
  if (i == 9) return uFlareElColor9;
  if (i == 10) return uFlareElColor10;
  return uFlareElColor11;
}

float flareElSize(int i) {
  if (i == 0) return uFlareElSize0;
  if (i == 1) return uFlareElSize1;
  if (i == 2) return uFlareElSize2;
  if (i == 3) return uFlareElSize3;
  if (i == 4) return uFlareElSize4;
  if (i == 5) return uFlareElSize5;
  if (i == 6) return uFlareElSize6;
  if (i == 7) return uFlareElSize7;
  if (i == 8) return uFlareElSize8;
  if (i == 9) return uFlareElSize9;
  if (i == 10) return uFlareElSize10;
  return uFlareElSize11;
}

float flareElAxis(int i) {
  if (i == 0) return uFlareElAxis0;
  if (i == 1) return uFlareElAxis1;
  if (i == 2) return uFlareElAxis2;
  if (i == 3) return uFlareElAxis3;
  if (i == 4) return uFlareElAxis4;
  if (i == 5) return uFlareElAxis5;
  if (i == 6) return uFlareElAxis6;
  if (i == 7) return uFlareElAxis7;
  if (i == 8) return uFlareElAxis8;
  if (i == 9) return uFlareElAxis9;
  if (i == 10) return uFlareElAxis10;
  return uFlareElAxis11;
}

float flareElWeight(int i) {
  if (i == 0) return uFlareElWeight0;
  if (i == 1) return uFlareElWeight1;
  if (i == 2) return uFlareElWeight2;
  if (i == 3) return uFlareElWeight3;
  if (i == 4) return uFlareElWeight4;
  if (i == 5) return uFlareElWeight5;
  if (i == 6) return uFlareElWeight6;
  if (i == 7) return uFlareElWeight7;
  if (i == 8) return uFlareElWeight8;
  if (i == 9) return uFlareElWeight9;
  if (i == 10) return uFlareElWeight10;
  return uFlareElWeight11;
}

float flareVolLuminance(vec2 lightUV) {
  // Spatial average — single-texel volumetric samples flicker with raymarch noise / media.
  vec2 uv0 = clamp(lightUV, vec2(0.0), vec2(1.0));
  const float r = 0.01;
  vec3 acc = texture2D(volumetricTexture, uv0).rgb;
  acc += texture2D(volumetricTexture, clamp(uv0 + vec2(r, 0.0), vec2(0.0), vec2(1.0))).rgb;
  acc += texture2D(volumetricTexture, clamp(uv0 + vec2(-r, 0.0), vec2(0.0), vec2(1.0))).rgb;
  acc += texture2D(volumetricTexture, clamp(uv0 + vec2(0.0, r), vec2(0.0), vec2(1.0))).rgb;
  acc += texture2D(volumetricTexture, clamp(uv0 + vec2(0.0, -r), vec2(0.0), vec2(1.0))).rgb;
  acc *= 0.2;
  return dot(acc, vec3(0.2126, 0.7152, 0.0722));
}

vec3 evaluateLensFlareSource(
  vec2 uv,
  vec3 screen,
  vec3 color,
  float intensity,
  float directional
) {
  vec2 lightUV = screen.xy;
  float lightDepth = max(screen.z, 0.0);
  if (lightUV.x < -0.45 || lightUV.x > 1.45 || lightUV.y < -0.45 || lightUV.y > 1.45) {
    return vec3(0.0);
  }
  float vis = flareVisibility(clamp(lightUV, vec2(0.0), vec2(1.0)), lightDepth, directional);
  if (vis < 1e-4) return vec3(0.0);

  float volLum = flareVolLuminance(lightUV);
  float volW = directional > 0.5 ? uFlareSunVolBloom : uFlareLightsVolBloom;
  volW = clamp(volW, 0.0, 2.0);
  float bloomBoost = 1.0 + min(1.4 * volW, log(1.0 + volLum * 1.35) * (0.95 * volW));
  float amp = intensity * vis * bloomBoost;
  if (amp < 1e-5) return vec3(0.0);

  float chromaW = clamp(uFlareChromatic, 0.0, 2.0);
  float dirtW = clamp(uFlareDirt, 0.0, 2.0);
  int nEl = int(min(uFlareElementCount, float(FLARE_ELEMENT_SLOTS)));
  if (nEl <= 0) return vec3(0.0);
  vec3 flare = vec3(0.0);

  for (int i = 0; i < FLARE_ELEMENT_SLOTS; i++) {
    if (i >= nEl) break;
    float kind = flareElKind(i);
    vec3 tint = color * flareElColor(i);
    float size = flareElSize(i);
    float axis = flareElAxis(i);
    float weight = flareElWeight(i);
    if (kind < 0.5) {
      flare += flareGhostAt(uv, lightUV, tint, chromaW, size, axis, weight);
    } else if (kind < 1.5) {
      flare += flareStreakAt(uv, lightUV, tint, chromaW, size, weight);
    } else {
      flare += flareHaloAt(uv, lightUV, tint, size, axis, weight);
    }
  }

  float dirt = mix(1.0, flareDirt(uv), dirtW * 0.5);
  flare *= amp * dirt;
  float edge = smoothstep(0.0, 0.12, lightUV.x) * smoothstep(1.0, 0.88, lightUV.x) *
    smoothstep(0.0, 0.12, lightUV.y) * smoothstep(1.0, 0.88, lightUV.y);
  edge = mix(0.35, 1.0, edge);
  return flare * edge;
}

vec3 applyScreenSpaceLensFlare(vec2 uv) {
  if (uLensFlareEnabled < 0.5 || uFlareCount < 0.5) return vec3(0.0);

  vec3 sum = vec3(0.0);
  float n = min(uFlareCount, float(LENS_FLARE_SLOTS));

  if (n > 0.5) {
    sum += evaluateLensFlareSource(
      uv, uFlareScreen0, uFlareColor0, uFlareIntensity0, uFlareDirectional0
    );
  }
  if (n > 1.5) {
    sum += evaluateLensFlareSource(
      uv, uFlareScreen1, uFlareColor1, uFlareIntensity1, uFlareDirectional1
    );
  }
  if (n > 2.5) {
    sum += evaluateLensFlareSource(
      uv, uFlareScreen2, uFlareColor2, uFlareIntensity2, uFlareDirectional2
    );
  }
  if (n > 3.5) {
    sum += evaluateLensFlareSource(
      uv, uFlareScreen3, uFlareColor3, uFlareIntensity3, uFlareDirectional3
    );
  }
  if (n > 4.5) {
    sum += evaluateLensFlareSource(
      uv, uFlareScreen4, uFlareColor4, uFlareIntensity4, uFlareDirectional4
    );
  }
  return sum;
}
/**
 * Observer + debug-view transforms on linear HDR (pre-tonemap).
 *
 * uObserverMode:
 *   0 identity / human-eye
 *   1 3×3 RGB matrix (colour-blind, dog, …)
 *   2 digital camera (contrast / saturation / knee)
 *   3 thermal false-colour from luminance
 *   4 infrared false-colour from luminance
 *
 * uDebugViewMode:
 *   0 final (observer → tonemap)
 *   1 radiance-rgb (no observer; debug path still tonemaps)
 *   2 radiance-luminance (log-Y false colour)
 *   3 radiance-split (left physical | right perceptual)
 *   4 observer-bypass (tonemap, no observer)
 */
uniform float uObserverMode;
uniform float uDebugViewMode;
/** Row-major RGB matrix when uObserverMode == 1. */
uniform vec3 uObserverMatR0;
uniform vec3 uObserverMatR1;
uniform vec3 uObserverMatR2;

vec3 observerApplyMatrix(vec3 c) {
  return vec3(
    dot(uObserverMatR0, c),
    dot(uObserverMatR1, c),
    dot(uObserverMatR2, c)
  );
}

vec3 observerDigitalCamera(vec3 c) {
  // Educational sensor: mild contrast, saturation, soft highlight knee.
  float y = dot(c, vec3(0.2126, 0.7152, 0.0722));
  vec3 chroma = c - vec3(y);
  vec3 punched = vec3(y) + chroma * 1.25;
  punched = (punched - 0.5) * 1.15 + 0.5;
  float soft = punched.r + punched.g + punched.b;
  float knee = soft / (1.0 + soft * 0.35);
  float scale = soft > 1e-5 ? knee / soft : 1.0;
  return max(punched * scale, vec3(0.0));
}

vec3 observerThermalFalseColour(vec3 c) {
  float y = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float t = clamp(log(1.0 + y * 4.0) / log(5.0), 0.0, 1.0);
  // Black → blue → cyan → yellow → white
  vec3 cold = vec3(0.02, 0.05, 0.35);
  vec3 mid = vec3(0.05, 0.55, 0.75);
  vec3 hot = vec3(1.0, 0.85, 0.15);
  vec3 white = vec3(1.0);
  if (t < 0.33) return mix(cold, mid, t / 0.33);
  if (t < 0.66) return mix(mid, hot, (t - 0.33) / 0.33);
  return mix(hot, white, (t - 0.66) / 0.34);
}

vec3 observerInfraredFalseColour(vec3 c) {
  float y = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float t = clamp(log(1.0 + y * 5.0) / log(6.0), 0.0, 1.0);
  // Green-phosphor / violet IR camera look
  return mix(vec3(0.02, 0.08, 0.02), vec3(0.55, 1.0, 0.35), t)
    + vec3(0.15, 0.0, 0.25) * t * t;
}

vec3 observerLuminanceFalseColour(vec3 c) {
  float y = max(dot(c, vec3(0.2126, 0.7152, 0.0722)), 0.0);
  float t = clamp(log(1.0 + y * 8.0) / log(9.0), 0.0, 1.0);
  return mix(vec3(0.05, 0.0, 0.2), vec3(1.0, 0.95, 0.2), t);
}

vec3 applyObserverPerception(vec3 hdr) {
  float mode = uObserverMode;
  if (mode < 0.5) return hdr;
  if (mode < 1.5) return max(observerApplyMatrix(hdr), vec3(0.0));
  if (mode < 2.5) return observerDigitalCamera(hdr);
  if (mode < 3.5) return observerThermalFalseColour(hdr);
  return observerInfraredFalseColour(hdr);
}

/**
 * Apply debug view + observer on exposed HDR composite.
 * Returns linear HDR ready for tonemap (except luminance debug which is already display-ish —
 * still tonemapped lightly for consistency).
 */
vec3 applyObserverAndDebugView(vec3 hdrPhysical, vec2 uv) {
  float dbg = uDebugViewMode;

  // radiance-luminance: false-colour physical buffer
  if (dbg > 1.5 && dbg < 2.5) {
    return observerLuminanceFalseColour(hdrPhysical);
  }

  // radiance-rgb / observer-bypass: no species/eye
  if ((dbg > 0.5 && dbg < 1.5) || dbg > 3.5) {
    return hdrPhysical;
  }

  // radiance-split: left physical | right perceptual
  if (dbg > 2.5 && dbg < 3.5) {
    if (uv.x < 0.5) return hdrPhysical;
    return applyObserverPerception(hdrPhysical);
  }

  // final
  return applyObserverPerception(hdrPhysical);
}

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
