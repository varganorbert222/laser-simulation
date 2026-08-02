/**
 * Shared Gerstner-like multi-sine free-surface (height + slopes).
 * Callers pass amp/freq/steep/t — no uniforms here (water PP + volumetric).
 */

void waveTangentFrame(vec3 up, out vec3 ax, out vec3 az) {
  ax = normalize(cross(abs(up.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0), up));
  az = normalize(cross(up, ax));
}

/**
 * Three directional components (Gerstner slope ≈ k·A·cos(k·x − ωt)).
 * Height h = Σ A·sin(phase); slopes match ∂h/∂x, ∂h/∂z.
 */
void waveHeightAndSlopes(
  float x,
  float z,
  float amp,
  float freq,
  float steep,
  float t,
  out float h,
  out float dx,
  out float dz
) {
  float a = max(amp, 0.0);
  float f = max(freq, 0.05);
  float s = clamp(steep, 0.0, 1.0);

  vec2 k0 = normalize(vec2(1.0, 0.15));
  vec2 k1 = normalize(vec2(-0.55, 0.85));
  vec2 k2 = normalize(vec2(0.35, -0.9));
  float a0 = a;
  float a1 = a * 0.55;
  float a2 = a * 0.28;
  float f0 = f;
  float f1 = f * 1.7;
  float f2 = f * 2.9;
  float p0 = dot(vec2(x, z), k0) * f0 - t * 1.4;
  float p1 = dot(vec2(x, z), k1) * f1 + t * 1.1;
  float p2 = dot(vec2(x, z), k2) * f2 - t * 2.2;

  h = a0 * sin(p0) + a1 * sin(p1) + a2 * sin(p2);

  dx = 0.0;
  dz = 0.0;
  dx += -k0.x * a0 * f0 * cos(p0) * (1.0 + s);
  dz += -k0.y * a0 * f0 * cos(p0) * (1.0 + s);
  dx += -k1.x * a1 * f1 * cos(p1) * (1.0 + s * 0.7);
  dz += -k1.y * a1 * f1 * cos(p1) * (1.0 + s * 0.7);
  dx += -k2.x * a2 * f2 * cos(p2);
  dz += -k2.y * a2 * f2 * cos(p2);
}

float waveHeight(float x, float z, float amp, float freq, float steep, float t) {
  float h;
  float dx;
  float dz;
  waveHeightAndSlopes(x, z, amp, freq, steep, t, h, dx, dz);
  return h;
}

vec3 waveNormalAt(vec3 hit, vec3 up, float amp, float freq, float steep, float t) {
  vec3 ax;
  vec3 az;
  waveTangentFrame(up, ax, az);
  float x = dot(hit, ax);
  float z = dot(hit, az);
  float h;
  float dx;
  float dz;
  waveHeightAndSlopes(x, z, amp, freq, steep, t, h, dx, dz);
  return normalize(up - ax * dx - az * dz);
}
