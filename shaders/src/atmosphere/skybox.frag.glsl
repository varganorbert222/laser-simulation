precision highp float;

varying vec3 vWorldDir;

// @include ./common.glsl

uniform sampler2D uSkyViewLUT;
uniform sampler2D uTransmittanceLUT;
uniform float uSunAngularRadius; // radians (~0.00465)
uniform float uExposure;
uniform float uLutBlend; // 0 = analytical only, 1 = prefer LUT when lit

/** Simple display sky so the dome is never pitch-black if LUTs are empty/unready. */
vec3 analyticalSky(vec3 viewDir, vec3 sunLightDir) {
  vec3 towardSun = normalize(-sunLightDir);
  float elev = clamp(viewDir.y * 0.5 + 0.5, 0.0, 1.0);
  vec3 zenith = vec3(0.15, 0.35, 0.75);
  vec3 horizon = vec3(0.55, 0.65, 0.80);
  vec3 ground = vec3(0.04, 0.045, 0.055);
  vec3 sky = mix(horizon, zenith, pow(elev, 0.55));
  if (viewDir.y < 0.0) {
    sky = mix(horizon, ground, clamp(-viewDir.y * 2.0, 0.0, 1.0));
  }
  // Rayleigh-ish blue bias toward zenith
  sky += vec3(0.02, 0.05, 0.12) * max(viewDir.y, 0.0);
  // Mie sun glow
  float mu = max(dot(viewDir, towardSun), 0.0);
  float mie = pow(mu, 8.0) * 0.35 + pow(mu, 64.0) * 0.85;
  float sunUp = max(towardSun.y, 0.0);
  vec3 sunCol = mix(vec3(1.0, 0.45, 0.15), vec3(1.0, 0.95, 0.85), sunUp);
  sky += sunCol * mie * (0.25 + 0.75 * sunUp);
  // Soft sun disc
  float cosLim = cos(uSunAngularRadius * 1.5);
  if (mu > cosLim && towardSun.y > -0.05) {
    sky += sunCol * smoothstep(cosLim, 1.0, mu) * (4.0 + 12.0 * sunUp);
  }
  // Night
  if (towardSun.y < -0.05) {
    sky *= 0.08 + 0.2 * max(0.0, 1.0 + towardSun.y);
    sky += vec3(0.01, 0.015, 0.03);
  }
  return sky;
}

void main() {
  vec3 viewDir = normalize(vWorldDir);
  vec3 analytical = analyticalSky(viewDir, uSunDirection);

  vec2 uv = atmoSkyViewUvFromDir(viewDir, uSunDirection);
  vec3 lutSky = texture2D(uSkyViewLUT, uv).rgb;

  // Soft sun from transmittance LUT (physical limb darkening / sunset color)
  vec3 towardSun = normalize(-uSunDirection);
  float cosA = dot(viewDir, towardSun);
  float cosLim = cos(uSunAngularRadius);
  if (cosA > cosLim) {
    vec3 origin = atmoViewerOrigin();
    float mu = dot(normalize(origin), towardSun);
    vec3 T = atmoSampleTransmittanceLUT(uTransmittanceLUT, length(origin), mu);
    float limb = smoothstep(cosLim, 1.0, cosA);
    lutSky += uSolarIrradiance * T * limb * 25.0;
  }

  float lutEnergy = max(lutSky.r, max(lutSky.g, lutSky.b));
  float blend = uLutBlend * smoothstep(0.0, 0.05, lutEnergy);
  vec3 sky = mix(analytical, lutSky * max(uExposure, 0.5), blend);
  // Keep a little analytical fill so empty LUT regions never go pure black
  sky = max(sky, analytical * 0.35);

  gl_FragColor = vec4(sky, 1.0);
}
