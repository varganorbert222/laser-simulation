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
uniform vec3 uLightOrigin0;
uniform vec3 uLightDir0;
uniform vec3 uLightColor0;
uniform float uLightPower0;
uniform float uLightScatter0;
uniform float uLightMode0;
uniform float uLightP00;
uniform float uLightP10;
uniform float uLightP20;
uniform float uLightP30;
uniform float uLightP40;
uniform float uLightP50;
uniform vec3 uLightSpill0;
uniform vec3 uLightOrigin1;
uniform vec3 uLightDir1;
uniform vec3 uLightColor1;
uniform float uLightPower1;
uniform float uLightScatter1;
uniform float uLightMode1;
uniform float uLightP01;
uniform float uLightP11;
uniform float uLightP21;
uniform float uLightP31;
uniform float uLightP41;
uniform float uLightP51;
uniform vec3 uLightSpill1;
uniform vec3 uLightOrigin2;
uniform vec3 uLightDir2;
uniform vec3 uLightColor2;
uniform float uLightPower2;
uniform float uLightScatter2;
uniform float uLightMode2;
uniform float uLightP02;
uniform float uLightP12;
uniform float uLightP22;
uniform float uLightP32;
uniform float uLightP42;
uniform float uLightP52;
uniform vec3 uLightSpill2;
uniform vec3 uLightOrigin3;
uniform vec3 uLightDir3;
uniform vec3 uLightColor3;
uniform float uLightPower3;
uniform float uLightScatter3;
uniform float uLightMode3;
uniform float uLightP03;
uniform float uLightP13;
uniform float uLightP23;
uniform float uLightP33;
uniform float uLightP43;
uniform float uLightP53;
uniform vec3 uLightSpill3;

uniform float uMediaCount;
uniform vec3 uMediaCenter0; uniform vec3 uMediaHalfExt0; uniform vec3 uMediaColor0;
uniform float uMediaDensity0; uniform float uMediaFbmScale0; uniform float uMediaFbmTime0;
uniform float uMediaNoiseLow0; uniform float uMediaNoiseHigh0;
uniform float uMediaNoiseKind0;
uniform sampler2D uMediaNoise2D0;
uniform sampler3D uMediaNoise3D0;
uniform float uMediaScatter0; uniform float uMediaScatterMie0; uniform float uMediaAbsorb0;
uniform float uMediaSpectralExp0; uniform float uMediaMieG0;
uniform float uMediaScatterModel0; uniform float uMediaTurbulence0;
uniform float uMediaLayerKind0; uniform float uMediaInsulating0;
uniform float uMediaEmission0; uniform float uMediaConeCos0; uniform float uMediaPlumeLen0;
uniform vec3 uMediaPlumeDir0;
uniform vec3 uMediaCenter1; uniform vec3 uMediaHalfExt1; uniform vec3 uMediaColor1;
uniform float uMediaDensity1; uniform float uMediaFbmScale1; uniform float uMediaFbmTime1;
uniform float uMediaNoiseLow1; uniform float uMediaNoiseHigh1;
uniform float uMediaNoiseKind1;
uniform sampler2D uMediaNoise2D1;
uniform sampler3D uMediaNoise3D1;
uniform float uMediaScatter1; uniform float uMediaScatterMie1; uniform float uMediaAbsorb1;
uniform float uMediaSpectralExp1; uniform float uMediaMieG1;
uniform float uMediaScatterModel1; uniform float uMediaTurbulence1;
uniform float uMediaLayerKind1; uniform float uMediaInsulating1;
uniform float uMediaEmission1; uniform float uMediaConeCos1; uniform float uMediaPlumeLen1;
uniform vec3 uMediaPlumeDir1;
uniform vec3 uMediaCenter2; uniform vec3 uMediaHalfExt2; uniform vec3 uMediaColor2;
uniform float uMediaDensity2; uniform float uMediaFbmScale2; uniform float uMediaFbmTime2;
uniform float uMediaNoiseLow2; uniform float uMediaNoiseHigh2;
uniform float uMediaNoiseKind2;
uniform sampler2D uMediaNoise2D2;
uniform sampler3D uMediaNoise3D2;
uniform float uMediaScatter2; uniform float uMediaScatterMie2; uniform float uMediaAbsorb2;
uniform float uMediaSpectralExp2; uniform float uMediaMieG2;
uniform float uMediaScatterModel2; uniform float uMediaTurbulence2;
uniform float uMediaLayerKind2; uniform float uMediaInsulating2;
uniform float uMediaEmission2; uniform float uMediaConeCos2; uniform float uMediaPlumeLen2;
uniform vec3 uMediaPlumeDir2;
uniform vec3 uMediaCenter3; uniform vec3 uMediaHalfExt3; uniform vec3 uMediaColor3;
uniform float uMediaDensity3; uniform float uMediaFbmScale3; uniform float uMediaFbmTime3;
uniform float uMediaNoiseLow3; uniform float uMediaNoiseHigh3;
uniform float uMediaNoiseKind3;
uniform sampler2D uMediaNoise2D3;
uniform sampler3D uMediaNoise3D3;
uniform float uMediaScatter3; uniform float uMediaScatterMie3; uniform float uMediaAbsorb3;
uniform float uMediaSpectralExp3; uniform float uMediaMieG3;
uniform float uMediaScatterModel3; uniform float uMediaTurbulence3;
uniform float uMediaLayerKind3; uniform float uMediaInsulating3;
uniform float uMediaEmission3; uniform float uMediaConeCos3; uniform float uMediaPlumeLen3;
uniform vec3 uMediaPlumeDir3;

float sampleMediaNoise0(vec3 p) {
  float kind = uMediaNoiseKind0;
  if (kind > 2.5) return texture(uMediaNoise3D0, fract(p)).r;
  if (kind > 1.5) return texture(uMediaNoise2D0, fract(p.xy)).r;
  return 0.5;
}
float sampleMediaNoise1(vec3 p) {
  float kind = uMediaNoiseKind1;
  if (kind > 2.5) return texture(uMediaNoise3D1, fract(p)).r;
  if (kind > 1.5) return texture(uMediaNoise2D1, fract(p.xy)).r;
  return 0.5;
}
float sampleMediaNoise2(vec3 p) {
  float kind = uMediaNoiseKind2;
  if (kind > 2.5) return texture(uMediaNoise3D2, fract(p)).r;
  if (kind > 1.5) return texture(uMediaNoise2D2, fract(p.xy)).r;
  return 0.5;
}
float sampleMediaNoise3(vec3 p) {
  float kind = uMediaNoiseKind3;
  if (kind > 2.5) return texture(uMediaNoise3D3, fract(p)).r;
  if (kind > 1.5) return texture(uMediaNoise2D3, fract(p.xy)).r;
  return 0.5;
}

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
  float hasInterior = 0.0;
  float bestVol = 1e30;
  float intSigmaT = 0.0;
  float sigmaT = 0.0;
  if (uMediaCount > 0.5 && uMediaInsulating0 > 0.5) {
    vec3 localI0 = q - uMediaCenter0;
    if (!any(greaterThan(abs(localI0), uMediaHalfExt0))) {
      float plumeI0 = plumeEnvelope(localI0, uMediaPlumeDir0, uMediaConeCos0, uMediaPlumeLen0, uMediaEmission0);
      float dI0 = max(uMediaDensity0, 0.0) * plumeI0;
      if (dI0 > 1e-8) {
        float volI0 = uMediaHalfExt0.x * uMediaHalfExt0.y * uMediaHalfExt0.z;
        if (volI0 < bestVol) {
          bestVol = volI0;
          hasInterior = 1.0;
          intSigmaT = (max(uMediaScatter0, 0.0) + max(uMediaScatterMie0, 0.0) + max(uMediaAbsorb0, 0.0)) * dI0;
        }
      }
    }
  }
  if (uMediaCount > 1.5 && uMediaInsulating1 > 0.5) {
    vec3 localI1 = q - uMediaCenter1;
    if (!any(greaterThan(abs(localI1), uMediaHalfExt1))) {
      float plumeI1 = plumeEnvelope(localI1, uMediaPlumeDir1, uMediaConeCos1, uMediaPlumeLen1, uMediaEmission1);
      float dI1 = max(uMediaDensity1, 0.0) * plumeI1;
      if (dI1 > 1e-8) {
        float volI1 = uMediaHalfExt1.x * uMediaHalfExt1.y * uMediaHalfExt1.z;
        if (volI1 < bestVol) {
          bestVol = volI1;
          hasInterior = 1.0;
          intSigmaT = (max(uMediaScatter1, 0.0) + max(uMediaScatterMie1, 0.0) + max(uMediaAbsorb1, 0.0)) * dI1;
        }
      }
    }
  }
  if (uMediaCount > 2.5 && uMediaInsulating2 > 0.5) {
    vec3 localI2 = q - uMediaCenter2;
    if (!any(greaterThan(abs(localI2), uMediaHalfExt2))) {
      float plumeI2 = plumeEnvelope(localI2, uMediaPlumeDir2, uMediaConeCos2, uMediaPlumeLen2, uMediaEmission2);
      float dI2 = max(uMediaDensity2, 0.0) * plumeI2;
      if (dI2 > 1e-8) {
        float volI2 = uMediaHalfExt2.x * uMediaHalfExt2.y * uMediaHalfExt2.z;
        if (volI2 < bestVol) {
          bestVol = volI2;
          hasInterior = 1.0;
          intSigmaT = (max(uMediaScatter2, 0.0) + max(uMediaScatterMie2, 0.0) + max(uMediaAbsorb2, 0.0)) * dI2;
        }
      }
    }
  }
  if (uMediaCount > 3.5 && uMediaInsulating3 > 0.5) {
    vec3 localI3 = q - uMediaCenter3;
    if (!any(greaterThan(abs(localI3), uMediaHalfExt3))) {
      float plumeI3 = plumeEnvelope(localI3, uMediaPlumeDir3, uMediaConeCos3, uMediaPlumeLen3, uMediaEmission3);
      float dI3 = max(uMediaDensity3, 0.0) * plumeI3;
      if (dI3 > 1e-8) {
        float volI3 = uMediaHalfExt3.x * uMediaHalfExt3.y * uMediaHalfExt3.z;
        if (volI3 < bestVol) {
          bestVol = volI3;
          hasInterior = 1.0;
          intSigmaT = (max(uMediaScatter3, 0.0) + max(uMediaScatterMie3, 0.0) + max(uMediaAbsorb3, 0.0)) * dI3;
        }
      }
    }
  }
  if (uMediaCount > 0.5 && uMediaInsulating0 < 0.5) {
    vec3 localP0 = q - uMediaCenter0;
    if (!any(greaterThan(abs(localP0), uMediaHalfExt0))) {
      float plumeP0 = plumeEnvelope(localP0, uMediaPlumeDir0, uMediaConeCos0, uMediaPlumeLen0, uMediaEmission0);
      float nyP0 = localP0.y / max(uMediaHalfExt0.y, 1e-3);
      float heightFallP0 = mix(0.55, 1.0, smoothstep(-0.9, 0.2, nyP0));
      float dP0 = max(uMediaDensity0, 0.0) * plumeP0 * heightFallP0;
      if (dP0 > 1e-8) {
        float kind0 = uMediaLayerKind0;
        float sigmaSlot0 = (max(uMediaScatter0, 0.0) + max(uMediaScatterMie0, 0.0) + max(uMediaAbsorb0, 0.0)) * dP0;
        if (kind0 > 1.5) {
          sigmaT += sigmaSlot0;
        } else if (kind0 < 0.5 && hasInterior < 0.5) {
          sigmaT += sigmaSlot0;
        }
      }
    }
  }
  if (uMediaCount > 1.5 && uMediaInsulating1 < 0.5) {
    vec3 localP1 = q - uMediaCenter1;
    if (!any(greaterThan(abs(localP1), uMediaHalfExt1))) {
      float plumeP1 = plumeEnvelope(localP1, uMediaPlumeDir1, uMediaConeCos1, uMediaPlumeLen1, uMediaEmission1);
      float nyP1 = localP1.y / max(uMediaHalfExt1.y, 1e-3);
      float heightFallP1 = mix(0.55, 1.0, smoothstep(-0.9, 0.2, nyP1));
      float dP1 = max(uMediaDensity1, 0.0) * plumeP1 * heightFallP1;
      if (dP1 > 1e-8) {
        float kind1 = uMediaLayerKind1;
        float sigmaSlot1 = (max(uMediaScatter1, 0.0) + max(uMediaScatterMie1, 0.0) + max(uMediaAbsorb1, 0.0)) * dP1;
        if (kind1 > 1.5) {
          sigmaT += sigmaSlot1;
        } else if (kind1 < 0.5 && hasInterior < 0.5) {
          sigmaT += sigmaSlot1;
        }
      }
    }
  }
  if (uMediaCount > 2.5 && uMediaInsulating2 < 0.5) {
    vec3 localP2 = q - uMediaCenter2;
    if (!any(greaterThan(abs(localP2), uMediaHalfExt2))) {
      float plumeP2 = plumeEnvelope(localP2, uMediaPlumeDir2, uMediaConeCos2, uMediaPlumeLen2, uMediaEmission2);
      float nyP2 = localP2.y / max(uMediaHalfExt2.y, 1e-3);
      float heightFallP2 = mix(0.55, 1.0, smoothstep(-0.9, 0.2, nyP2));
      float dP2 = max(uMediaDensity2, 0.0) * plumeP2 * heightFallP2;
      if (dP2 > 1e-8) {
        float kind2 = uMediaLayerKind2;
        float sigmaSlot2 = (max(uMediaScatter2, 0.0) + max(uMediaScatterMie2, 0.0) + max(uMediaAbsorb2, 0.0)) * dP2;
        if (kind2 > 1.5) {
          sigmaT += sigmaSlot2;
        } else if (kind2 < 0.5 && hasInterior < 0.5) {
          sigmaT += sigmaSlot2;
        }
      }
    }
  }
  if (uMediaCount > 3.5 && uMediaInsulating3 < 0.5) {
    vec3 localP3 = q - uMediaCenter3;
    if (!any(greaterThan(abs(localP3), uMediaHalfExt3))) {
      float plumeP3 = plumeEnvelope(localP3, uMediaPlumeDir3, uMediaConeCos3, uMediaPlumeLen3, uMediaEmission3);
      float nyP3 = localP3.y / max(uMediaHalfExt3.y, 1e-3);
      float heightFallP3 = mix(0.55, 1.0, smoothstep(-0.9, 0.2, nyP3));
      float dP3 = max(uMediaDensity3, 0.0) * plumeP3 * heightFallP3;
      if (dP3 > 1e-8) {
        float kind3 = uMediaLayerKind3;
        float sigmaSlot3 = (max(uMediaScatter3, 0.0) + max(uMediaScatterMie3, 0.0) + max(uMediaAbsorb3, 0.0)) * dP3;
        if (kind3 > 1.5) {
          sigmaT += sigmaSlot3;
        } else if (kind3 < 0.5 && hasInterior < 0.5) {
          sigmaT += sigmaSlot3;
        }
      }
    }
  }
  if (hasInterior > 0.5) sigmaT += intSigmaT;
  return sigmaT;

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

  float hasInterior = 0.0;
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

  if (uMediaCount > 0.5 && uMediaInsulating0 > 0.5) {
    vec3 localI0 = pCam - uMediaCenter0;
    if (!any(greaterThan(abs(localI0), uMediaHalfExt0))) {
      float fieldI0 = sampleMediaNoise0(localI0 * uMediaFbmScale0 + vec3(0.0, uTime * uMediaFbmTime0, 0.0));
      float lowI0 = min(uMediaNoiseLow0, uMediaNoiseHigh0 - 0.001);
      float highI0 = max(uMediaNoiseHigh0, lowI0 + 0.001);
      float plumeI0 = plumeEnvelope(localI0, uMediaPlumeDir0, uMediaConeCos0, uMediaPlumeLen0, uMediaEmission0);
      float fillI0 = densityRemap(fieldI0, lowI0, highI0, 1.2) * uMediaDensity0 * plumeI0;
      float turbI0 = clamp(uMediaTurbulence0, 0.0, 1.0);
      float shimmerI0 = 1.0 + turbI0 * (sampleMediaNoise0(localI0 * 2.7 + vec3(uTime * 0.7, 0.0, 0.0)) - 0.5) * 0.2;
      float dI0 = fillI0 * shimmerI0;
      if (dI0 > 1e-8) {
        float volI0 = uMediaHalfExt0.x * uMediaHalfExt0.y * uMediaHalfExt0.z;
        if (volI0 < bestVol) {
          bestVol = volI0;
          hasInterior = 1.0;
          float saI0 = max(uMediaAbsorb0, 0.0) * dI0;
          float ssRI0 = max(uMediaScatter0, 0.0) * dI0;
          float ssMI0 = max(uMediaScatterMie0, 0.0) * dI0;
          intDens = dI0;
          intSigmaSR = ssRI0;
          intSigmaSM = ssMI0;
          intSigmaA = saI0;
          float wTintI0 = ssRI0 + ssMI0 + saI0 * 0.25;
          intTint = uMediaColor0 * wTintI0;
          intTintW = wTintI0;
          intSpecExpM = uMediaSpectralExp0 * ssMI0;
          intMieG = clamp(uMediaMieG0, -0.95, 0.95) * ssMI0;
          intMieW = ssMI0;
        }
      }
    }
  }
  if (uMediaCount > 1.5 && uMediaInsulating1 > 0.5) {
    vec3 localI1 = pCam - uMediaCenter1;
    if (!any(greaterThan(abs(localI1), uMediaHalfExt1))) {
      float fieldI1 = sampleMediaNoise1(localI1 * uMediaFbmScale1 + vec3(0.0, uTime * uMediaFbmTime1, 0.0));
      float lowI1 = min(uMediaNoiseLow1, uMediaNoiseHigh1 - 0.001);
      float highI1 = max(uMediaNoiseHigh1, lowI1 + 0.001);
      float plumeI1 = plumeEnvelope(localI1, uMediaPlumeDir1, uMediaConeCos1, uMediaPlumeLen1, uMediaEmission1);
      float fillI1 = densityRemap(fieldI1, lowI1, highI1, 1.2) * uMediaDensity1 * plumeI1;
      float turbI1 = clamp(uMediaTurbulence1, 0.0, 1.0);
      float shimmerI1 = 1.0 + turbI1 * (sampleMediaNoise1(localI1 * 2.7 + vec3(uTime * 0.7, 0.0, 0.0)) - 0.5) * 0.2;
      float dI1 = fillI1 * shimmerI1;
      if (dI1 > 1e-8) {
        float volI1 = uMediaHalfExt1.x * uMediaHalfExt1.y * uMediaHalfExt1.z;
        if (volI1 < bestVol) {
          bestVol = volI1;
          hasInterior = 1.0;
          float saI1 = max(uMediaAbsorb1, 0.0) * dI1;
          float ssRI1 = max(uMediaScatter1, 0.0) * dI1;
          float ssMI1 = max(uMediaScatterMie1, 0.0) * dI1;
          intDens = dI1;
          intSigmaSR = ssRI1;
          intSigmaSM = ssMI1;
          intSigmaA = saI1;
          float wTintI1 = ssRI1 + ssMI1 + saI1 * 0.25;
          intTint = uMediaColor1 * wTintI1;
          intTintW = wTintI1;
          intSpecExpM = uMediaSpectralExp1 * ssMI1;
          intMieG = clamp(uMediaMieG1, -0.95, 0.95) * ssMI1;
          intMieW = ssMI1;
        }
      }
    }
  }
  if (uMediaCount > 2.5 && uMediaInsulating2 > 0.5) {
    vec3 localI2 = pCam - uMediaCenter2;
    if (!any(greaterThan(abs(localI2), uMediaHalfExt2))) {
      float fieldI2 = sampleMediaNoise2(localI2 * uMediaFbmScale2 + vec3(0.0, uTime * uMediaFbmTime2, 0.0));
      float lowI2 = min(uMediaNoiseLow2, uMediaNoiseHigh2 - 0.001);
      float highI2 = max(uMediaNoiseHigh2, lowI2 + 0.001);
      float plumeI2 = plumeEnvelope(localI2, uMediaPlumeDir2, uMediaConeCos2, uMediaPlumeLen2, uMediaEmission2);
      float fillI2 = densityRemap(fieldI2, lowI2, highI2, 1.2) * uMediaDensity2 * plumeI2;
      float turbI2 = clamp(uMediaTurbulence2, 0.0, 1.0);
      float shimmerI2 = 1.0 + turbI2 * (sampleMediaNoise2(localI2 * 2.7 + vec3(uTime * 0.7, 0.0, 0.0)) - 0.5) * 0.2;
      float dI2 = fillI2 * shimmerI2;
      if (dI2 > 1e-8) {
        float volI2 = uMediaHalfExt2.x * uMediaHalfExt2.y * uMediaHalfExt2.z;
        if (volI2 < bestVol) {
          bestVol = volI2;
          hasInterior = 1.0;
          float saI2 = max(uMediaAbsorb2, 0.0) * dI2;
          float ssRI2 = max(uMediaScatter2, 0.0) * dI2;
          float ssMI2 = max(uMediaScatterMie2, 0.0) * dI2;
          intDens = dI2;
          intSigmaSR = ssRI2;
          intSigmaSM = ssMI2;
          intSigmaA = saI2;
          float wTintI2 = ssRI2 + ssMI2 + saI2 * 0.25;
          intTint = uMediaColor2 * wTintI2;
          intTintW = wTintI2;
          intSpecExpM = uMediaSpectralExp2 * ssMI2;
          intMieG = clamp(uMediaMieG2, -0.95, 0.95) * ssMI2;
          intMieW = ssMI2;
        }
      }
    }
  }
  if (uMediaCount > 3.5 && uMediaInsulating3 > 0.5) {
    vec3 localI3 = pCam - uMediaCenter3;
    if (!any(greaterThan(abs(localI3), uMediaHalfExt3))) {
      float fieldI3 = sampleMediaNoise3(localI3 * uMediaFbmScale3 + vec3(0.0, uTime * uMediaFbmTime3, 0.0));
      float lowI3 = min(uMediaNoiseLow3, uMediaNoiseHigh3 - 0.001);
      float highI3 = max(uMediaNoiseHigh3, lowI3 + 0.001);
      float plumeI3 = plumeEnvelope(localI3, uMediaPlumeDir3, uMediaConeCos3, uMediaPlumeLen3, uMediaEmission3);
      float fillI3 = densityRemap(fieldI3, lowI3, highI3, 1.2) * uMediaDensity3 * plumeI3;
      float turbI3 = clamp(uMediaTurbulence3, 0.0, 1.0);
      float shimmerI3 = 1.0 + turbI3 * (sampleMediaNoise3(localI3 * 2.7 + vec3(uTime * 0.7, 0.0, 0.0)) - 0.5) * 0.2;
      float dI3 = fillI3 * shimmerI3;
      if (dI3 > 1e-8) {
        float volI3 = uMediaHalfExt3.x * uMediaHalfExt3.y * uMediaHalfExt3.z;
        if (volI3 < bestVol) {
          bestVol = volI3;
          hasInterior = 1.0;
          float saI3 = max(uMediaAbsorb3, 0.0) * dI3;
          float ssRI3 = max(uMediaScatter3, 0.0) * dI3;
          float ssMI3 = max(uMediaScatterMie3, 0.0) * dI3;
          intDens = dI3;
          intSigmaSR = ssRI3;
          intSigmaSM = ssMI3;
          intSigmaA = saI3;
          float wTintI3 = ssRI3 + ssMI3 + saI3 * 0.25;
          intTint = uMediaColor3 * wTintI3;
          intTintW = wTintI3;
          intSpecExpM = uMediaSpectralExp3 * ssMI3;
          intMieG = clamp(uMediaMieG3, -0.95, 0.95) * ssMI3;
          intMieW = ssMI3;
        }
      }
    }
  }
  if (uMediaCount > 0.5 && uMediaInsulating0 < 0.5) {
    vec3 localP0 = pCam - uMediaCenter0;
    if (!any(greaterThan(abs(localP0), uMediaHalfExt0))) {
      float fieldP0 = sampleMediaNoise0(localP0 * uMediaFbmScale0 + vec3(0.0, uTime * uMediaFbmTime0, 0.0));
      float lowP0 = min(uMediaNoiseLow0, uMediaNoiseHigh0 - 0.001);
      float highP0 = max(uMediaNoiseHigh0, lowP0 + 0.001);
      float plumeP0 = plumeEnvelope(localP0, uMediaPlumeDir0, uMediaConeCos0, uMediaPlumeLen0, uMediaEmission0);
      // Particulate: stronger remap (cloud-like puff contrast); climate softer.
      float remPowP0 = uMediaLayerKind0 > 1.5 ? 1.45 : 1.2;
      float fillP0 = densityRemap(fieldP0, lowP0, highP0, remPowP0) * uMediaDensity0 * plumeP0;
      // Height falloff — denser / darker lower band (cloud base / smoke settle).
      float nyP0 = localP0.y / max(uMediaHalfExt0.y, 1e-3);
      float heightFallP0 = mix(0.55, 1.0, smoothstep(-0.9, 0.2, nyP0));
      float turbP0 = clamp(uMediaTurbulence0, 0.0, 1.0);
      float shimmerP0 = 1.0 + turbP0 * (sampleMediaNoise0(localP0 * 2.7 + vec3(uTime * 0.7, 0.0, 0.0)) - 0.5) * 0.2;
      float dP0 = fillP0 * heightFallP0 * shimmerP0;
      if (dP0 > 1e-8) {
        float kind0 = uMediaLayerKind0;
        if (kind0 > 1.5) {
          // Particulate: always additive; scatter drives Mie.
          float saP0 = max(uMediaAbsorb0, 0.0) * dP0;
          float ssMP0 = max(uMediaScatter0, 0.0) * dP0;
          dens += dP0;
          sigmaA += saP0;
          sigmaSM += ssMP0;
          float wTintP0 = ssMP0 + saP0 * 0.25;
          tintAccum += uMediaColor0 * wTintP0;
          tintWeight += wTintP0;
          if (ssMP0 > 1e-12) {
            spectralExpMAccum += uMediaSpectralExp0 * ssMP0;
            mieGAccum += clamp(uMediaMieG0, -0.95, 0.95) * ssMP0;
            mieWeight += ssMP0;
          }
        } else if (kind0 < 0.5 && hasInterior < 0.5) {
          // Outdoor climate dual — skipped when an insulating interior covers this point.
          float saO0 = max(uMediaAbsorb0, 0.0) * dP0;
          float ssRO0 = max(uMediaScatter0, 0.0) * dP0;
          float ssMO0 = max(uMediaScatterMie0, 0.0) * dP0;
          dens += dP0;
          sigmaA += saO0;
          sigmaSR += ssRO0;
          sigmaSM += ssMO0;
          float wTintO0 = ssRO0 + ssMO0 + saO0 * 0.25;
          tintAccum += uMediaColor0 * wTintO0;
          tintWeight += wTintO0;
          if (ssMO0 > 1e-12) {
            spectralExpMAccum += uMediaSpectralExp0 * ssMO0;
            mieGAccum += clamp(uMediaMieG0, -0.95, 0.95) * ssMO0;
            mieWeight += ssMO0;
          }
        }
      }
    }
  }
  if (uMediaCount > 1.5 && uMediaInsulating1 < 0.5) {
    vec3 localP1 = pCam - uMediaCenter1;
    if (!any(greaterThan(abs(localP1), uMediaHalfExt1))) {
      float fieldP1 = sampleMediaNoise1(localP1 * uMediaFbmScale1 + vec3(0.0, uTime * uMediaFbmTime1, 0.0));
      float lowP1 = min(uMediaNoiseLow1, uMediaNoiseHigh1 - 0.001);
      float highP1 = max(uMediaNoiseHigh1, lowP1 + 0.001);
      float plumeP1 = plumeEnvelope(localP1, uMediaPlumeDir1, uMediaConeCos1, uMediaPlumeLen1, uMediaEmission1);
      // Particulate: stronger remap (cloud-like puff contrast); climate softer.
      float remPowP1 = uMediaLayerKind1 > 1.5 ? 1.45 : 1.2;
      float fillP1 = densityRemap(fieldP1, lowP1, highP1, remPowP1) * uMediaDensity1 * plumeP1;
      // Height falloff — denser / darker lower band (cloud base / smoke settle).
      float nyP1 = localP1.y / max(uMediaHalfExt1.y, 1e-3);
      float heightFallP1 = mix(0.55, 1.0, smoothstep(-0.9, 0.2, nyP1));
      float turbP1 = clamp(uMediaTurbulence1, 0.0, 1.0);
      float shimmerP1 = 1.0 + turbP1 * (sampleMediaNoise1(localP1 * 2.7 + vec3(uTime * 0.7, 0.0, 0.0)) - 0.5) * 0.2;
      float dP1 = fillP1 * heightFallP1 * shimmerP1;
      if (dP1 > 1e-8) {
        float kind1 = uMediaLayerKind1;
        if (kind1 > 1.5) {
          // Particulate: always additive; scatter drives Mie.
          float saP1 = max(uMediaAbsorb1, 0.0) * dP1;
          float ssMP1 = max(uMediaScatter1, 0.0) * dP1;
          dens += dP1;
          sigmaA += saP1;
          sigmaSM += ssMP1;
          float wTintP1 = ssMP1 + saP1 * 0.25;
          tintAccum += uMediaColor1 * wTintP1;
          tintWeight += wTintP1;
          if (ssMP1 > 1e-12) {
            spectralExpMAccum += uMediaSpectralExp1 * ssMP1;
            mieGAccum += clamp(uMediaMieG1, -0.95, 0.95) * ssMP1;
            mieWeight += ssMP1;
          }
        } else if (kind1 < 0.5 && hasInterior < 0.5) {
          // Outdoor climate dual — skipped when an insulating interior covers this point.
          float saO1 = max(uMediaAbsorb1, 0.0) * dP1;
          float ssRO1 = max(uMediaScatter1, 0.0) * dP1;
          float ssMO1 = max(uMediaScatterMie1, 0.0) * dP1;
          dens += dP1;
          sigmaA += saO1;
          sigmaSR += ssRO1;
          sigmaSM += ssMO1;
          float wTintO1 = ssRO1 + ssMO1 + saO1 * 0.25;
          tintAccum += uMediaColor1 * wTintO1;
          tintWeight += wTintO1;
          if (ssMO1 > 1e-12) {
            spectralExpMAccum += uMediaSpectralExp1 * ssMO1;
            mieGAccum += clamp(uMediaMieG1, -0.95, 0.95) * ssMO1;
            mieWeight += ssMO1;
          }
        }
      }
    }
  }
  if (uMediaCount > 2.5 && uMediaInsulating2 < 0.5) {
    vec3 localP2 = pCam - uMediaCenter2;
    if (!any(greaterThan(abs(localP2), uMediaHalfExt2))) {
      float fieldP2 = sampleMediaNoise2(localP2 * uMediaFbmScale2 + vec3(0.0, uTime * uMediaFbmTime2, 0.0));
      float lowP2 = min(uMediaNoiseLow2, uMediaNoiseHigh2 - 0.001);
      float highP2 = max(uMediaNoiseHigh2, lowP2 + 0.001);
      float plumeP2 = plumeEnvelope(localP2, uMediaPlumeDir2, uMediaConeCos2, uMediaPlumeLen2, uMediaEmission2);
      // Particulate: stronger remap (cloud-like puff contrast); climate softer.
      float remPowP2 = uMediaLayerKind2 > 1.5 ? 1.45 : 1.2;
      float fillP2 = densityRemap(fieldP2, lowP2, highP2, remPowP2) * uMediaDensity2 * plumeP2;
      // Height falloff — denser / darker lower band (cloud base / smoke settle).
      float nyP2 = localP2.y / max(uMediaHalfExt2.y, 1e-3);
      float heightFallP2 = mix(0.55, 1.0, smoothstep(-0.9, 0.2, nyP2));
      float turbP2 = clamp(uMediaTurbulence2, 0.0, 1.0);
      float shimmerP2 = 1.0 + turbP2 * (sampleMediaNoise2(localP2 * 2.7 + vec3(uTime * 0.7, 0.0, 0.0)) - 0.5) * 0.2;
      float dP2 = fillP2 * heightFallP2 * shimmerP2;
      if (dP2 > 1e-8) {
        float kind2 = uMediaLayerKind2;
        if (kind2 > 1.5) {
          // Particulate: always additive; scatter drives Mie.
          float saP2 = max(uMediaAbsorb2, 0.0) * dP2;
          float ssMP2 = max(uMediaScatter2, 0.0) * dP2;
          dens += dP2;
          sigmaA += saP2;
          sigmaSM += ssMP2;
          float wTintP2 = ssMP2 + saP2 * 0.25;
          tintAccum += uMediaColor2 * wTintP2;
          tintWeight += wTintP2;
          if (ssMP2 > 1e-12) {
            spectralExpMAccum += uMediaSpectralExp2 * ssMP2;
            mieGAccum += clamp(uMediaMieG2, -0.95, 0.95) * ssMP2;
            mieWeight += ssMP2;
          }
        } else if (kind2 < 0.5 && hasInterior < 0.5) {
          // Outdoor climate dual — skipped when an insulating interior covers this point.
          float saO2 = max(uMediaAbsorb2, 0.0) * dP2;
          float ssRO2 = max(uMediaScatter2, 0.0) * dP2;
          float ssMO2 = max(uMediaScatterMie2, 0.0) * dP2;
          dens += dP2;
          sigmaA += saO2;
          sigmaSR += ssRO2;
          sigmaSM += ssMO2;
          float wTintO2 = ssRO2 + ssMO2 + saO2 * 0.25;
          tintAccum += uMediaColor2 * wTintO2;
          tintWeight += wTintO2;
          if (ssMO2 > 1e-12) {
            spectralExpMAccum += uMediaSpectralExp2 * ssMO2;
            mieGAccum += clamp(uMediaMieG2, -0.95, 0.95) * ssMO2;
            mieWeight += ssMO2;
          }
        }
      }
    }
  }
  if (uMediaCount > 3.5 && uMediaInsulating3 < 0.5) {
    vec3 localP3 = pCam - uMediaCenter3;
    if (!any(greaterThan(abs(localP3), uMediaHalfExt3))) {
      float fieldP3 = sampleMediaNoise3(localP3 * uMediaFbmScale3 + vec3(0.0, uTime * uMediaFbmTime3, 0.0));
      float lowP3 = min(uMediaNoiseLow3, uMediaNoiseHigh3 - 0.001);
      float highP3 = max(uMediaNoiseHigh3, lowP3 + 0.001);
      float plumeP3 = plumeEnvelope(localP3, uMediaPlumeDir3, uMediaConeCos3, uMediaPlumeLen3, uMediaEmission3);
      // Particulate: stronger remap (cloud-like puff contrast); climate softer.
      float remPowP3 = uMediaLayerKind3 > 1.5 ? 1.45 : 1.2;
      float fillP3 = densityRemap(fieldP3, lowP3, highP3, remPowP3) * uMediaDensity3 * plumeP3;
      // Height falloff — denser / darker lower band (cloud base / smoke settle).
      float nyP3 = localP3.y / max(uMediaHalfExt3.y, 1e-3);
      float heightFallP3 = mix(0.55, 1.0, smoothstep(-0.9, 0.2, nyP3));
      float turbP3 = clamp(uMediaTurbulence3, 0.0, 1.0);
      float shimmerP3 = 1.0 + turbP3 * (sampleMediaNoise3(localP3 * 2.7 + vec3(uTime * 0.7, 0.0, 0.0)) - 0.5) * 0.2;
      float dP3 = fillP3 * heightFallP3 * shimmerP3;
      if (dP3 > 1e-8) {
        float kind3 = uMediaLayerKind3;
        if (kind3 > 1.5) {
          // Particulate: always additive; scatter drives Mie.
          float saP3 = max(uMediaAbsorb3, 0.0) * dP3;
          float ssMP3 = max(uMediaScatter3, 0.0) * dP3;
          dens += dP3;
          sigmaA += saP3;
          sigmaSM += ssMP3;
          float wTintP3 = ssMP3 + saP3 * 0.25;
          tintAccum += uMediaColor3 * wTintP3;
          tintWeight += wTintP3;
          if (ssMP3 > 1e-12) {
            spectralExpMAccum += uMediaSpectralExp3 * ssMP3;
            mieGAccum += clamp(uMediaMieG3, -0.95, 0.95) * ssMP3;
            mieWeight += ssMP3;
          }
        } else if (kind3 < 0.5 && hasInterior < 0.5) {
          // Outdoor climate dual — skipped when an insulating interior covers this point.
          float saO3 = max(uMediaAbsorb3, 0.0) * dP3;
          float ssRO3 = max(uMediaScatter3, 0.0) * dP3;
          float ssMO3 = max(uMediaScatterMie3, 0.0) * dP3;
          dens += dP3;
          sigmaA += saO3;
          sigmaSR += ssRO3;
          sigmaSM += ssMO3;
          float wTintO3 = ssRO3 + ssMO3 + saO3 * 0.25;
          tintAccum += uMediaColor3 * wTintO3;
          tintWeight += wTintO3;
          if (ssMO3 > 1e-12) {
            spectralExpMAccum += uMediaSpectralExp3 * ssMO3;
            mieGAccum += clamp(uMediaMieG3, -0.95, 0.95) * ssMO3;
            mieWeight += ssMO3;
          }
        }
      }
    }
  }
  if (hasInterior > 0.5) {
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
  }

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

/* Shared with surface plugin — CPU twin: engine/physics/optics/beam-model.ts evalRadianceField */
const float RF_DISPLAY_SCALE = 1e-3;

float rfUnpackPairHi(float packed) {
  return floor(mod(floor(packed + 1e-6), 10000.0) / 100.0) / 99.0;
}
float rfUnpackPairLo(float packed) {
  return mod(floor(packed + 1e-6), 100.0) / 99.0;
}

void rfBeamBasis(vec3 d, out vec3 u, out vec3 v) {
  vec3 ax = abs(d.x) < 0.9 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
  u = normalize(cross(d, ax));
  v = cross(d, u);
}

float rfTem00Elliptic(float x, float y, float wx, float wy) {
  float ax = max(wx, 1e-6);
  float ay = max(wy, 1e-6);
  return (2.0 / 3.14159265) / (ax * ay) * exp(-2.0 * ((x * x) / (ax * ax) + (y * y) / (ay * ay)));
}

float rfResidualDensity(float x, float y, float brCore, float axialT) {
  float w = max(brCore, 1e-5);
  float r = length(vec2(x, y));
  float g1 = (2.0 / 3.14159265) / max((w * 1.55) * (w * 1.55), 1e-10)
    * exp(-2.0 * (r * r) / max((w * 1.55) * (w * 1.55), 1e-10));
  float g2 = (2.0 / 3.14159265) / max((w * 2.55) * (w * 2.55), 1e-10)
    * exp(-2.0 * (r * r) / max((w * 2.55) * (w * 2.55), 1e-10));
  float g3 = (2.0 / 3.14159265) / max((w * 4.2) * (w * 4.2), 1e-10)
    * exp(-2.0 * (r * r) / max((w * 4.2) * (w * 4.2), 1e-10));
  float ghosts = g1 * 0.55 + g2 * 0.30 + g3 * 0.15;
  float halo = (2.0 / 3.14159265) / max((w * 8.0) * (w * 8.0), 1e-10)
    * exp(-2.0 * (r * r) / max((w * 8.0) * (w * 8.0), 1e-10));
  float ring = smoothstep(0.55 * w, 0.95 * w, r) * (1.0 - smoothstep(1.05 * w, 1.85 * w, r));
  float edge = ring * (0.45 / max(w * w, 1e-8));
  float streak = exp(-abs(y) / max(0.28 * w, 1e-5))
    * exp(-(x * x) / max((4.0 * w) * (4.0 * w), 1e-6))
    * (0.18 / max(w * w, 1e-8));
  float dens = 0.50 * ghosts + 0.22 * halo + 0.16 * edge + 0.12 * streak;
  return dens * exp(-0.025 * max(axialT, 0.0));
}

float rfGaussianCore(
  vec3 pCam, vec3 o, vec3 dIn,
  float w0, float m2, float lambdaM, float elliptic, float waistOff, float p5, float pAb
) {
  vec3 d = normalize(dIn);
  vec3 op = pCam - o;
  float t = dot(op, d);
  if (t < 0.0) return 0.0;

  vec3 closest = o + d * t;
  vec3 off = pCam - closest;
  vec3 u; vec3 v;
  rfBeamBasis(d, u, v);
  float x = dot(off, u);
  float y = dot(off, v);

  float topHat = clamp(rfUnpackPairHi(p5), 0.0, 1.0);
  float sph = clamp(rfUnpackPairLo(p5), 0.0, 1.0);
  float coma = clamp(rfUnpackPairHi(pAb), 0.0, 1.0);
  float astig = clamp(rfUnpackPairLo(pAb), 0.0, 1.0);

  if (coma > 1e-4) {
    float r0 = length(vec2(x, y));
    x += coma * 0.28 * r0 * sign(x == 0.0 ? 1.0 : x);
  }

  float w0x = max(w0, 1e-4);
  float w0y = max(w0x * max(elliptic, 0.2), 1e-4);
  float m = clamp(m2, 1.0, 50.0);
  float zRX = 3.14159265 * w0x * w0x / (m * max(lambdaM, 1e-12));
  float zRY = 3.14159265 * w0y * w0y / (m * max(lambdaM, 1e-12));
  float delta = astig * 0.5 * max(zRX, zRY);
  float zx = t - waistOff - delta;
  float zy = t - waistOff + delta;
  float wx = w0x * sqrt(1.0 + (zx / max(zRX, 1e-6)) * (zx / max(zRX, 1e-6)));
  float wy = w0y * sqrt(1.0 + (zy / max(zRY, 1e-6)) * (zy / max(zRY, 1e-6)));

  float r = length(vec2(x, y));
  float rNorm = r / max(sqrt(wx * wy), 1e-6);
  float r2 = rNorm * rNorm;
  float sphStretch = 1.0 + sph * 0.55 * r2 * r2;
  float comaAxis = x / (abs(x) + abs(y) + 1e-6);
  float comaShift = 1.0 + coma * 0.35 * max(comaAxis, 0.0) * rNorm;
  float scale = sphStretch * comaShift;
  float dens = rfTem00Elliptic(x * scale, y * scale, wx, wy);
  if (sph > 1e-4) {
    dens *= 1.0 / (1.0 + sph * 2.2 * rNorm * rNorm);
  }
  if (topHat > 1e-5) {
    // Avoid identifier "flat" — reserved interpolation qualifier in GLSL ES 3.
    float topHatShape = rNorm < 1.0 ? 1.0 : exp(-4.0 * (rNorm - 1.0) * (rNorm - 1.0));
    float topHatDens = topHatShape * (2.0 / 3.14159265) / max(wx * wy, 1e-10);
    dens = mix(dens, topHatDens, topHat);
  }
  return dens * RF_DISPLAY_SCALE;
}

float rfEvalCore(
  vec3 pCam, vec3 o, vec3 dIn, float mode,
  float p0, float p1, float p2, float p3, float p4, float p5, vec3 spill
) {
  vec3 d = normalize(dIn);
  vec3 op = pCam - o;

  if (mode < 0.5) {
    float softR = max(p0, 0.01);
    float dist = max(length(op), 1e-4);
    float fall = pow(dist / softR, max(p1, 0.5));
    return RF_DISPLAY_SCALE / (dist * dist * (1.0 + fall));
  }

  float t = dot(op, d);
  if (t < 0.0) return 0.0;
  float r = length(pCam - (o + d * t));

  if (mode < 1.5) {
    float inner = max(p0, 0.01);
    float outer = max(p1, inner + 0.001);
    vec3 v = normalize(op);
    float cosTheta = max(dot(v, d), 0.0);
    float angle = acos(cosTheta);
    float cone = 1.0 - smoothstep(inner, outer, angle);
    if (cone <= 1e-5) return 0.0;
    float sharpness = max(p2, 1.0);
    float core = pow(cosTheta, sharpness) * (angle <= inner ? 1.0 : cone);
    float rim = cone * smoothstep(inner, outer, angle) * 0.25;
    float invR2 = 1.0 / max(t * t, 0.01);
    return (core + rim) * invR2 * RF_DISPLAY_SCALE * 4.0;
  }

  if (mode < 2.5) {
    float br = max(p0 + p1 * t, 1e-6);
    return (2.0 / 3.14159265) / (br * br) * exp(-2.0 * (r * r) / (br * br)) * RF_DISPLAY_SCALE;
  }

  return rfGaussianCore(
    pCam, o, dIn, max(p0, 1e-4), max(p1, 1.0), max(p2, 1e-9), max(p3, 0.2), p4, p5, spill.y
  );
}

float rfEvalRadianceField(
  vec3 pCam, vec3 o, vec3 dIn, float mode,
  float p0, float p1, float p2, float p3, float p4, float p5, vec3 spill
) {
  // spill.x = strayPowerFraction; spill.y = packUnitPair(coma, astig) for gaussian.
  float f = clamp(max(spill.x, 0.0), 0.0, 0.85);
  float coreRaw = rfEvalCore(pCam, o, dIn, mode, p0, p1, p2, p3, p4, p5, spill);
  float core = coreRaw * (1.0 - f);
  if (f < 1e-5) return core;

  if (mode < 0.5) {
    float dist = max(length(pCam - o), 1e-4);
    float softR = max(p0, 0.01) * (1.8 + f);
    float residual = f * RF_DISPLAY_SCALE / (dist * dist * (1.0 + pow(dist / softR, 2.0)));
    return core + residual;
  }

  vec3 d = normalize(dIn);
  vec3 op = pCam - o;
  float t = dot(op, d);
  if (t < 0.0) {
    float rb = length(op);
    return core + f * 0.35 * exp(-(rb * rb) / 0.04) * RF_DISPLAY_SCALE;
  }
  vec3 closest = o + d * t;
  vec3 off = pCam - closest;
  vec3 u; vec3 v;
  rfBeamBasis(d, u, v);
  float bx = dot(off, u);
  float by = dot(off, v);

  float brCore = 0.02;
  if (mode >= 2.5) {
    // Geometric-mean waist — same as CPU evalSpillOnly (not peak-inverted).
    float w0x = max(p0, 1e-4);
    float w0y = max(w0x * max(p3, 0.2), 1e-4);
    float m = clamp(max(p1, 1.0), 1.0, 50.0);
    float lambdaM = max(p2, 1e-12);
    float astig = clamp(rfUnpackPairLo(spill.y), 0.0, 1.0);
    float zRX = 3.14159265 * w0x * w0x / (m * lambdaM);
    float zRY = 3.14159265 * w0y * w0y / (m * lambdaM);
    float delta = astig * 0.5 * max(zRX, zRY);
    float zx = t - p4 - delta;
    float zy = t - p4 + delta;
    float wx = w0x * sqrt(1.0 + (zx / max(zRX, 1e-6)) * (zx / max(zRX, 1e-6)));
    float wy = w0y * sqrt(1.0 + (zy / max(zRY, 1e-6)) * (zy / max(zRY, 1e-6)));
    brCore = sqrt(max(wx * wy, 1e-10));
  } else if (mode >= 1.5) {
    brCore = max(p0 + p1 * t, 0.01);
  } else {
    float outer = max(p1, 0.05);
    brCore = max(tan(outer) * t * 0.35, 0.08);
  }

  // Ghosts / halo / edge / flare — same residual as CPU optics-residual.ts
  return core + f * rfResidualDensity(bx, by, brCore, t) * RF_DISPLAY_SCALE;
}

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
  if (uMediaCount > 0.5 && intersectBox(ro, rd, uMediaCenter0, uMediaHalfExt0, te, tx)) {
    anyHit = true; tEnter = min(tEnter, te); tExit = max(tExit, tx);
  }
  if (uMediaCount > 1.5 && intersectBox(ro, rd, uMediaCenter1, uMediaHalfExt1, te, tx)) {
    anyHit = true; tEnter = min(tEnter, te); tExit = max(tExit, tx);
  }
  if (uMediaCount > 2.5 && intersectBox(ro, rd, uMediaCenter2, uMediaHalfExt2, te, tx)) {
    anyHit = true; tEnter = min(tEnter, te); tExit = max(tExit, tx);
  }
  if (uMediaCount > 3.5 && intersectBox(ro, rd, uMediaCenter3, uMediaHalfExt3, te, tx)) {
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

    if (uLightCount > 0.5) {
      float Li = rfEvalRadianceField(
        p, uLightOrigin0, uLightDir0, uLightMode0,
        uLightP00, uLightP10, uLightP20, uLightP30,
        uLightP40, uLightP50, uLightSpill0
      );
      if (Li > 1e-8) {
        float shadowT0 = lightMediaTransmittance(p, uLightOrigin0, sigmaT);
        if (shadowT0 > 1e-5) {
          vec3 incident0 = uLightMode0 < 0.5
            ? normalize(p - uLightOrigin0)
            : normalize(uLightDir0);
          vec3 viewDir0 = normalize(-rd);
          float cosTheta0 = clamp(dot(incident0, viewDir0), -1.0, 1.0);
          float phaseR0 = phaseRayleigh(cosTheta0);
          float phaseM0 = phaseHG(cosTheta0, mieG);
          float specR0 = spectralScatterFactor(uLightScatter0, 4.0);
          float specM0 = spectralScatterFactor(uLightScatter0, spectralExpM);
          float inScatter0 = (sigmaSR * specR0 * phaseR0
            + sigmaSM * specM0 * phaseM0) * stepSize;
          float ms0 = omega0 * uVolumeMultiScatter * INV_4PI * sigmaS * stepSize;
          // Lscatter *= shadowT (light→medium); then *= T (camera→medium) via outer T.
          col += tint * uLightColor0 * Li * T * uLightPower0
            * shadowT0 * (inScatter0 + ms0);
        }
      }
    }
    if (uLightCount > 1.5) {
      float Li = rfEvalRadianceField(
        p, uLightOrigin1, uLightDir1, uLightMode1,
        uLightP01, uLightP11, uLightP21, uLightP31,
        uLightP41, uLightP51, uLightSpill1
      );
      if (Li > 1e-8) {
        float shadowT1 = lightMediaTransmittance(p, uLightOrigin1, sigmaT);
        if (shadowT1 > 1e-5) {
          vec3 incident1 = uLightMode1 < 0.5
            ? normalize(p - uLightOrigin1)
            : normalize(uLightDir1);
          vec3 viewDir1 = normalize(-rd);
          float cosTheta1 = clamp(dot(incident1, viewDir1), -1.0, 1.0);
          float phaseR1 = phaseRayleigh(cosTheta1);
          float phaseM1 = phaseHG(cosTheta1, mieG);
          float specR1 = spectralScatterFactor(uLightScatter1, 4.0);
          float specM1 = spectralScatterFactor(uLightScatter1, spectralExpM);
          float inScatter1 = (sigmaSR * specR1 * phaseR1
            + sigmaSM * specM1 * phaseM1) * stepSize;
          float ms1 = omega0 * uVolumeMultiScatter * INV_4PI * sigmaS * stepSize;
          // Lscatter *= shadowT (light→medium); then *= T (camera→medium) via outer T.
          col += tint * uLightColor1 * Li * T * uLightPower1
            * shadowT1 * (inScatter1 + ms1);
        }
      }
    }
    if (uLightCount > 2.5) {
      float Li = rfEvalRadianceField(
        p, uLightOrigin2, uLightDir2, uLightMode2,
        uLightP02, uLightP12, uLightP22, uLightP32,
        uLightP42, uLightP52, uLightSpill2
      );
      if (Li > 1e-8) {
        float shadowT2 = lightMediaTransmittance(p, uLightOrigin2, sigmaT);
        if (shadowT2 > 1e-5) {
          vec3 incident2 = uLightMode2 < 0.5
            ? normalize(p - uLightOrigin2)
            : normalize(uLightDir2);
          vec3 viewDir2 = normalize(-rd);
          float cosTheta2 = clamp(dot(incident2, viewDir2), -1.0, 1.0);
          float phaseR2 = phaseRayleigh(cosTheta2);
          float phaseM2 = phaseHG(cosTheta2, mieG);
          float specR2 = spectralScatterFactor(uLightScatter2, 4.0);
          float specM2 = spectralScatterFactor(uLightScatter2, spectralExpM);
          float inScatter2 = (sigmaSR * specR2 * phaseR2
            + sigmaSM * specM2 * phaseM2) * stepSize;
          float ms2 = omega0 * uVolumeMultiScatter * INV_4PI * sigmaS * stepSize;
          // Lscatter *= shadowT (light→medium); then *= T (camera→medium) via outer T.
          col += tint * uLightColor2 * Li * T * uLightPower2
            * shadowT2 * (inScatter2 + ms2);
        }
      }
    }
    if (uLightCount > 3.5) {
      float Li = rfEvalRadianceField(
        p, uLightOrigin3, uLightDir3, uLightMode3,
        uLightP03, uLightP13, uLightP23, uLightP33,
        uLightP43, uLightP53, uLightSpill3
      );
      if (Li > 1e-8) {
        float shadowT3 = lightMediaTransmittance(p, uLightOrigin3, sigmaT);
        if (shadowT3 > 1e-5) {
          vec3 incident3 = uLightMode3 < 0.5
            ? normalize(p - uLightOrigin3)
            : normalize(uLightDir3);
          vec3 viewDir3 = normalize(-rd);
          float cosTheta3 = clamp(dot(incident3, viewDir3), -1.0, 1.0);
          float phaseR3 = phaseRayleigh(cosTheta3);
          float phaseM3 = phaseHG(cosTheta3, mieG);
          float specR3 = spectralScatterFactor(uLightScatter3, 4.0);
          float specM3 = spectralScatterFactor(uLightScatter3, spectralExpM);
          float inScatter3 = (sigmaSR * specR3 * phaseR3
            + sigmaSM * specM3 * phaseM3) * stepSize;
          float ms3 = omega0 * uVolumeMultiScatter * INV_4PI * sigmaS * stepSize;
          // Lscatter *= shadowT (light→medium); then *= T (camera→medium) via outer T.
          col += tint * uLightColor3 * Li * T * uLightPower3
            * shadowT3 * (inScatter3 + ms3);
        }
      }
    }

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
