precision highp float;
precision highp sampler3D;

varying vec2 vUV;
uniform sampler2D textureSampler;
uniform sampler2D volumetricTexture;
/** 0 = ACES, 1 = Reinhard, 2 = Hable (Uncharted 2). */
uniform float uTonemapMode;
/** 0 = SDR, 1 = HDR (tonemap strength — lighting stays linear HDR). */
uniform float uColorProfile;
/** Display gamma for canvas encode after tonemap (typically 2.2 / 2.4). */
uniform float uOutputGamma;
uniform float uAerialEnabled;
uniform sampler3D uAerialPerspectiveLUT;

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

  // SDR: LDR headroom — clamp before tonemap so highlights don't explode the film curve.
  if (uColorProfile < 0.5) {
    scene = clamp(scene, 0.0, 1.0);
    vol = clamp(vol, 0.0, 1.0);
  }

  // Linear HDR composite (scene + volumetric contribution).
  vec3 combined = scene + vol;

  // Tonemap once for the full frame.
  // SDR: full-strength operator. HDR: weaker pre-exposure keeps more relative dynamic range.
  vec3 mapped = (uColorProfile < 0.5)
      ? applyTonemap(combined)
      : applyTonemap(combined * 0.25);

  // Final display encode for the LDR canvas (both profiles).
  vec3 outc = applyDisplayGamma(mapped, uOutputGamma);

  gl_FragColor = vec4(outc, 1.0);
}
