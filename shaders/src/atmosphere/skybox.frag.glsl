precision highp float;

varying vec3 vWorldDir;

// @include ./common.glsl

uniform sampler2D uSkyViewLUT;
uniform sampler2D uTransmittanceLUT;
uniform sampler2D uNightSkyMap;
uniform sampler2D uMoonMap;
uniform float uSunAngularRadius; // radians (~0.00465)
uniform float uMoonAngularRadius;
uniform float uExposure;
uniform float uLutBlend; // 0 = analytical only, 1 = prefer LUT when lit
uniform float uSkyboxHdrColors; // 1 = allow >1 (from Quality.colorProfile hdr)
uniform float uNightExposure;
uniform float uMoonExposure;
uniform float uNightBlendStrength;
uniform vec3 uSkyboxGroundColor;
uniform vec3 uSkyboxEquatorColor;

/** Equirectangular UV from world direction (Y-up). */
vec2 atmoEquirectUv(vec3 dir) {
  float lon = atan(dir.x, dir.z);
  float lat = asin(clamp(dir.y, -1.0, 1.0));
  return vec2(fract(lon * (0.5 / ATMO_PI) + 0.5), 0.5 - lat / ATMO_PI);
}

/**
 * Night factor from sun elevation (toward-sun Y).
 * 1 at astronomical night, 0 in daytime; smooth civil/nautical twilight.
 */
float atmoNightFactor(vec3 towardSun) {
  return smoothstep(0.12, -0.28, towardSun.y) * clamp(uNightBlendStrength, 0.0, 1.0);
}

/** Sample starfield / deep-space equirect; fade below horizon. */
vec3 atmoSampleNightSky(vec3 viewDir) {
  vec3 night = texture2D(uNightSkyMap, atmoEquirectUv(viewDir)).rgb;
  // Base 0.45 matches the previous baked look at nightExposure = 1.
  night *= 0.45 * max(uNightExposure, 0.0);
  float above = smoothstep(-0.08, 0.02, viewDir.y);
  return night * above;
}

/**
 * Disc-map the Moon.png onto the celestial sphere around moonDir
 * (full-moon ≈ anti-solar = uSunDirection / light travel dir).
 */
vec3 atmoSampleMoon(vec3 viewDir, vec3 moonDir, float angularRadius) {
  if (moonDir.y < -0.02) return vec3(0.0);
  float cosA = dot(viewDir, moonDir);
  float cosLim = cos(angularRadius);
  if (cosA < cosLim) return vec3(0.0);

  vec3 upRef = abs(moonDir.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
  vec3 right = normalize(cross(upRef, moonDir));
  vec3 up = cross(moonDir, right);

  float invSin = 1.0 / max(sin(angularRadius), 1e-5);
  float sx = dot(viewDir, right) * invSin;
  float sy = dot(viewDir, up) * invSin;
  if (sx * sx + sy * sy > 1.0) return vec3(0.0);

  vec2 uv = vec2(sx, sy) * 0.5 + 0.5;
  vec4 moon = texture2D(uMoonMap, uv);
  float a = moon.a;
  // Soft limb if the PNG is opaque in a square.
  float limb = smoothstep(1.0, 0.85, length(vec2(sx, sy)));
  a *= limb;
  // Soft corona so the disc reads against the starfield.
  float glow = pow(max(cosA - cosLim, 0.0) / max(1.0 - cosLim, 1e-4), 0.35) * 0.15;
  vec3 rgb = moon.rgb * a + vec3(0.75, 0.78, 0.85) * glow * (1.0 - a * 0.5);
  // Base 1.35 matches previous look at moonExposure = 1.
  return rgb * 1.35 * max(uMoonExposure, 0.0);
}

/** Push chroma away from luminance, then restore Y so energy stays physically scaled. */
vec3 atmoBoostChroma(vec3 c, float amount) {
  float y = dot(c, vec3(0.2126, 0.7152, 0.0722));
  if (y < 1e-8) return vec3(0.0);
  vec3 boosted = max(mix(vec3(y), c, amount), vec3(0.0));
  float y2 = dot(boosted, vec3(0.2126, 0.7152, 0.0722));
  return boosted * (y / max(y2, 1e-8));
}

/** Simple display sky so the dome is never pitch-black if LUTs are empty/unready. */
vec3 analyticalSky(vec3 viewDir, vec3 sunLightDir) {
  vec3 towardSun = normalize(-sunLightDir);
  float elev = clamp(viewDir.y * 0.5 + 0.5, 0.0, 1.0);
  vec3 zenith = vec3(0.10, 0.42, 0.98);
  vec3 equator = uSkyboxEquatorColor;
  vec3 ground = uSkyboxGroundColor;
  // Unity Procedural Sky-like: zenith ↔ equator above, equator ↔ ground below.
  vec3 sky = mix(equator, zenith, pow(elev, 0.55));
  if (viewDir.y < 0.0) {
    sky = mix(equator, ground, clamp(-viewDir.y * 2.0, 0.0, 1.0));
  }
  // Stronger Rayleigh-ish blue bias toward zenith
  sky += vec3(0.04, 0.10, 0.22) * max(viewDir.y, 0.0);
  // Mie sun glow
  float mu = max(dot(viewDir, towardSun), 0.0);
  float mie = pow(mu, 8.0) * 0.45 + pow(mu, 64.0) * 1.1 + pow(mu, 256.0) * 1.4;
  float sunUp = max(towardSun.y, 0.0);
  vec3 sunCol = mix(vec3(1.0, 0.42, 0.12), vec3(1.0, 0.96, 0.82), sunUp);
  sky += sunCol * mie * (0.35 + 0.9 * sunUp);
  // Soft sun disc (fallback when LUT sun is weak)
  float cosLim = cos(uSunAngularRadius * 1.5);
  if (mu > cosLim && towardSun.y > -0.05) {
    sky += sunCol * smoothstep(cosLim, 1.0, mu) * (8.0 + 22.0 * sunUp);
  }
  // Night fallback (before texture blend)
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

  // Bright sun disc + corona from transmittance LUT (limb darkening / sunset color)
  vec3 towardSun = normalize(-uSunDirection);
  float cosA = dot(viewDir, towardSun);
  float cosLim = cos(uSunAngularRadius);
  float cosCorona = cos(uSunAngularRadius * 5.0);
  if (cosA > cosCorona) {
    vec3 origin = atmoViewerOrigin();
    float mu = dot(normalize(origin), towardSun);
    vec3 T = atmoSampleTransmittanceLUT(uTransmittanceLUT, length(origin), mu);
    float limb = smoothstep(cosLim, 1.0, cosA);
    float corona = smoothstep(cosCorona, cosLim, cosA);
    // Core disc — punchy enough to survive display tonemap.
    lutSky += uSolarIrradiance * T * limb * 70.0;
    // Soft aureole so the sun doesn't look like a flat coin.
    lutSky += uSolarIrradiance * T * corona * (1.0 - limb) * 12.0;
  }

  float lutEnergy = max(lutSky.r, max(lutSky.g, lutSky.b));
  float blend = uLutBlend * smoothstep(0.0, 0.05, lutEnergy);
  vec3 daySky = mix(analytical, lutSky * max(uExposure, 0.5), blend);
  // Keep a little analytical fill so empty LUT regions never go pure black
  daySky = max(daySky, analytical * 0.28);
  // Vivid chroma (noon blue / sunset orange) without changing luminance much.
  daySky = atmoBoostChroma(daySky, 1.25);

  // Night: starfield + moon (full-moon ≈ anti-solar = light travel dir).
  float night = atmoNightFactor(towardSun);
  vec3 nightSky = atmoSampleNightSky(viewDir);
  nightSky += atmoSampleMoon(viewDir, normalize(uSunDirection), max(uMoonAngularRadius, 1e-4));

  // Cross-fade day atmosphere ↔ night sky / space.
  vec3 sky = mix(daySky, nightSky, night);
  // Keep a hint of twilight glow while night textures fade in.
  sky = max(sky, daySky * (1.0 - night) * 0.15);

  // Unity-style Ground + Equator: equator at the rim, ground below.
  float below = smoothstep(0.08, -0.2, viewDir.y);
  vec3 groundBand = mix(
    uSkyboxEquatorColor,
    uSkyboxGroundColor,
    smoothstep(0.02, -0.4, viewDir.y)
  );
  sky = mix(sky, groundBand, below);

  // Display profile SDR: clamp sky/IBL to [0,1] at source (compose also clamps).
  // HDR profile: keep physical sun/LUT energy >1 for reflections (Unity sky HDR buffer).
  if (uSkyboxHdrColors < 0.5) {
    sky = clamp(sky, 0.0, 1.0);
  }

  gl_FragColor = vec4(sky, 1.0);
}
