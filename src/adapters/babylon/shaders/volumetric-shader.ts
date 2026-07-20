import { radianceFieldGlslFunctions } from '../../../engine/optics/beam-model';
import { VOLUMETRIC_LIGHT_SLOTS } from '../../../engine/render/pack';

function lightUniformDecls(slots: number): string {
  const lines: string[] = [];
  for (let i = 0; i < slots; i++) {
    lines.push(
      `uniform vec3 uLightOrigin${i}; uniform vec3 uLightDir${i}; uniform vec3 uLightColor${i};`,
      `uniform float uLightPower${i}; uniform float uLightScatter${i}; uniform float uLightMode${i};`,
      `uniform float uLightP0${i}; uniform float uLightP1${i}; uniform float uLightP2${i}; uniform float uLightP3${i};`,
      `uniform float uLightP4${i}; uniform float uLightP5${i};`,
      `uniform vec3 uLightSpill${i};`,
    );
  }
  return lines.join('\n');
}

function lightEvalInMarch(slots: number): string {
  const blocks: string[] = [];
  for (let i = 0; i < slots; i++) {
    blocks.push(`    if (uLightCount > ${i}.5) {
      float Li = rfEvalRadianceField(
        p, uLightOrigin${i}, uLightDir${i}, uLightMode${i},
        uLightP0${i}, uLightP1${i}, uLightP2${i}, uLightP3${i},
        uLightP4${i}, uLightP5${i}, uLightSpill${i}
      );
      if (Li > 1e-8) {
        float spec${i} = spectralScatterFactor(uLightScatter${i}, spectralExp);
        vec3 incident${i} = uLightMode${i} < 0.5
          ? normalize(p - uLightOrigin${i})
          : normalize(uLightDir${i});
        vec3 viewDir${i} = normalize(-rd);
        float cosTheta${i} = clamp(dot(incident${i}, viewDir${i}), -1.0, 1.0);
        // Full media HG phase (absolute); no mode-dependent theatrical blend.
        float mie${i} = phaseHG(cosTheta${i}, mieG);
        col += tint * uLightColor${i} * Li * scatter * T * uLightPower${i} * (0.5 + spec${i}) * mie${i};
      }
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
      `uLightP4${i}`,
      `uLightP5${i}`,
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
uniform mat4 uView;
uniform vec3 uCameraPos;
uniform float uUseSceneDepth;
uniform sampler2D uSceneDepth;

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
 * Henyey–Greenstein phase (absolute: ∫p dΩ = 1; g=0 → 1/(4π)).
 * Forward Mie (g→1): bright looking into the beam, dark from behind.
 */
float phaseHG(float cosTheta, float g) {
  float g2 = g * g;
  float denom = pow(max(1.0 - 2.0 * g * cosTheta + g2, 1e-6), 1.5);
  return ((1.0 - g2) / denom) * 0.0795774715; // 1/(4π)
}

/* Shared with surface plugin — CPU twin: engine/optics/beam-model.ts evalRadianceField */
${radianceFieldGlslFunctions()}

vec3 march(vec3 ro, vec3 rd, float sceneZCam) {
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

  float baseStep = max(uStepSize, 0.02);
  int maxSteps = int(uMaxSteps);
  float jitter = hash(rd * (uTime + 1.7)) * baseStep;
  vec3 col = vec3(0.0);
  float T = 1.0;
  float t = tMin + jitter;
  int i = 0;

  for (int k = 0; k < 512; k++) {
    if (i >= maxSteps || t >= tMax) break;
    vec3 p = ro + rd * t;
    if (uUseSceneDepth > 0.5 && sceneZCam > 1e-4) {
      float z = abs((uView * vec4(p + uCameraPos, 1.0)).z);
      if (z >= sceneZCam - 0.03) break;
    }
    float dens;
    vec3 tint;
    float sigmaS;
    float sigmaA;
    float spectralExp;
    float mieG;
    sampleMedia(p, dens, tint, sigmaS, sigmaA, spectralExp, mieG);

    // Empty-space skip: larger steps when density is negligible
    float stepSize = baseStep;
    if (dens < uDensityThreshold) {
      stepSize = baseStep * 2.5;
      t += stepSize;
      i++;
      continue;
    }

    float sigmaT = sigmaS + sigmaA;
    T *= exp(-sigmaT * dens * stepSize * 0.5);
    if (T < uTransmittanceCut) break;
    float scatter = sigmaS * dens * stepSize;

${lightEvalInMarch(VOLUMETRIC_LIGHT_SLOTS)}

    t += stepSize;
    i++;
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

  float sceneZCam = 0.0;
  if (uUseSceneDepth > 0.5) {
    sceneZCam = texture2D(uSceneDepth, vUV).r;
  }

  vec3 vol = march(ro, rd, sceneZCam);
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
`;

export const VOLUMETRIC_UNIFORMS = [
  'uResolution',
  'uTime',
  'uInvViewProj',
  'uView',
  'uCameraPos',
  'uUseSceneDepth',
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

export const VOLUMETRIC_SAMPLERS = ['uSceneDepth'];
