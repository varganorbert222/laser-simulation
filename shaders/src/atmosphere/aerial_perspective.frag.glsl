precision highp float;

varying vec2 vUV;

// @include ./common.glsl

/**
 * Aerial perspective LUT bake (Hillaire-style simplified).
 * UV.x = view zenith [0,1], UV.y = distance fraction along atmosphere chord,
 * slice encoded via uSliceZ in [0,1] (altitude / distance packing for 2D atlas or 3D Z).
 *
 * Output: rgb = inscatter, a = average transmittance luminance.
 */
uniform vec2 uResolution;
uniform sampler2D uTransmittanceLUT;
uniform float uSampleCount;
uniform float uSliceZ;
uniform float uMaxDistance;

void main() {
  vec2 uv = gl_FragCoord.xy / max(uResolution, vec2(1.0));
  float zenith = uv.x * ATMO_PI;
  float distFrac = uv.y;
  float altFrac = uSliceZ;

  vec3 origin = vec3(0.0, uPlanetRadius + altFrac * (uAtmosphereRadius - uPlanetRadius) * 0.5, 0.0);
  vec3 viewDir = normalize(vec3(sin(zenith), cos(zenith), 0.0));
  float maxDist = mix(1000.0, uMaxDistance, distFrac);
  vec2 atmoHit = atmoIntersectSphere(origin, viewDir, uAtmosphereRadius);
  float tEnd = atmoHit.y > 0.0 ? min(atmoHit.y, maxDist) : maxDist;
  float t0 = max(atmoHit.x, 0.0);
  if (tEnd <= t0) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }

  int steps = int(clamp(uSampleCount, 8.0, 64.0));
  float ds = (tEnd - t0) / float(steps);
  vec3 luminance = vec3(0.0);
  vec3 throughput = vec3(1.0);
  vec3 towardSun = normalize(-uSunDirection);

  for (int i = 0; i < 64; i++) {
    if (i >= steps) break;
    float t = t0 + (float(i) + 0.5) * ds;
    vec3 p = origin + viewDir * t;
    float r = length(p);
    float h = r - uPlanetRadius;
    float muSun = dot(normalize(p), towardSun);
    vec3 Tsun = atmoSampleTransmittanceLUT(uTransmittanceLUT, r, muSun);
    float mu = dot(viewDir, towardSun);
    vec3 inscat = (atmoScatterR(h) * atmoPhaseRayleigh(mu) + atmoScatterM(h) * atmoPhaseHG(mu, uMieG))
      * Tsun * uSolarIrradiance;
    luminance += throughput * inscat * ds;
    throughput *= exp(-atmoExtinction(h) * ds);
  }

  float Tavg = (throughput.r + throughput.g + throughput.b) / 3.0;
  gl_FragColor = vec4(luminance, Tavg);
}
