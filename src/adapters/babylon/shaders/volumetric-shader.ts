import { radianceFieldGlslFunctions } from '../../../engine/optics/beam-model';
import {
  VOLUMETRIC_LIGHT_SLOTS,
  VOLUMETRIC_MEDIA_SLOTS,
} from '../../../engine/render/pack';

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

function mediaUniformDecls(slots: number): string {
  const lines: string[] = [];
  for (let i = 0; i < slots; i++) {
    lines.push(
      `uniform vec3 uMediaCenter${i}; uniform vec3 uMediaHalfExt${i}; uniform vec3 uMediaColor${i};`,
      `uniform float uMediaDensity${i}; uniform float uMediaFbmScale${i}; uniform float uMediaFbmTime${i};`,
      `uniform float uMediaNoiseLow${i}; uniform float uMediaNoiseHigh${i};`,
      `uniform float uMediaNoiseKind${i};`,
      `uniform sampler2D uMediaNoise2D${i};`,
      `uniform sampler3D uMediaNoise3D${i};`,
      `uniform float uMediaScatter${i}; uniform float uMediaScatterMie${i}; uniform float uMediaAbsorb${i};`,
      `uniform float uMediaSpectralExp${i}; uniform float uMediaMieG${i};`,
      `uniform float uMediaScatterModel${i}; uniform float uMediaTurbulence${i};`,
      `uniform float uMediaLayerKind${i}; uniform float uMediaInsulating${i};`,
      `uniform float uMediaEmission${i}; uniform float uMediaConeCos${i}; uniform float uMediaPlumeLen${i};`,
      `uniform vec3 uMediaPlumeDir${i};`,
    );
  }
  return lines.join('\n');
}

function mediaUniformNames(slots: number): string[] {
  const names: string[] = ['uMediaCount'];
  for (let i = 0; i < slots; i++) {
    names.push(
      `uMediaCenter${i}`,
      `uMediaHalfExt${i}`,
      `uMediaColor${i}`,
      `uMediaDensity${i}`,
      `uMediaFbmScale${i}`,
      `uMediaFbmTime${i}`,
      `uMediaNoiseLow${i}`,
      `uMediaNoiseHigh${i}`,
      `uMediaNoiseKind${i}`,
      `uMediaScatter${i}`,
      `uMediaScatterMie${i}`,
      `uMediaAbsorb${i}`,
      `uMediaSpectralExp${i}`,
      `uMediaMieG${i}`,
      `uMediaScatterModel${i}`,
      `uMediaTurbulence${i}`,
      `uMediaLayerKind${i}`,
      `uMediaInsulating${i}`,
      `uMediaEmission${i}`,
      `uMediaConeCos${i}`,
      `uMediaPlumeLen${i}`,
      `uMediaPlumeDir${i}`,
    );
  }
  return names;
}

function mediaNoiseSamplers(slots: number): string[] {
  const names: string[] = [];
  for (let i = 0; i < slots; i++) {
    names.push(`uMediaNoise2D${i}`, `uMediaNoise3D${i}`);
  }
  return names;
}

/** Per-slot noise sample from baked 2D or 3D texture (kind 0 → flat 0.5). */
function mediaNoiseSampleFn(i: number): string {
  return `float sampleMediaNoise${i}(vec3 p) {
  float kind = uMediaNoiseKind${i};
  if (kind > 2.5) return texture(uMediaNoise3D${i}, fract(p)).r;
  if (kind > 1.5) return texture(uMediaNoise2D${i}, fract(p.xy)).r;
  return 0.5;
}`;
}

function mediaNoiseSampleFns(slots: number): string {
  const lines: string[] = [];
  for (let i = 0; i < slots; i++) lines.push(mediaNoiseSampleFn(i));
  return lines.join('\n');
}

/**
 * Layered multi-media sample (Exp-C: dual-pass):
 *   Pass 1 — innermost insulating climate (noise volume once per insulating slot)
 *   Pass 2 — particulate / outdoor only (skip insulating → one sample per slot total)
 */
function mediaSampleAccum(slots: number): string {
  const pass1: string[] = [];
  const pass2: string[] = [];
  for (let i = 0; i < slots; i++) {
    pass1.push(`  if (uMediaCount > ${i}.5 && uMediaInsulating${i} > 0.5) {
    vec3 localI${i} = pCam - uMediaCenter${i};
    if (!any(greaterThan(abs(localI${i}), uMediaHalfExt${i}))) {
      float fieldI${i} = sampleMediaNoise${i}(localI${i} * uMediaFbmScale${i} + vec3(0.0, uTime * uMediaFbmTime${i}, 0.0));
      float lowI${i} = min(uMediaNoiseLow${i}, uMediaNoiseHigh${i} - 0.001);
      float highI${i} = max(uMediaNoiseHigh${i}, lowI${i} + 0.001);
      float plumeI${i} = plumeEnvelope(localI${i}, uMediaPlumeDir${i}, uMediaConeCos${i}, uMediaPlumeLen${i}, uMediaEmission${i});
      float fillI${i} = densityRemap(fieldI${i}, lowI${i}, highI${i}, 1.2) * uMediaDensity${i} * plumeI${i};
      float turbI${i} = clamp(uMediaTurbulence${i}, 0.0, 1.0);
      float shimmerI${i} = 1.0 + turbI${i} * (sampleMediaNoise${i}(localI${i} * 2.7 + vec3(uTime * 0.7, 0.0, 0.0)) - 0.5) * 0.2;
      float dI${i} = fillI${i} * shimmerI${i};
      if (dI${i} > 1e-8) {
        float volI${i} = uMediaHalfExt${i}.x * uMediaHalfExt${i}.y * uMediaHalfExt${i}.z;
        if (volI${i} < bestVol) {
          bestVol = volI${i};
          hasInterior = 1.0;
          float saI${i} = max(uMediaAbsorb${i}, 0.0) * dI${i};
          float ssRI${i} = max(uMediaScatter${i}, 0.0) * dI${i};
          float ssMI${i} = max(uMediaScatterMie${i}, 0.0) * dI${i};
          intDens = dI${i};
          intSigmaSR = ssRI${i};
          intSigmaSM = ssMI${i};
          intSigmaA = saI${i};
          float wTintI${i} = ssRI${i} + ssMI${i} + saI${i} * 0.25;
          intTint = uMediaColor${i} * wTintI${i};
          intTintW = wTintI${i};
          intSpecExpM = uMediaSpectralExp${i} * ssMI${i};
          intMieG = clamp(uMediaMieG${i}, -0.95, 0.95) * ssMI${i};
          intMieW = ssMI${i};
        }
      }
    }
  }`);

    pass2.push(`  if (uMediaCount > ${i}.5 && uMediaInsulating${i} < 0.5) {
    vec3 localP${i} = pCam - uMediaCenter${i};
    if (!any(greaterThan(abs(localP${i}), uMediaHalfExt${i}))) {
      float fieldP${i} = sampleMediaNoise${i}(localP${i} * uMediaFbmScale${i} + vec3(0.0, uTime * uMediaFbmTime${i}, 0.0));
      float lowP${i} = min(uMediaNoiseLow${i}, uMediaNoiseHigh${i} - 0.001);
      float highP${i} = max(uMediaNoiseHigh${i}, lowP${i} + 0.001);
      float plumeP${i} = plumeEnvelope(localP${i}, uMediaPlumeDir${i}, uMediaConeCos${i}, uMediaPlumeLen${i}, uMediaEmission${i});
      // Particulate: stronger remap (cloud-like puff contrast); climate softer.
      float remPowP${i} = uMediaLayerKind${i} > 1.5 ? 1.45 : 1.2;
      float fillP${i} = densityRemap(fieldP${i}, lowP${i}, highP${i}, remPowP${i}) * uMediaDensity${i} * plumeP${i};
      // Height falloff — denser / darker lower band (cloud base / smoke settle).
      float nyP${i} = localP${i}.y / max(uMediaHalfExt${i}.y, 1e-3);
      float heightFallP${i} = mix(0.55, 1.0, smoothstep(-0.9, 0.2, nyP${i}));
      float turbP${i} = clamp(uMediaTurbulence${i}, 0.0, 1.0);
      float shimmerP${i} = 1.0 + turbP${i} * (sampleMediaNoise${i}(localP${i} * 2.7 + vec3(uTime * 0.7, 0.0, 0.0)) - 0.5) * 0.2;
      float dP${i} = fillP${i} * heightFallP${i} * shimmerP${i};
      if (dP${i} > 1e-8) {
        float kind${i} = uMediaLayerKind${i};
        if (kind${i} > 1.5) {
          // Particulate: always additive; scatter drives Mie.
          float saP${i} = max(uMediaAbsorb${i}, 0.0) * dP${i};
          float ssMP${i} = max(uMediaScatter${i}, 0.0) * dP${i};
          dens += dP${i};
          sigmaA += saP${i};
          sigmaSM += ssMP${i};
          float wTintP${i} = ssMP${i} + saP${i} * 0.25;
          tintAccum += uMediaColor${i} * wTintP${i};
          tintWeight += wTintP${i};
          if (ssMP${i} > 1e-12) {
            spectralExpMAccum += uMediaSpectralExp${i} * ssMP${i};
            mieGAccum += clamp(uMediaMieG${i}, -0.95, 0.95) * ssMP${i};
            mieWeight += ssMP${i};
          }
        } else if (kind${i} < 0.5 && hasInterior < 0.5) {
          // Outdoor climate dual — skipped when an insulating interior covers this point.
          float saO${i} = max(uMediaAbsorb${i}, 0.0) * dP${i};
          float ssRO${i} = max(uMediaScatter${i}, 0.0) * dP${i};
          float ssMO${i} = max(uMediaScatterMie${i}, 0.0) * dP${i};
          dens += dP${i};
          sigmaA += saO${i};
          sigmaSR += ssRO${i};
          sigmaSM += ssMO${i};
          float wTintO${i} = ssRO${i} + ssMO${i} + saO${i} * 0.25;
          tintAccum += uMediaColor${i} * wTintO${i};
          tintWeight += wTintO${i};
          if (ssMO${i} > 1e-12) {
            spectralExpMAccum += uMediaSpectralExp${i} * ssMO${i};
            mieGAccum += clamp(uMediaMieG${i}, -0.95, 0.95) * ssMO${i};
            mieWeight += ssMO${i};
          }
        }
      }
    }
  }`);
  }

  const preamble = `  float hasInterior = 0.0;
  float bestVol = 1e30;
  float intDens = 0.0;
  float intSigmaSR = 0.0;
  float intSigmaSM = 0.0;
  float intSigmaA = 0.0;
  vec3 intTint = vec3(0.0);
  float intTintW = 0.0;
  float intSpecExpM = 0.0;
  float intMieG = 0.0;
  float intMieW = 0.0;
`;

  const epilogue = `  if (hasInterior > 0.5) {
    dens += intDens;
    sigmaSR += intSigmaSR;
    sigmaSM += intSigmaSM;
    sigmaA += intSigmaA;
    tintAccum += intTint;
    tintWeight += intTintW;
    if (intMieW > 1e-12) {
      spectralExpMAccum += intSpecExpM;
      mieGAccum += intMieG;
      mieWeight += intMieW;
    }
  }`;

  return [preamble, ...pass1, ...pass2, epilogue].join('\n');
}

function mediaIntersectUnion(slots: number): string {
  const blocks: string[] = [];
  for (let i = 0; i < slots; i++) {
    blocks.push(`  if (uMediaCount > ${i}.5 && intersectBox(ro, rd, uMediaCenter${i}, uMediaHalfExt${i}, te, tx)) {
    anyHit = true; tEnter = min(tEnter, te); tExit = max(tExit, tx);
  }`);
  }
  return blocks.join('\n');
}

/**
 * Cheap extinction for Light→Medium shadow rays: AABB + density × plume (+ height).
 * No noise here — noise inside shadow×light×slot unrolls times out WebGL compile.
 */
function mediaExtinctionFastAccum(slots: number): string {
  const pass1: string[] = [];
  const pass2: string[] = [];
  for (let i = 0; i < slots; i++) {
    pass1.push(`  if (uMediaCount > ${i}.5 && uMediaInsulating${i} > 0.5) {
    vec3 localI${i} = q - uMediaCenter${i};
    if (!any(greaterThan(abs(localI${i}), uMediaHalfExt${i}))) {
      float plumeI${i} = plumeEnvelope(localI${i}, uMediaPlumeDir${i}, uMediaConeCos${i}, uMediaPlumeLen${i}, uMediaEmission${i});
      float dI${i} = max(uMediaDensity${i}, 0.0) * plumeI${i};
      if (dI${i} > 1e-8) {
        float volI${i} = uMediaHalfExt${i}.x * uMediaHalfExt${i}.y * uMediaHalfExt${i}.z;
        if (volI${i} < bestVol) {
          bestVol = volI${i};
          hasInterior = 1.0;
          intSigmaT = (max(uMediaScatter${i}, 0.0) + max(uMediaScatterMie${i}, 0.0) + max(uMediaAbsorb${i}, 0.0)) * dI${i};
        }
      }
    }
  }`);

    pass2.push(`  if (uMediaCount > ${i}.5 && uMediaInsulating${i} < 0.5) {
    vec3 localP${i} = q - uMediaCenter${i};
    if (!any(greaterThan(abs(localP${i}), uMediaHalfExt${i}))) {
      float plumeP${i} = plumeEnvelope(localP${i}, uMediaPlumeDir${i}, uMediaConeCos${i}, uMediaPlumeLen${i}, uMediaEmission${i});
      float nyP${i} = localP${i}.y / max(uMediaHalfExt${i}.y, 1e-3);
      float heightFallP${i} = mix(0.55, 1.0, smoothstep(-0.9, 0.2, nyP${i}));
      float dP${i} = max(uMediaDensity${i}, 0.0) * plumeP${i} * heightFallP${i};
      if (dP${i} > 1e-8) {
        float kind${i} = uMediaLayerKind${i};
        float sigmaSlot${i} = (max(uMediaScatter${i}, 0.0) + max(uMediaScatterMie${i}, 0.0) + max(uMediaAbsorb${i}, 0.0)) * dP${i};
        if (kind${i} > 1.5) {
          sigmaT += sigmaSlot${i};
        } else if (kind${i} < 0.5 && hasInterior < 0.5) {
          sigmaT += sigmaSlot${i};
        }
      }
    }
  }`);
  }

  return `  float hasInterior = 0.0;
  float bestVol = 1e30;
  float intSigmaT = 0.0;
  float sigmaT = 0.0;
${pass1.join('\n')}
${pass2.join('\n')}
  if (hasInterior > 0.5) sigmaT += intSigmaT;
  return sigmaT;
`;
}

/**
 * Dual-channel in-scatter: Rayleigh + Mie × Light→Medium shadowT × Camera→Medium T.
 */
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
        float shadowT${i} = lightMediaTransmittance(p, uLightOrigin${i}, sigmaT);
        if (shadowT${i} > 1e-5) {
          vec3 incident${i} = uLightMode${i} < 0.5
            ? normalize(p - uLightOrigin${i})
            : normalize(uLightDir${i});
          vec3 viewDir${i} = normalize(-rd);
          float cosTheta${i} = clamp(dot(incident${i}, viewDir${i}), -1.0, 1.0);
          float phaseR${i} = phaseRayleigh(cosTheta${i});
          float phaseM${i} = phaseHG(cosTheta${i}, mieG);
          float specR${i} = spectralScatterFactor(uLightScatter${i}, 4.0);
          float specM${i} = spectralScatterFactor(uLightScatter${i}, spectralExpM);
          float inScatter${i} = (sigmaSR * specR${i} * phaseR${i}
            + sigmaSM * specM${i} * phaseM${i}) * stepSize;
          float ms${i} = omega0 * uVolumeMultiScatter * INV_4PI * sigmaS * stepSize;
          // Lscatter *= shadowT (light→medium); then *= T (camera→medium) via outer T.
          col += tint * uLightColor${i} * Li * T * uLightPower${i}
            * shadowT${i} * (inScatter${i} + ms${i});
        }
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
precision highp sampler3D;

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
/** 0=off 1=low(local) 2=medium(2–4 steps) 3=high(6–8 steps). */
uniform float uShadowQuality;
uniform float uShadowSteps;

/** Environment irradiance → media in-scatter (cloud / fog lighting). */
uniform vec3 uEnvHemi;
uniform vec3 uEnvSun;
uniform vec3 uEnvSunDir;
uniform float uVolumeMultiScatter;

uniform float uLightCount;
${lightUniformDecls(VOLUMETRIC_LIGHT_SLOTS)}

uniform float uMediaCount;
${mediaUniformDecls(VOLUMETRIC_MEDIA_SLOTS)}

${mediaNoiseSampleFns(VOLUMETRIC_MEDIA_SLOTS)}

float hash(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

/** Remap soft noise field → puffier islands (cloud-like contrast, cheap). */
float densityRemap(float field, float low, float high, float contrast) {
  float s = smoothstep(min(low, high - 0.001), max(high, low + 0.001), field);
  return pow(max(s, 0.0), max(contrast, 1.0));
}

float plumeEnvelope(vec3 localPos, vec3 plumeDir, float coneCos, float lengthM, float emissionRate) {
  if (coneCos < 0.0) return 1.0;
  if (emissionRate <= 0.0) return 0.0;
  float along = dot(localPos, plumeDir);
  if (along <= 1e-5) return 0.0;
  float dist = max(length(localPos), 1e-6);
  float cosTheta = along / dist;
  float coneMask = smoothstep(coneCos - 0.08, min(1.0, coneCos + 0.04), cosTheta);
  float len = max(lengthM, 0.25);
  float axial = 1.0 - smoothstep(len * 0.55, len, along);
  return max(emissionRate, 0.0) * coneMask * axial;
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

/**
 * Extinction σ_t at q for shadow rays — AABB + density×plume (+ height), no noise texture.
 */
float mediaExtinctionFast(vec3 q) {
${mediaExtinctionFastAccum(VOLUMETRIC_MEDIA_SLOTS)}
}

/**
 * Light→Medium transmittance (shadowT). Camera→Medium T stays in the main march.
 * low: τ ≈ σ_t(p)·|L−p|; medium/high: secondary march with cheap extinction.
 */
float lightMediaTransmittance(vec3 p, vec3 lightOrigin, float sigmaTLocal) {
  if (uShadowQuality < 0.5) return 1.0;
  vec3 delta = lightOrigin - p;
  float dist = length(delta);
  if (dist < 1e-4) return 1.0;
  if (uShadowQuality < 1.5) {
    return exp(-max(sigmaTLocal, 0.0) * dist);
  }
  vec3 dir = delta / dist;
  int steps = int(clamp(uShadowSteps, 2.0, 8.0));
  float ds = dist / float(steps);
  float tau = 0.0;
  for (int s = 0; s < 8; s++) {
    if (s >= steps) break;
    float t = (float(s) + 0.5) * ds;
    tau += mediaExtinctionFast(p + dir * t) * ds;
  }
  return exp(-tau);
}

/** Soft sun Light→Medium transmittance (medium/high only). */
float sunMediaTransmittance(vec3 p, float sigmaTLocal) {
  if (uShadowQuality < 1.5) {
    if (uShadowQuality < 0.5) return 1.0;
    return exp(-max(sigmaTLocal, 0.0) * 12.0);
  }
  vec3 dir = normalize(uEnvSunDir);
  int steps = int(clamp(uShadowSteps * 0.5, 2.0, 4.0));
  float pathLen = 12.0;
  float ds = pathLen / float(steps);
  float tau = 0.0;
  for (int s = 0; s < 4; s++) {
    if (s >= steps) break;
    float t = (float(s) + 0.5) * ds;
    tau += mediaExtinctionFast(p + dir * t) * ds;
  }
  return exp(-tau);
}

/**
 * Layered multi-media optical rates at p.
 * dens     — sum of local fills (empty-space skip / UI)
 * sigmaSR  — Σ σ_s·ρ for climate Rayleigh (outdoor / interior)
 * sigmaSM  — Σ σ_s·ρ for Mie (climate Mie + particulate)
 * sigmaA   — Σ σ_a·ρ (active layers)
 * spectralExpM / mieG — Mie-weighted averages
 * Interior insulating climate replaces outdoor inside its AABB.
 */
void sampleMedia(
  vec3 pCam,
  out float dens,
  out vec3 tint,
  out float sigmaSR,
  out float sigmaSM,
  out float sigmaA,
  out float spectralExpM,
  out float mieG
) {
  dens = 0.0;
  tint = vec3(1.0);
  sigmaSR = 0.0;
  sigmaSM = 0.0;
  sigmaA = 0.0;
  spectralExpM = 0.2;
  mieG = 0.0;

  vec3 tintAccum = vec3(0.0);
  float tintWeight = 0.0;
  float spectralExpMAccum = 0.0;
  float mieGAccum = 0.0;
  float mieWeight = 0.0;

${mediaSampleAccum(VOLUMETRIC_MEDIA_SLOTS)}

  if (tintWeight > 1e-8) tint = tintAccum / tintWeight;
  if (mieWeight > 1e-8) {
    spectralExpM = spectralExpMAccum / mieWeight;
    mieG = clamp(mieGAccum / mieWeight, -0.95, 0.95);
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
 * Classical Rayleigh phase (absolute: ∫p dΩ = 1): p(μ)=(3/16π)(1+μ²).
 */
float phaseRayleigh(float cosTheta) {
  float mu = clamp(cosTheta, -1.0, 1.0);
  return 0.0596831036 * (1.0 + mu * mu); // 3/(16π)
}

/**
 * Henyey–Greenstein phase (absolute: ∫p dΩ = 1; g=0 → 1/(4π)).
 * Mild forward Mie (g≈0.5): brighter looking into the beam, still visible from behind/side.
 */
float phaseHG(float cosTheta, float g) {
  float g2 = g * g;
  float denom = pow(max(1.0 - 2.0 * g * cosTheta + g2, 1e-6), 1.5);
  return ((1.0 - g2) / denom) * 0.0795774715; // 1/(4π)
}

const float INV_4PI = 0.0795774715;

/* Shared with surface plugin — CPU twin: engine/optics/beam-model.ts evalRadianceField */
${radianceFieldGlslFunctions()}

vec3 march(vec3 ro, vec3 rd, float sceneZCam) {
  // Media required; lights optional if environment irradiance lights the volume.
  if (uMediaCount < 0.5) return vec3(0.0);
  float envEnergy = max(uEnvHemi.r + uEnvHemi.g + uEnvHemi.b, 0.0)
    + max(uEnvSun.r + uEnvSun.g + uEnvSun.b, 0.0);
  if (uLightCount < 0.5 && envEnergy < 1e-6) return vec3(0.0);

  float tEnter = 1e9;
  float tExit = -1e9;
  bool anyHit = false;
  float te; float tx;
${mediaIntersectUnion(VOLUMETRIC_MEDIA_SLOTS)}
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
    float sigmaSR;
    float sigmaSM;
    float sigmaA;
    float spectralExpM;
    float mieG;
    sampleMedia(p, dens, tint, sigmaSR, sigmaSM, sigmaA, spectralExpM, mieG);

    // Empty-space skip: larger steps in voids (important for cloud-scale AABBs)
    float stepSize = baseStep;
    if (dens < uDensityThreshold) {
      stepSize = baseStep * 3.5;
      t += stepSize;
      i++;
      continue;
    }

    float sigmaS = sigmaSR + sigmaSM;
    float sigmaT = sigmaS + sigmaA;
    float omega0 = sigmaS / max(sigmaT, 1e-6);
    T *= exp(-sigmaT * stepSize * 0.5);
    if (T < uTransmittanceCut) break;

    // --- Environment illuminates the medium (clouds / fog in sunlight) ---
    if (sigmaS > 1e-10 && envEnergy > 1e-8) {
      vec3 viewDir = normalize(-rd);
      // Hemi: near-isotropic skylight (no hard self-shadow)
      col += tint * uEnvHemi * sigmaS * INV_4PI * stepSize * T;
      // Sun: directional with regime-weighted phase + soft media shadow
      float cosSun = clamp(dot(normalize(uEnvSunDir), viewDir), -1.0, 1.0);
      float phaseSun = (sigmaSR * phaseRayleigh(cosSun) + sigmaSM * phaseHG(cosSun, mieG))
        / max(sigmaS, 1e-10);
      float sunT = sunMediaTransmittance(p, sigmaT);
      col += tint * uEnvSun * sigmaS * phaseSun * stepSize * T * sunT;
      // Cheap multiple-scatter fill (same knob as emitter MS) — cloud glow in sun
      float msEnv = omega0 * uVolumeMultiScatter * INV_4PI * sigmaS * stepSize;
      col += tint * (uEnvHemi + uEnvSun * sunT) * msEnv * T;
    }

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
  'uShadowQuality',
  'uShadowSteps',
  'uEnvHemi',
  'uEnvSun',
  'uEnvSunDir',
  'uVolumeMultiScatter',
  ...lightUniformNames(VOLUMETRIC_LIGHT_SLOTS),
  ...mediaUniformNames(VOLUMETRIC_MEDIA_SLOTS),
];

export const VOLUMETRIC_SAMPLERS = ['uSceneDepth', ...mediaNoiseSamplers(VOLUMETRIC_MEDIA_SLOTS)];
