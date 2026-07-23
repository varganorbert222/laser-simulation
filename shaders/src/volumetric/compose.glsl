precision highp float;

varying vec2 vUV;
uniform sampler2D textureSampler;
uniform sampler2D volumetricTexture;
uniform float uTonemapMode; // 0 = ACES, 1 = Reinhard

float acesFilmCurve(float x) {
  float a = 2.51;
  float b = 0.03;
  float c = 2.43;
  float d = 0.59;
  float e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

vec3 acesLuminance(vec3 hdr) {
  float y = dot(hdr, vec3(0.2126, 0.7152, 0.0722));
  if (y < 1e-8) return vec3(0.0);
  float mappedY = acesFilmCurve(y);
  vec3 mapped = hdr * (mappedY / y);
  float peak = max(mapped.r, max(mapped.g, mapped.b));
  if (peak > 1.0) mapped /= peak;
  return mapped;
}

vec3 reinhardLuminance(vec3 hdr) {
  float y = dot(hdr, vec3(0.2126, 0.7152, 0.0722));
  if (y < 1e-8) return vec3(0.0);
  float mappedY = y / (1.0 + y);
  vec3 mapped = hdr * (mappedY / y);
  float peak = max(mapped.r, max(mapped.g, mapped.b));
  if (peak > 1.0) mapped /= peak;
  return mapped;
}

void main(void) {
  vec3 scene = texture2D(textureSampler, vUV).rgb;
  vec3 vol = texture2D(volumetricTexture, vUV).rgb;
  vec3 volMapped = uTonemapMode > 0.5 ? reinhardLuminance(vol) : acesLuminance(vol);
  vec3 outc = scene + volMapped;
  gl_FragColor = vec4(outc, 1.0);
}
