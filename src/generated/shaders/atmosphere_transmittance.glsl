precision highp float;

varying vec2 vUV;

// Shared planetary atmosphere helpers (Hillaire / Bruneton-style).
// Uniforms expected by callers that @include this file.

#ifndef ATMOSPHERE_COMMON_GLSL
#define ATMOSPHERE_COMMON_GLSL

const float ATMO_PI = 3.141592653589793;
const float ATMO_INV_4PI = 0.07957747154594767;

uniform vec3 uPlanetCenter; // usually (0,0,0) — planet-centric
uniform float uPlanetRadius;
uniform float uAtmosphereRadius;
uniform vec3 uRayleighScattering;
uniform float uRayleighScaleHeight;
uniform vec3 uMieScattering;
uniform vec3 uMieAbsorption;
uniform float uMieScaleHeight;
uniform float uMieG;
uniform vec3 uOzoneAbsorption;
uniform float uOzoneCenterHeight;
uniform float uOzoneWidth;
uniform vec3 uGroundAlbedo;
uniform vec3 uSolarIrradiance;
uniform vec3 uSunDirection; // light travel dir (from sun into scene)
uniform float uEyeHeight;   // meters above ground for surface LUTs

float atmoDensityRayleigh(float h) {
  return exp(-max(h, 0.0) / max(uRayleighScaleHeight, 1.0));
}
float atmoDensityMie(float h) {
  return exp(-max(h, 0.0) / max(uMieScaleHeight, 1.0));
}
float atmoDensityOzone(float h) {
  return max(0.0, 1.0 - abs(h - uOzoneCenterHeight) / max(uOzoneWidth, 1.0));
}

float atmoPhaseRayleigh(float mu) {
  float m = clamp(mu, -1.0, 1.0);
  return 0.0596831036 * (1.0 + m * m);
}

float atmoPhaseHG(float mu, float g) {
  float g2 = g * g;
  float denom = pow(max(1.0 - 2.0 * g * mu + g2, 1e-6), 1.5);
  return ((1.0 - g2) / denom) * ATMO_INV_4PI;
}

// Ray–sphere: returns (tNear, tFar); tFar < 0 ⇒ miss
vec2 atmoIntersectSphere(vec3 o, vec3 d, float radius) {
  float b = dot(o, d);
  float c = dot(o, o) - radius * radius;
  float disc = b * b - c;
  if (disc < 0.0) return vec2(-1.0, -1.0);
  float s = sqrt(disc);
  return vec2(-b - s, -b + s);
}

vec3 atmoExtinction(float h) {
  float dr = atmoDensityRayleigh(h);
  float dm = atmoDensityMie(h);
  float doz = atmoDensityOzone(h);
  return uRayleighScattering * dr
    + (uMieScattering + uMieAbsorption) * dm
    + uOzoneAbsorption * doz;
}

vec3 atmoScatterR(float h) {
  return uRayleighScattering * atmoDensityRayleigh(h);
}
vec3 atmoScatterM(float h) {
  return uMieScattering * atmoDensityMie(h);
}

/**
 * Optical depth integrate along ray; returns transmittance RGB.
 * steps limited for LUT bake.
 */
vec3 atmoTransmittanceRay(vec3 origin, vec3 dir, int steps) {
  vec2 atmoHit = atmoIntersectSphere(origin, dir, uAtmosphereRadius);
  if (atmoHit.y < 0.0) return vec3(1.0);
  float t0 = max(atmoHit.x, 0.0);
  float t1 = atmoHit.y;
  vec2 ground = atmoIntersectSphere(origin, dir, uPlanetRadius);
  if (ground.x > 0.0) t1 = min(t1, ground.x);
  if (t1 <= t0) return vec3(0.0);

  float ds = (t1 - t0) / float(steps);
  vec3 od = vec3(0.0);
  for (int i = 0; i < 96; i++) {
    if (i >= steps) break;
    float t = t0 + (float(i) + 0.5) * ds;
    vec3 p = origin + dir * t;
    float h = length(p) - uPlanetRadius;
    od += atmoExtinction(h) * ds;
  }
  return exp(-od);
}

/** Sample transmittance LUT: uv.x = mu in [-1,1] mapped, uv.y = height fraction. */
vec2 atmoTransmittanceUv(float radius, float mu) {
  float H = sqrt(max(uAtmosphereRadius * uAtmosphereRadius - uPlanetRadius * uPlanetRadius, 0.0));
  float rho = sqrt(max(radius * radius - uPlanetRadius * uPlanetRadius, 0.0));
  float u = rho / max(H, 1.0);
  // Discriminant mapping (Bruneton-ish) for mu
  float r = max(radius, uPlanetRadius + 1.0);
  float d = uAtmosphereRadius * uAtmosphereRadius - r * r * (1.0 - mu * mu);
  float dRoot = sqrt(max(d, 0.0));
  float dMin = uAtmosphereRadius - r;
  float dMax = rho + H;
  float dVal = max(0.0, (-r * mu + dRoot));
  float v = (dVal - dMin) / max(dMax - dMin, 1e-3);
  return vec2(clamp(u, 0.0, 1.0), clamp(v, 0.0, 1.0));
}

vec3 atmoSampleTransmittanceLUT(sampler2D lut, float radius, float mu) {
  return texture2D(lut, atmoTransmittanceUv(radius, mu)).rgb;
}

vec3 atmoViewerOrigin() {
  return vec3(0.0, uPlanetRadius + max(uEyeHeight, 1.0), 0.0);
}

/** View direction from sky-view LUT UV (Hillaire): x = azimuth about zenith/sun, y = zenith angle. */
vec3 atmoSkyViewDirFromUv(vec2 uv, vec3 sunDir) {
  // uv.x ∈ [0,1] → azimuth; u=0.5 is toward the sun's horizon projection (matches UvFromDir).
  // uv.y ∈ [0,1] → zenith angle [0, π] (0 = zenith)
  float phi = (uv.x - 0.5) * 2.0 * ATMO_PI;
  float theta = uv.y * ATMO_PI;
  float sinTheta = sin(theta);
  vec3 local = vec3(sinTheta * sin(phi), cos(theta), sinTheta * cos(phi));
  // Align local +Z with sun's horizontal projection; Y = up
  vec3 up = vec3(0.0, 1.0, 0.0);
  vec3 towardSun = normalize(-sunDir);
  vec3 sunHoriz = towardSun - up * towardSun.y;
  if (dot(sunHoriz, sunHoriz) < 1e-6) sunHoriz = vec3(0.0, 0.0, 1.0);
  sunHoriz = normalize(sunHoriz);
  vec3 right = normalize(cross(up, sunHoriz));
  return normalize(right * local.x + up * local.y + sunHoriz * local.z);
}

vec2 atmoSkyViewUvFromDir(vec3 viewDir, vec3 sunDir) {
  vec3 up = vec3(0.0, 1.0, 0.0);
  vec3 v = normalize(viewDir);
  float zenith = acos(clamp(dot(v, up), -1.0, 1.0));
  vec3 towardSun = normalize(-sunDir);
  vec3 sunHoriz = towardSun - up * towardSun.y;
  if (dot(sunHoriz, sunHoriz) < 1e-6) sunHoriz = vec3(0.0, 0.0, 1.0);
  sunHoriz = normalize(sunHoriz);
  vec3 right = normalize(cross(up, sunHoriz));
  float x = dot(v, right);
  float z = dot(v, sunHoriz);
  float azi = atan(x, z);
  // +0.5 centers the sun at u=0.5 (must match DirFromUv's (u-0.5) decode).
  float u = fract(azi / (2.0 * ATMO_PI) + 0.5);
  float vv = clamp(zenith / ATMO_PI, 0.0, 1.0);
  return vec2(u, vv);
}

#endif

uniform vec2 uResolution;

uniform float uSampleCount;

void main() {
  vec2 uv = gl_FragCoord.xy / max(uResolution, vec2(1.0));
  // Encode (rho, mu) like Bruneton transmittance table.
  float H = sqrt(max(uAtmosphereRadius * uAtmosphereRadius - uPlanetRadius * uPlanetRadius, 0.0));
  float rho = uv.x * H;
  float r = sqrt(rho * rho + uPlanetRadius * uPlanetRadius);
  float dMin = uAtmosphereRadius - r;
  float dMax = rho + H;
  float d = dMin + uv.y * max(dMax - dMin, 1e-3);
  float mu = d == 0.0 ? 1.0 : (H * H - rho * rho - d * d) / (2.0 * r * d);
  mu = clamp(mu, -1.0, 1.0);

  vec3 origin = vec3(0.0, r, 0.0);
  vec3 dir = vec3(sqrt(max(1.0 - mu * mu, 0.0)), mu, 0.0);
  int steps = int(clamp(uSampleCount, 8.0, 96.0));
  vec3 T = atmoTransmittanceRay(origin, normalize(dir), steps);
  gl_FragColor = vec4(T, 1.0);
}
