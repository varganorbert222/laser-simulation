precision highp float;

varying vec2 vUV;

// @include ./common.glsl

uniform vec2 uResolution;
uniform sampler2D uTransmittanceLUT;
uniform float uSampleCount;

void main() {
  vec2 uv = gl_FragCoord.xy / max(uResolution, vec2(1.0));
  vec3 viewDir = atmoSkyViewDirFromUv(uv, uSunDirection);
  vec3 origin = atmoViewerOrigin();

  vec2 atmoHit = atmoIntersectSphere(origin, viewDir, uAtmosphereRadius);
  if (atmoHit.y < 0.0) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }
  float t0 = max(atmoHit.x, 0.0);
  float t1 = atmoHit.y;
  vec2 ground = atmoIntersectSphere(origin, viewDir, uPlanetRadius);
  bool hitGround = ground.x > 0.0;
  if (hitGround) t1 = min(t1, ground.x);

  int steps = int(clamp(uSampleCount, 8.0, 128.0));
  float ds = (t1 - t0) / float(steps);
  vec3 luminance = vec3(0.0);
  vec3 throughput = vec3(1.0);
  vec3 towardSun = normalize(-uSunDirection);

  for (int i = 0; i < 128; i++) {
    if (i >= steps) break;
    float t = t0 + (float(i) + 0.5) * ds;
    vec3 p = origin + viewDir * t;
    float r = length(p);
    float h = r - uPlanetRadius;
    vec3 sigmaS = atmoScatterR(h) + atmoScatterM(h);
    vec3 sigmaT = atmoExtinction(h);

    // Light transmittance to sun from sample
    float muSun = dot(normalize(p), towardSun);
    vec3 Tsun = atmoSampleTransmittanceLUT(uTransmittanceLUT, r, muSun);

    float mu = dot(viewDir, towardSun);
    float pr = atmoPhaseRayleigh(mu);
    float pm = atmoPhaseHG(mu, uMieG);
    vec3 inscat = (atmoScatterR(h) * pr + atmoScatterM(h) * pm) * Tsun * uSolarIrradiance;

    // Cheap isotropic multi-scatter fill — slightly stronger for fuller blue sky
    inscat += sigmaS * ATMO_INV_4PI * uSolarIrradiance * Tsun * 0.22 * uGroundAlbedo;

    luminance += throughput * inscat * ds;
    throughput *= exp(-sigmaT * ds);
    if (dot(throughput, vec3(1.0)) < 1e-3) break;
  }

  if (hitGround) {
    vec3 p = origin + viewDir * t1;
    float r = length(p);
    float muSun = dot(normalize(p), towardSun);
    vec3 Tsun = atmoSampleTransmittanceLUT(uTransmittanceLUT, r, muSun);
    luminance += throughput * uGroundAlbedo * uSolarIrradiance * Tsun * max(muSun, 0.0) / ATMO_PI;
  }

  gl_FragColor = vec4(luminance, 1.0);
}
