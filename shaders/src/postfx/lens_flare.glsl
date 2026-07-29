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
