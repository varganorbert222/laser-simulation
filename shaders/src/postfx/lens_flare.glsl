/**
 * Screen-space optical lens flare (pre-tonemap HDR).
 * Ghosts / anamorphic streaks / halo / chromatic aberration / procedural dirt.
 * Visibility from camera-space depth; bloom boost from volumetric buffer.
 * Look params: separate lights vs sun groups (uFlareLights* / uFlareSun*).
 */

#ifndef LENS_FLARE_SLOTS
#define LENS_FLARE_SLOTS 5
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

/** Lights group: intensity already baked into per-source amp; component weights. */
uniform float uFlareLightsGhosts;
uniform float uFlareLightsStreaks;
uniform float uFlareLightsHalo;
uniform float uFlareLightsChromatic;
uniform float uFlareLightsDirt;
/** Sun group component weights. */
uniform float uFlareSunGhosts;
uniform float uFlareSunStreaks;
uniform float uFlareSunHalo;
uniform float uFlareSunChromatic;
uniform float uFlareSunDirt;

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

vec3 flareGhosts(vec2 uv, vec2 lightUV, vec3 color, float chromatic) {
  vec2 center = vec2(0.5);
  vec2 mirror = center - (lightUV - center);
  vec3 ghosts = vec3(0.0);
  float caScale = clamp(chromatic, 0.0, 2.0);
  for (int i = 1; i <= 6; i++) {
    float t = float(i) / 6.0;
    vec2 g = mix(lightUV, mirror, t * 1.15);
    float fall = (1.0 - t * 0.55) * (0.55 + 0.45 * float(7 - i) / 6.0);
    float sharp = 90.0 + float(i) * 55.0;
    vec2 dir = normalize(g - center + 1e-5);
    float ca = (0.004 + t * 0.012) * caScale;
    float r = exp(-dot(uv - (g + dir * ca), uv - (g + dir * ca)) * sharp);
    float gr = exp(-dot(uv - g, uv - g) * sharp);
    float b = exp(-dot(uv - (g - dir * ca), uv - (g - dir * ca)) * sharp);
    ghosts += vec3(r, gr, b) * fall;
  }
  return ghosts * color;
}

vec3 flareStreaks(vec2 uv, vec2 lightUV, vec3 color, float chromatic) {
  vec2 d = uv - lightUV;
  float hx = exp(-abs(d.x) * 28.0) * exp(-abs(d.y) * 520.0);
  float hy = exp(-abs(d.y) * 22.0) * exp(-abs(d.x) * 480.0);
  float streak = hx * 0.55 + hy * 0.12;
  float caOff = 0.002 * clamp(chromatic, 0.0, 2.0);
  vec3 ca = vec3(
    exp(-abs(d.x - caOff) * 28.0) * exp(-abs(d.y) * 520.0),
    hx,
    exp(-abs(d.x + caOff) * 28.0) * exp(-abs(d.y) * 520.0)
  );
  return (vec3(streak) * 0.65 + ca * 0.35) * color;
}

vec3 flareHalo(vec2 uv, vec2 lightUV, vec3 color) {
  float lightR = length(lightUV - vec2(0.5));
  float r = length(uv - vec2(0.5));
  float ring = 1.0 - abs(r - lightR) * 10.0;
  ring = pow(max(ring, 0.0), 5.0);
  float disc = exp(-dot(uv - lightUV, uv - lightUV) * 180.0);
  return color * (ring * 0.12 + disc * 0.35);
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

  vec3 volAtLight = texture2D(volumetricTexture, clamp(lightUV, vec2(0.0), vec2(1.0))).rgb;
  float bloomBoost = 1.0 + dot(volAtLight, vec3(0.2126, 0.7152, 0.0722)) * 1.8;
  float amp = intensity * vis * bloomBoost;
  if (amp < 1e-5) return vec3(0.0);

  float ghostsW = directional > 0.5 ? uFlareSunGhosts : uFlareLightsGhosts;
  float streaksW = directional > 0.5 ? uFlareSunStreaks : uFlareLightsStreaks;
  float haloW = directional > 0.5 ? uFlareSunHalo : uFlareLightsHalo;
  float chromaW = directional > 0.5 ? uFlareSunChromatic : uFlareLightsChromatic;
  float dirtW = directional > 0.5 ? uFlareSunDirt : uFlareLightsDirt;

  vec3 flare =
    flareGhosts(uv, lightUV, color, chromaW) * (0.55 * ghostsW) +
    flareStreaks(uv, lightUV, color, chromaW) * (0.85 * streaksW) +
    flareHalo(uv, lightUV, color) * haloW;

  float dirt = mix(1.0, flareDirt(uv), clamp(dirtW, 0.0, 2.0) * 0.5);
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
