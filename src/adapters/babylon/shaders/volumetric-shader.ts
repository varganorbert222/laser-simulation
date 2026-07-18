import { VOLUMETRIC_LIGHT_SLOTS } from '../../../engine/render/pack';

function lightUniformDecls(slots: number): string {
  const lines: string[] = [];
  for (let i = 0; i < slots; i++) {
    lines.push(
      `uniform vec3 uLightOrigin${i}; uniform vec3 uLightDir${i}; uniform vec3 uLightColor${i};`,
      `uniform float uLightPower${i}; uniform float uLightScatter${i}; uniform float uLightMode${i};`,
      `uniform float uLightP0${i}; uniform float uLightP1${i}; uniform float uLightP2${i}; uniform float uLightP3${i};`,
      `uniform vec3 uLightSpill${i};`,
    );
  }
  return lines.join('\n');
}

function lightEvalInMarch(slots: number): string {
  const blocks: string[] = [];
  for (let i = 0; i < slots; i++) {
    blocks.push(`    if (uLightCount > ${i}.5) {
      float Li = evalLightWithSpill(
        p, uLightOrigin${i}, uLightDir${i}, uLightMode${i},
        uLightP0${i}, uLightP1${i}, uLightP2${i}, uLightP3${i}, uLightSpill${i}
      );
      float spec${i} = spectralScatterFactor(uLightScatter${i}, spectralExp);
      // Mie: cosθ = ω_in · ω_out (laser dir · view toward camera; cam-space origin = 0).
      vec3 viewDir${i} = normalize(-(p + rd * 1e-4));
      float cosTheta${i} = clamp(dot(normalize(uLightDir${i}), viewDir${i}), -1.0, 1.0);
      float mie${i} = phaseHG(cosTheta${i}, mieG);
      col += tint * uLightColor${i} * Li * scatter * T * uLightPower${i} * (0.5 + spec${i}) * mie${i} * 2.4;
    }`);
  }
  return blocks.join('\n');
}

function lightUniformNames(slots: number): string[] {
  const names: string[] = ['uLightCount'];
  for (let i = 0; i < slots; i++) {
    names.push(
      `uLightOrigin${i}`,
      `uLightDir${i}`,
      `uLightColor${i}`,
      `uLightPower${i}`,
      `uLightScatter${i}`,
      `uLightMode${i}`,
      `uLightP0${i}`,
      `uLightP1${i}`,
      `uLightP2${i}`,
      `uLightP3${i}`,
      `uLightSpill${i}`,
    );
  }
  return names;
}

/** Babylon PostProcess–compatible volumetric fragment (camera rays, no orbit cam). */
export const VOLUMETRIC_FRAGMENT = `
precision highp float;

varying vec2 vUV;
uniform vec2 uResolution;
uniform float uTime;
uniform mat4 uInvViewProj;
uniform vec3 uCameraPos;

uniform float uStepSize;
uniform float uMaxSteps;
uniform float uDensityThreshold;
uniform float uTransmittanceCut;

uniform float uLightCount;
${lightUniformDecls(VOLUMETRIC_LIGHT_SLOTS)}

uniform float uMediaCount;
uniform vec3 uMediaCenter0; uniform vec3 uMediaHalfExt0; uniform vec3 uMediaColor0;
uniform float uMediaDensity0; uniform float uMediaFbmScale0; uniform float uMediaFbmTime0;
uniform float uMediaNoiseLow0; uniform float uMediaNoiseHigh0;
uniform float uMediaScatter0; uniform float uMediaAbsorb0; uniform float uMediaSpectralExp0;
uniform float uMediaMieG0;

uniform vec3 uMediaCenter1; uniform vec3 uMediaHalfExt1; uniform vec3 uMediaColor1;
uniform float uMediaDensity1; uniform float uMediaFbmScale1; uniform float uMediaFbmTime1;
uniform float uMediaNoiseLow1; uniform float uMediaNoiseHigh1;
uniform float uMediaScatter1; uniform float uMediaAbsorb1; uniform float uMediaSpectralExp1;
uniform float uMediaMieG1;

float hash(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float noise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n000 = hash(i);
  float n100 = hash(i + vec3(1.0, 0.0, 0.0));
  float n010 = hash(i + vec3(0.0, 1.0, 0.0));
  float n110 = hash(i + vec3(1.0, 1.0, 0.0));
  float n001 = hash(i + vec3(0.0, 0.0, 1.0));
  float n101 = hash(i + vec3(1.0, 0.0, 1.0));
  float n011 = hash(i + vec3(0.0, 1.0, 1.0));
  float n111 = hash(i + vec3(1.0, 1.0, 1.0));
  float nx00 = mix(n000, n100, f.x);
  float nx10 = mix(n010, n110, f.x);
  float nx01 = mix(n001, n101, f.x);
  float nx11 = mix(n011, n111, f.x);
  return mix(mix(nx00, nx10, f.y), mix(nx01, nx11, f.y), f.z);
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

void sampleMedia(
  vec3 pCam,
  out float dens,
  out vec3 tint,
  out float sigmaS,
  out float sigmaA,
  out float spectralExp,
  out float mieG
) {
  dens = 0.0;
  tint = vec3(1.0);
  sigmaS = 0.9;
  sigmaA = 0.2;
  // Default Tyndall-like (weak λ dependence) if no media hit.
  spectralExp = 0.2;
  mieG = 0.0;

  if (uMediaCount > 0.5) {
    vec3 local = pCam - uMediaCenter0;
    if (!any(greaterThan(abs(local), uMediaHalfExt0))) {
      float field = fbm(local * uMediaFbmScale0 + vec3(0.0, uTime * uMediaFbmTime0, 0.0));
      float low = min(uMediaNoiseLow0, uMediaNoiseHigh0 - 0.001);
      float high = max(uMediaNoiseHigh0, low + 0.001);
      float d = smoothstep(low, high, field) * uMediaDensity0;
      if (d >= dens) {
        dens = d;
        tint = uMediaColor0;
        sigmaS = max(uMediaScatter0, 0.0);
        sigmaA = max(uMediaAbsorb0, 0.0);
        spectralExp = uMediaSpectralExp0;
        mieG = clamp(uMediaMieG0, -0.95, 0.95);
      }
    }
  }
  if (uMediaCount > 1.5) {
    vec3 local = pCam - uMediaCenter1;
    if (!any(greaterThan(abs(local), uMediaHalfExt1))) {
      float field = fbm(local * uMediaFbmScale1 + vec3(0.0, uTime * uMediaFbmTime1, 0.0));
      float low = min(uMediaNoiseLow1, uMediaNoiseHigh1 - 0.001);
      float high = max(uMediaNoiseHigh1, low + 0.001);
      float d = smoothstep(low, high, field) * uMediaDensity1;
      if (d >= dens) {
        dens = d;
        tint = uMediaColor1;
        sigmaS = max(uMediaScatter1, 0.0);
        sigmaA = max(uMediaAbsorb1, 0.0);
        spectralExp = uMediaSpectralExp1;
        mieG = clamp(uMediaMieG1, -0.95, 0.95);
      }
    }
  }
}

/**
 * Remap packed Rayleigh weight w₄=(λ_ref/λ)⁴ to λ⁻ⁿ for the media regime.
 * Tyndall (n≈0) → ~1 (white cone); Rayleigh (n=4) → full λ⁻⁴.
 */
float spectralScatterFactor(float rayleighWeight, float exponent) {
  float w = max(rayleighWeight, 1e-6);
  float n = max(exponent, 0.0);
  if (n < 1e-4) return 1.0;
  return pow(w, n / 4.0);
}

/**
 * Henyey–Greenstein phase (relative: g=0 → 1).
 * Forward Mie (g→1): bright looking into the beam, dark from behind.
 */
float phaseHG(float cosTheta, float g) {
  float g2 = g * g;
  float denom = pow(max(1.0 - 2.0 * g * cosTheta + g2, 1e-6), 1.5);
  return (1.0 - g2) / denom;
}

float beamRadiusAt(float t, float w0, float parallelness, float lambdaM) {
  float zR = 3.14159265 * w0 * w0 / max(lambdaM, 1e-12);
  float gauss = w0 * sqrt(1.0 + (t / max(zR, 1e-6)) * (t / max(zR, 1e-6)));
  float diverging = w0 + 0.002 * t;
  return mix(diverging, gauss, clamp(parallelness, 0.0, 1.0));
}

float evalLight(vec3 pCam, vec3 o, vec3 dIn, float mode, float p0, float p1, float p2, float p3) {
  vec3 d = normalize(dIn);
  vec3 op = pCam - o;
  float t = dot(op, d);
  if (t < 0.0) return 0.0;
  float r = length(pCam - (o + d * t));

  if (mode < 0.5) {
    float softR = max(p0, 0.01);
    return 1.0 / (1.0 + pow(length(op) / softR, max(p1, 0.5)));
  }
  if (mode < 1.5) {
    float inner = p0;
    float outer = max(p1, inner + 0.001);
    vec3 v = normalize(op);
    float cosTheta = max(dot(v, d), 0.0);
    float angle = acos(cosTheta);
    float cone = 1.0 - smoothstep(inner, outer, angle);
    return cone * pow(cosTheta, max(p2, 1.0) * 0.25) * exp(-(r * r) / 0.0225);
  }
  if (mode < 2.5) {
    float br = p0 + p1 * t;
    return exp(-(r * r) / max(br * br, 1e-8));
  }
  float w0 = max(p0, 1e-4);
  float br = beamRadiusAt(t, w0, p1, max(p2, 1e-9));
  return exp(-(r * r) / max(br * br, 1e-10)) * exp(-0.08 * t);
}

/**
 * Core beam + optics spill:
 * - stray: wide soft field under/around the focused beam
 * - internal reflection: farther secondary lobe / “ground field”
 * - aperture spill: near-origin glow at the aperture rim
 * Core radius estimate keeps spill proportional to the main beam width.
 */
float evalLightWithSpill(
  vec3 pCam,
  vec3 o,
  vec3 dIn,
  float mode,
  float p0,
  float p1,
  float p2,
  float p3,
  vec3 spill
) {
  float core = evalLight(pCam, o, dIn, mode, p0, p1, p2, p3);
  float strayW = max(spill.x, 0.0);
  float internalW = max(spill.y, 0.0);
  float apertureW = max(spill.z, 0.0);
  if (strayW + internalW + apertureW < 1e-5) return core;

  vec3 d = normalize(dIn);
  vec3 op = pCam - o;
  float t = dot(op, d);
  if (t < 0.0) {
    // Behind aperture: only a tiny rim glow can peek backward.
    float rb = length(op);
    return core + apertureW * 0.025 * exp(-(rb * rb) / 0.01);
  }
  float r = length(pCam - (o + d * t));

  float brCore = 0.02;
  if (mode >= 2.5) {
    brCore = beamRadiusAt(t, max(p0, 1e-4), p1, max(p2, 1e-9));
  } else if (mode >= 1.5) {
    brCore = max(p0 + p1 * t, 0.01);
  } else if (mode >= 0.5) {
    brCore = 0.15;
  } else {
    brCore = max(p0 * 0.25, 0.05);
  }

  // Stray / internal / aperture are fractions of optical power — keep peaks ≪ core (~1).
  // Previously strayW≈1 made spill as bright as the main beam and washed it out.
  float brStray = brCore * (2.5 + 2.0 * strayW);
  float stray =
    0.045 * strayW * exp(-(r * r) / max(brStray * brStray, 1e-6)) * exp(-0.05 * t);

  float brLobe = brCore * (5.0 + 3.0 * internalW);
  float lobe =
    0.028 * internalW *
    exp(-(r * r) / max(brLobe * brLobe, 1e-6)) *
    smoothstep(0.6, 4.0, t) *
    exp(-0.035 * t);

  float apertR = 0.02 + brCore * 1.2;
  float apert =
    0.07 * apertureW *
    exp(-(r * r) / max(apertR * apertR, 1e-6)) *
    exp(-t / max(0.1 + 0.15 * apertureW, 0.05));

  return core + stray + lobe + apert;
}

vec3 march(vec3 ro, vec3 rd) {
  if (uMediaCount < 0.5 || uLightCount < 0.5) return vec3(0.0);

  float tEnter = 1e9;
  float tExit = -1e9;
  bool anyHit = false;
  float te; float tx;
  if (uMediaCount > 0.5 && intersectBox(ro, rd, uMediaCenter0, uMediaHalfExt0, te, tx)) {
    anyHit = true; tEnter = min(tEnter, te); tExit = max(tExit, tx);
  }
  if (uMediaCount > 1.5 && intersectBox(ro, rd, uMediaCenter1, uMediaHalfExt1, te, tx)) {
    anyHit = true; tEnter = min(tEnter, te); tExit = max(tExit, tx);
  }
  if (!anyHit) return vec3(0.0);

  float tMin = max(0.0, tEnter);
  float tMax = tExit;
  if (tMax <= tMin) return vec3(0.0);

  float stepSize = max(uStepSize, 0.02);
  int steps = int(min((tMax - tMin) / stepSize, uMaxSteps));
  float jitter = hash(rd * (uTime + 1.7)) * stepSize;
  vec3 col = vec3(0.0);
  float T = 1.0;

  for (int i = 0; i < 256; i++) {
    if (i >= steps) break;
    float t = tMin + float(i) * stepSize + jitter;
    vec3 p = ro + rd * t;
    float dens;
    vec3 tint;
    float sigmaS;
    float sigmaA;
    float spectralExp;
    float mieG;
    sampleMedia(p, dens, tint, sigmaS, sigmaA, spectralExp, mieG);
    if (dens < uDensityThreshold) continue;
    float sigmaT = sigmaS + sigmaA;
    T *= exp(-sigmaT * dens * stepSize * 0.5);
    if (T < uTransmittanceCut) break;
    float scatter = sigmaS * dens * stepSize;

${lightEvalInMarch(VOLUMETRIC_LIGHT_SLOTS)}
  }
  return col;
}

void main(void) {
  // Reconstruct camera-relative ray (pack positions are world − cameraPos).
  // Perspective: rays diverge from the eye; orthographic: parallel rays with
  // a lateral origin on the near plane — so ro must be the unprojected near point,
  // not the camera origin (which breaks ortho completely).
  vec2 ndc = vUV * 2.0 - 1.0;
  vec4 nearH = uInvViewProj * vec4(ndc, -1.0, 1.0);
  vec4 farH = uInvViewProj * vec4(ndc, 1.0, 1.0);
  vec3 nearW = nearH.xyz / max(nearH.w, 1e-8);
  vec3 farW = farH.xyz / max(farH.w, 1e-8);
  vec3 ro = nearW - uCameraPos;
  vec3 rd = normalize(farW - nearW);

  vec3 vol = march(ro, rd);
  // HDR linear contribution — tonemap + gamma happen after compose (ACES in DRP).
  gl_FragColor = vec4(vol, 1.0);
}
`;

/** Full-res compose: tonemap volumetrics only, soft-add onto the native scene. */
export const VOLUMETRIC_COMPOSE_FRAGMENT = `
precision highp float;

varying vec2 vUV;
uniform sampler2D textureSampler;
uniform sampler2D volumetricTexture;

float acesFilmCurve(float x) {
  float a = 2.51;
  float b = 0.03;
  float c = 2.43;
  float d = 0.59;
  float e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

// Tonemap luminance only — preserves λ chromaticity (no green→yellow clip).
vec3 acesLuminance(vec3 hdr) {
  float y = dot(hdr, vec3(0.2126, 0.7152, 0.0722));
  if (y < 1e-8) return vec3(0.0);
  float mappedY = acesFilmCurve(y);
  vec3 mapped = hdr * (mappedY / y);
  float peak = max(mapped.r, max(mapped.g, mapped.b));
  if (peak > 1.0) mapped /= peak;
  return mapped;
}

void main(void) {
  vec3 scene = texture2D(textureSampler, vUV).rgb;
  vec3 vol = texture2D(volumetricTexture, vUV).rgb;
  // Tonemap beam/fog alone (keeps λ hue). Add onto scene — do not re-crush with / (1+y).
  vec3 volMapped = acesLuminance(vol);
  vec3 outc = scene + volMapped;
  gl_FragColor = vec4(outc, 1.0);
}
`;

export const VOLUMETRIC_UNIFORMS = [
  'uResolution',
  'uTime',
  'uInvViewProj',
  'uCameraPos',
  'uStepSize',
  'uMaxSteps',
  'uDensityThreshold',
  'uTransmittanceCut',
  ...lightUniformNames(VOLUMETRIC_LIGHT_SLOTS),
  'uMediaCount',
  'uMediaCenter0', 'uMediaHalfExt0', 'uMediaColor0',
  'uMediaDensity0', 'uMediaFbmScale0', 'uMediaFbmTime0',
  'uMediaNoiseLow0', 'uMediaNoiseHigh0', 'uMediaScatter0', 'uMediaAbsorb0', 'uMediaSpectralExp0',
  'uMediaMieG0',
  'uMediaCenter1', 'uMediaHalfExt1', 'uMediaColor1',
  'uMediaDensity1', 'uMediaFbmScale1', 'uMediaFbmTime1',
  'uMediaNoiseLow1', 'uMediaNoiseHigh1', 'uMediaScatter1', 'uMediaAbsorb1', 'uMediaSpectralExp1',
  'uMediaMieG1',
];
