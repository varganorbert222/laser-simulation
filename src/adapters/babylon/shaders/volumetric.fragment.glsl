#version 300 es
precision highp float;

in vec2 vUV;
out vec4 fragColor;

uniform sampler2D textureSampler;
uniform vec2 uResolution;
uniform float uTime;
uniform mat4 uInvViewProj;
uniform vec3 uCameraPos;

uniform float uStepSize;
uniform int uMaxSteps;
uniform float uDensityThreshold;
uniform float uTransmittanceCut;

uniform int uLightCount;
uniform vec3 uLightOrigin[8];
uniform vec3 uLightDir[8];
uniform vec3 uLightColor[8];
uniform float uLightPower[8];
uniform float uLightScatter[8];
uniform float uLightMode[8];
uniform float uLightP0[8];
uniform float uLightP1[8];
uniform float uLightP2[8];
uniform float uLightP3[8];

uniform int uMediaCount;
uniform vec3 uMediaCenter[4];
uniform vec3 uMediaHalfExt[4];
uniform float uMediaDensity[4];
uniform float uMediaFbmScale[4];
uniform float uMediaFbmTime[4];

float hash(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float noise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n000 = hash(i + vec3(0, 0, 0));
  float n100 = hash(i + vec3(1, 0, 0));
  float n010 = hash(i + vec3(0, 1, 0));
  float n110 = hash(i + vec3(1, 1, 0));
  float n001 = hash(i + vec3(0, 0, 1));
  float n101 = hash(i + vec3(1, 0, 1));
  float n011 = hash(i + vec3(0, 1, 1));
  float n111 = hash(i + vec3(1, 1, 1));
  float nx00 = mix(n000, n100, f.x);
  float nx10 = mix(n010, n110, f.x);
  float nx01 = mix(n001, n101, f.x);
  float nx11 = mix(n011, n111, f.x);
  float nxy0 = mix(nx00, nx10, f.y);
  float nxy1 = mix(nx01, nx11, f.y);
  return mix(nxy0, nxy1, f.z);
}

float fbm(vec3 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 3; i++) {
    v += a * noise(p);
    p *= 2.0;
    a *= 0.5;
  }
  return v;
}

bool intersectBox(vec3 ro, vec3 rd, vec3 center, vec3 halfSize, out float tEnter, out float tExit) {
  vec3 boxMin = center - halfSize;
  vec3 boxMax = center + halfSize;
  vec3 invDir = 1.0 / rd;
  vec3 t0 = (boxMin - ro) * invDir;
  vec3 t1 = (boxMax - ro) * invDir;
  vec3 tsmaller = min(t0, t1);
  vec3 tbigger = max(t0, t1);
  tEnter = max(max(tsmaller.x, tsmaller.y), tsmaller.z);
  tExit = min(min(tbigger.x, tbigger.y), tbigger.z);
  return tExit > max(tEnter, 0.0);
}

float mediaDensityAt(vec3 pCam) {
  float d = 0.0;
  for (int i = 0; i < 4; i++) {
    if (i >= uMediaCount) break;
    vec3 local = pCam - uMediaCenter[i];
    if (any(greaterThan(abs(local), uMediaHalfExt[i]))) continue;
    float field = fbm(local * uMediaFbmScale[i] + vec3(0.0, uTime * uMediaFbmTime[i], 0.0));
    float dens = smoothstep(0.2, 0.8, field) * uMediaDensity[i];
    d = max(d, dens);
  }
  return d;
}

float beamRadiusAt(float t, float w0, float parallelness, float lambdaM) {
  float zR = 3.14159265 * w0 * w0 / max(lambdaM, 1e-12);
  float gauss = w0 * sqrt(1.0 + (t / max(zR, 1e-6)) * (t / max(zR, 1e-6)));
  float diverging = w0 + 0.002 * t;
  return mix(diverging, gauss, clamp(parallelness, 0.0, 1.0));
}

float lightIntensity(vec3 pCam, int li) {
  vec3 o = uLightOrigin[li];
  vec3 d = normalize(uLightDir[li]);
  float mode = uLightMode[li];
  vec3 op = pCam - o;
  float t = dot(op, d);
  if (t < 0.0) return 0.0;
  vec3 closest = o + d * t;
  float r = length(pCam - closest);

  if (mode < 0.5) {
    float softR = max(uLightP0[li], 0.01);
    float falloff = max(uLightP1[li], 0.5);
    float dist = length(op);
    return 1.0 / (1.0 + pow(dist / softR, falloff));
  }

  if (mode < 1.5) {
    float inner = uLightP0[li];
    float outer = max(uLightP1[li], inner + 0.001);
    float sharpness = max(uLightP2[li], 1.0);
    vec3 v = normalize(op);
    float cosTheta = max(dot(v, d), 0.0);
    float angle = acos(cosTheta);
    float cone = 1.0 - smoothstep(inner, outer, angle);
    float radial = exp(-(r * r) / (0.15 * 0.15));
    return cone * pow(cosTheta, sharpness * 0.25) * radial;
  }

  if (mode < 2.5) {
    float br = uLightP0[li] + uLightP1[li] * t;
    return exp(-(r * r) / max(br * br, 1e-8));
  }

  // laser
  float w0 = max(uLightP0[li], 1e-4);
  float parallelness = uLightP1[li];
  float lambdaM = max(uLightP2[li], 1e-9);
  float br = beamRadiusAt(t, w0, parallelness, lambdaM);
  float radial = exp(-(r * r) / max(br * br, 1e-10));
  float axial = exp(-0.08 * t);
  return radial * axial;
}

vec3 march(vec3 ro, vec3 rd) {
  if (uMediaCount <= 0 || uLightCount <= 0) return vec3(0.0);

  float tEnter = 1e9;
  float tExit = -1e9;
  bool anyHit = false;
  for (int i = 0; i < 4; i++) {
    if (i >= uMediaCount) break;
    float te, tx;
    if (intersectBox(ro, rd, uMediaCenter[i], uMediaHalfExt[i], te, tx)) {
      anyHit = true;
      tEnter = min(tEnter, te);
      tExit = max(tExit, tx);
    }
  }
  if (!anyHit) return vec3(0.0);

  float tMin = max(0.0, tEnter);
  float tMax = tExit;
  if (tMax <= tMin) return vec3(0.0);

  float stepSize = max(uStepSize, 0.02);
  int steps = int((tMax - tMin) / stepSize);
  steps = min(steps, uMaxSteps);

  float jitter = hash(rd * (uTime + 1.7)) * stepSize;
  vec3 col = vec3(0.0);
  float T = 1.0;
  float sigma_s = 0.85;
  float sigma_a = 0.2;
  float sigma_t = sigma_s + sigma_a;

  for (int i = 0; i < 512; i++) {
    if (i >= steps) break;
    float t = tMin + float(i) * stepSize + jitter;
    vec3 p = ro + rd * t;

    float dens = mediaDensityAt(p);
    if (dens < uDensityThreshold) continue;

    float extinction = sigma_t * dens * stepSize;
    T *= exp(-extinction * 0.5);
    if (T < uTransmittanceCut) break;

    float scatter = sigma_s * dens * stepSize;
    for (int li = 0; li < 8; li++) {
      if (li >= uLightCount) break;
      float Li = lightIntensity(p, li);
      if (Li <= 0.0) continue;
      col += uLightColor[li] * Li * scatter * T * uLightPower[li] * uLightScatter[li];
    }
  }

  return col;
}

void main() {
  vec4 scene = texture(textureSampler, vUV);

  // Camera-relative ray: start on near plane (correct for both perspective and ortho).
  vec2 ndc = vUV * 2.0 - 1.0;
  vec4 nearH = uInvViewProj * vec4(ndc, -1.0, 1.0);
  vec4 farH = uInvViewProj * vec4(ndc, 1.0, 1.0);
  vec3 nearW = nearH.xyz / max(nearH.w, 1e-8);
  vec3 farW = farH.xyz / max(farH.w, 1e-8);
  vec3 ro = nearW - uCameraPos;
  vec3 rd = normalize(farW - nearW);

  vec3 vol = march(ro, rd);
  vol = vol / (vec3(1.0) + vol);
  vol = pow(vol, vec3(0.4545));

  fragColor = vec4(scene.rgb + vol, 1.0);
}
