precision highp float;

varying vec2 vUV;

// @include ./common.glsl

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
