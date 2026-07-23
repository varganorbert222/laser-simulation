#version 300 es
precision highp float;
precision highp sampler3D;
precision highp sampler2D;

in vec2 vUV;
out vec4 outColor;

uniform int uDim; // 2 or 3
uniform sampler2D uTex2D;
uniform sampler3D uTex3D;
uniform vec2 uYawPitch;
uniform float uTime;

mat3 rotY(float a) {
  float c = cos(a), s = sin(a);
  return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c);
}
mat3 rotX(float a) {
  float c = cos(a), s = sin(a);
  return mat3(1.0, 0.0, 0.0, 0.0, c, -s, 0.0, s, c);
}

float sampleDensity(vec3 p) {
  if (uDim == 2) {
    return texture(uTex2D, fract(p.xy)).r;
  }
  return texture(uTex3D, fract(p)).r;
}

void main() {
  vec2 ndc = vUV * 2.0 - 1.0;
  mat3 R = rotY(uYawPitch.x) * rotX(uYawPitch.y);
  vec3 ro = R * vec3(0.0, 0.0, -1.85);
  vec3 rd = normalize(R * vec3(ndc.x * 0.85, ndc.y * 0.85, 1.2));

  // Unit cube [0,1]^3
  vec3 inv = 1.0 / rd;
  vec3 t0 = (vec3(0.0) - ro) * inv;
  vec3 t1 = (vec3(1.0) - ro) * inv;
  vec3 tmin = min(t0, t1);
  vec3 tmax = max(t0, t1);
  float tEnter = max(max(tmin.x, tmin.y), tmin.z);
  float tExit = min(min(tmax.x, tmax.y), tmax.z);
  if (tExit < max(tEnter, 0.0)) {
    outColor = vec4(0.06, 0.07, 0.09, 1.0);
    return;
  }

  float t0c = max(tEnter, 0.0);
  float t1c = tExit;
  vec3 col = vec3(0.04, 0.045, 0.055);
  float T = 1.0;
  const int STEPS = 64;
  float dt = (t1c - t0c) / float(STEPS);
  for (int i = 0; i < STEPS; i++) {
    float t = t0c + (float(i) + 0.5) * dt;
    vec3 p = ro + rd * t;
    float d = sampleDensity(p);
    float dens = smoothstep(0.28, 0.72, d);
    if (uDim == 2) {
      // Thin slab around mid-Z for 2D assets
      dens *= 1.0 - smoothstep(0.08, 0.22, abs(p.z - 0.5));
    }
    float a = dens * dens * 0.085;
    vec3 c = mix(vec3(0.35, 0.38, 0.42), vec3(0.92, 0.88, 0.78), dens);
    col += T * a * c;
    T *= exp(-a * 1.8);
    if (T < 0.02) break;
  }
  // Soft vignette
  float vig = smoothstep(1.2, 0.2, length(ndc));
  col *= mix(0.75, 1.0, vig);
  outColor = vec4(col, 1.0);
}
