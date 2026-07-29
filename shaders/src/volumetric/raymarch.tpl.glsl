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
/** Water optics from Fluids quality (analytical free-surface Snell). */
uniform float uFluidEnableRefraction;
uniform float uFluidMaxSurfaceBounces;

/** Analytical water OBB fill-slab for underwater laser Beer / IOR. */
uniform float uWaterMediumOn;
uniform vec3 uWaterCenter;
uniform vec3 uWaterHalfExt;
uniform vec3 uWaterAxisX;
uniform vec3 uWaterAxisY;
uniform vec3 uWaterAxisZ;
uniform float uWaterFill;
uniform float uWaterIor;
uniform vec3 uWaterColor;
uniform float uWaterDensity;
uniform float uWaterScatter;
uniform float uWaterAbsorb;
uniform vec3 uWaterGravity;

/** Environment irradiance → media in-scatter (cloud / fog lighting). */
uniform vec3 uEnvHemi;
uniform vec3 uEnvSun;
uniform vec3 uEnvSunDir;
uniform float uVolumeMultiScatter;

/** Global sun volumetrics (air scatter along every view ray). */
uniform float uGlobalSunOn;
uniform float uGlobalSunIntensity;
uniform float uGlobalSunDensity;
uniform float uGlobalSunScatter;
uniform float uGlobalSunAbsorb;
uniform float uGlobalSunMieG;
uniform float uGlobalSunMieWeight;
uniform float uGlobalSunShaftPower;
uniform float uGlobalSunHemiFill;
uniform float uGlobalSunMultiScatter;
uniform float uGlobalSunMaxDist;
uniform float uGlobalSunStepScale;

uniform float uLightCount;
{{LIGHT_UNIFORMS}}

uniform float uMediaCount;
{{MEDIA_UNIFORMS}}

uniform float uFluidCount;
{{FLUID_UNIFORMS}}

{{MEDIA_NOISE_FNS}}

{{FLUID_SAMPLE_FNS}}

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

bool pointInWaterSlab(vec3 pCam) {
  if (uWaterMediumOn < 0.5) return false;
  vec3 d = pCam - uWaterCenter;
  vec3 local = vec3(dot(d, uWaterAxisX), dot(d, uWaterAxisY), dot(d, uWaterAxisZ));
  if (any(greaterThan(abs(local), uWaterHalfExt + vec3(1e-4)))) return false;
  vec3 g = uWaterGravity;
  float glen = length(g);
  vec3 up = glen > 1e-5 ? normalize(-g) : vec3(0.0, 1.0, 0.0);
  float extUp =
    abs(dot(uWaterAxisX, up)) * uWaterHalfExt.x +
    abs(dot(uWaterAxisY, up)) * uWaterHalfExt.y +
    abs(dot(uWaterAxisZ, up)) * uWaterHalfExt.z;
  float centerH = dot(uWaterCenter, up);
  float fill = clamp(uWaterFill, 0.0, 1.0);
  float surfaceH = centerH - extUp + 2.0 * extUp * fill;
  return dot(pCam, up) <= surfaceH + 1e-3;
}

void accumWaterMedium(
  vec3 pCam,
  inout float dens,
  inout vec3 tintAccum,
  inout float tintWeight,
  inout float sigmaSR,
  inout float sigmaSM,
  inout float sigmaA
) {
  if (!pointInWaterSlab(pCam)) return;
  float d = max(uWaterDensity, 0.15);
  dens += d;
  float ss = max(uWaterScatter, 0.0) * d;
  float sa = max(uWaterAbsorb, 0.02) * d;
  sigmaSR += ss * 0.35;
  sigmaSM += ss * 0.65;
  sigmaA += sa;
  float w = ss + sa * 0.25;
  tintAccum += uWaterColor * w;
  tintWeight += w;
}

/**
 * Extinction σ_t at q for shadow rays — AABB + density×plume (+ height), no noise texture.
 */
float mediaExtinctionFast(vec3 q) {
{{MEDIA_EXTINCTION}}
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
  // March toward the sun (against light travel) for sun→sample optical depth.
  vec3 dir = normalize(-uEnvSunDir);
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

{{MEDIA_SAMPLE_ACCUM}}

{{FLUID_SAMPLE_ACCUM}}

  accumWaterMedium(pCam, dens, tintAccum, tintWeight, sigmaSR, sigmaSM, sigmaA);

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

/* Shared with surface plugin — CPU twin: engine/physics/optics/beam/beam-model.ts evalRadianceField */
// @include contract/radiance_field.glsl

vec3 refractSafeMarch(vec3 i, vec3 n, float eta) {
  float cosi = clamp(-dot(i, n), -1.0, 1.0);
  float k = 1.0 - eta * eta * (1.0 - cosi * cosi);
  if (k < 0.0) return reflect(i, n);
  return eta * i + (eta * cosi - sqrt(k)) * n;
}

/**
 * Analytical water free-surface medium switch (fillFraction slab).
 * Bounce >= 1: air to water Snell. Bounce >= 2: keep underwater OBB span.
 */
void applyWaterMediumSwitch(inout vec3 ro, inout vec3 rd, inout float tEnter, inout float tExit) {
  if (uWaterMediumOn < 0.5 || uFluidEnableRefraction < 0.5 || uFluidMaxSurfaceBounces < 0.5) {
    return;
  }
  vec3 ax = uWaterAxisX;
  vec3 ay = uWaterAxisY;
  vec3 az = uWaterAxisZ;
  vec3 center = uWaterCenter;
  vec3 halfExt = uWaterHalfExt;
  vec3 roL = vec3(dot(ro - center, ax), dot(ro - center, ay), dot(ro - center, az));
  vec3 rdL = vec3(dot(rd, ax), dot(rd, ay), dot(rd, az));
  float te;
  float tx;
  if (!intersectBox(roL, rdL, vec3(0.0), halfExt, te, tx)) return;
  te = max(te, 0.0);
  if (tx <= te + 1e-4) return;

  vec3 g = uWaterGravity;
  float glen = length(g);
  vec3 up = glen > 1e-5 ? normalize(-g) : vec3(0.0, 1.0, 0.0);
  float extUp =
    abs(dot(ax, up)) * halfExt.x + abs(dot(ay, up)) * halfExt.y + abs(dot(az, up)) * halfExt.z;
  float centerH = dot(center, up);
  float fill = clamp(uWaterFill, 0.0, 1.0);
  float surfaceH = centerH - extUp + 2.0 * extUp * fill;

  float denom = dot(rd, up);
  float tSurf = abs(denom) > 1e-5 ? (surfaceH - dot(ro, up)) / denom : -1.0;
  bool fromAir = dot(ro, up) > surfaceH;

  if (tSurf < te - 1e-3 || tSurf > tx + 1e-3) {
    if (!fromAir && uFluidMaxSurfaceBounces >= 1.5) {
      tEnter = min(tEnter, te);
      tExit = max(tExit, tx);
    }
    return;
  }

  vec3 N = up;
  if (dot(N, -rd) < 0.0) N = -N;
  float eta = fromAir ? (1.0 / max(uWaterIor, 1.01)) : max(uWaterIor, 1.01);

  if (fromAir) {
    rd = normalize(refractSafeMarch(rd, N, eta));
    rdL = vec3(dot(rd, ax), dot(rd, ay), dot(rd, az));
    if (intersectBox(roL, rdL, vec3(0.0), halfExt, te, tx)) {
      tEnter = min(tEnter, max(te, tSurf));
      tExit = max(tExit, tx);
    }
    if (uFluidMaxSurfaceBounces >= 1.5) {
      tExit = max(tExit, tx);
    }
  } else if (uFluidMaxSurfaceBounces >= 2.5) {
    rd = normalize(refractSafeMarch(rd, -N, eta));
    rdL = vec3(dot(rd, ax), dot(rd, ay), dot(rd, az));
    if (intersectBox(roL, rdL, vec3(0.0), halfExt, te, tx)) {
      tEnter = min(tEnter, te);
      tExit = max(tExit, tx);
    }
  }
}

vec3 march(vec3 ro, vec3 rd, float sceneZCam) {
  // Media, fog density, or analytical water required.
  if (uMediaCount < 0.5 && uFluidCount < 0.5 && uWaterMediumOn < 0.5) return vec3(0.0);
  float envEnergy = max(uEnvHemi.r + uEnvHemi.g + uEnvHemi.b, 0.0)
    + max(uEnvSun.r + uEnvSun.g + uEnvSun.b, 0.0);
  if (uLightCount < 0.5 && envEnergy < 1e-6) return vec3(0.0);

  float tEnter = 1e9;
  float tExit = -1e9;
  bool anyHit = false;
  float te; float tx;
{{MEDIA_INTERSECT}}
{{FLUID_INTERSECT}}
  if (uWaterMediumOn > 0.5) {
    vec3 roL = vec3(dot(ro - uWaterCenter, uWaterAxisX), dot(ro - uWaterCenter, uWaterAxisY), dot(ro - uWaterCenter, uWaterAxisZ));
    vec3 rdL = vec3(dot(rd, uWaterAxisX), dot(rd, uWaterAxisY), dot(rd, uWaterAxisZ));
    if (intersectBox(roL, rdL, vec3(0.0), uWaterHalfExt, te, tx)) {
      anyHit = true;
      tEnter = min(tEnter, max(te, 0.0));
      tExit = max(tExit, tx);
    }
  }
  if (!anyHit) return vec3(0.0);

  applyWaterMediumSwitch(ro, rd, tEnter, tExit);

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

    // Environment illuminates the medium (clouds, fog, and underwater sun shafts)
    if (envEnergy > 1e-8 && dens > uDensityThreshold * 0.5) {
      vec3 viewDir = normalize(-rd);
      float sunT = sunMediaTransmittance(p, max(sigmaT, 1e-4));
      // Scatter path (fog / smoke / water Mie-Rayleigh)
      if (sigmaS > 1e-10) {
        col += tint * uEnvHemi * sigmaS * INV_4PI * stepSize * T;
        float cosSun = clamp(dot(normalize(uEnvSunDir), viewDir), -1.0, 1.0);
        float phaseSun = (sigmaSR * phaseRayleigh(cosSun) + sigmaSM * phaseHG(cosSun, mieG))
          / max(sigmaS, 1e-10);
        col += tint * uEnvSun * sigmaS * phaseSun * stepSize * T * sunT;
        float msEnv = omega0 * uVolumeMultiScatter * INV_4PI * sigmaS * stepSize;
        col += tint * (uEnvHemi + uEnvSun * sunT) * msEnv * T;
      }
      // Absorption-lit sun body (water god-rays even when scatter is modest)
      if (sigmaA > 1e-10) {
        float cosBeam = clamp(dot(normalize(-uEnvSunDir), viewDir), 0.0, 1.0);
        float shaft = 0.55 + 0.45 * pow(cosBeam, 4.0);
        col += tint * uEnvSun * sigmaA * 0.85 * shaft * stepSize * T * sunT;
        col += tint * uEnvHemi * sigmaA * 0.12 * INV_4PI * stepSize * T;
      }
    }

{{LIGHT_EVAL_MARCH}}

    t += stepSize;
    i++;
  }
  return col;
}

/** Uniform air scatter toward the env sun — no MediaVolume AABB required. */
vec3 marchGlobalSun(vec3 ro, vec3 rd, float sceneZCam) {
  if (uGlobalSunOn < 0.5) return vec3(0.0);
  float sunE = max(uEnvSun.r + uEnvSun.g + uEnvSun.b, 0.0);
  float hemiE = max(uEnvHemi.r + uEnvHemi.g + uEnvHemi.b, 0.0);
  if (sunE < 1e-6 && hemiE < 1e-6) return vec3(0.0);

  float dens = max(uGlobalSunDensity, 0.0);
  float sigmaS = dens * max(uGlobalSunScatter, 0.0);
  float sigmaA = dens * max(uGlobalSunAbsorb, 0.0);
  float sigmaT = sigmaS + sigmaA;
  if (sigmaT < 1e-8) return vec3(0.0);

  float baseStep = max(uStepSize * max(uGlobalSunStepScale, 0.25), 0.02);
  int maxSteps = int(uMaxSteps);
  float jitter = hash(rd * (uTime + 1.7)) * baseStep;
  vec3 col = vec3(0.0);
  float T = 1.0;
  float t = jitter;
  int i = 0;
  float tMax = max(uGlobalSunMaxDist, baseStep);

  float omega0 = sigmaS / max(sigmaT, 1e-6);
  float mieW = clamp(uGlobalSunMieWeight, 0.0, 1.0);
  float rayW = 1.0 - mieW;
  vec3 viewDir = normalize(-rd);
  float cosSun = clamp(dot(normalize(uEnvSunDir), viewDir), -1.0, 1.0);
  float phaseSun = rayW * phaseRayleigh(cosSun) + mieW * phaseHG(cosSun, uGlobalSunMieG);
  float shaftPow = max(uGlobalSunShaftPower, 1.0);
  float intensity = max(uGlobalSunIntensity, 0.0);

  for (int k = 0; k < 512; k++) {
    if (i >= maxSteps || t >= tMax) break;
    vec3 p = ro + rd * t;
    if (uUseSceneDepth > 0.5 && sceneZCam > 1e-4) {
      float z = abs((uView * vec4(p + uCameraPos, 1.0)).z);
      if (z >= sceneZCam - 0.03) break;
    }

    T *= exp(-sigmaT * baseStep * 0.5);
    if (T < uTransmittanceCut) break;

    float sunT = sunMediaTransmittance(p, sigmaT);

    if (sigmaS > 1e-10) {
      col += uEnvSun * sigmaS * phaseSun * baseStep * T * sunT * intensity;
      col += uEnvHemi * sigmaS * INV_4PI * baseStep * T * uGlobalSunHemiFill;
      float ms = omega0 * uGlobalSunMultiScatter * INV_4PI * sigmaS * baseStep;
      col += (uEnvHemi * uGlobalSunHemiFill + uEnvSun * sunT) * ms * T * intensity;
    }
    if (sigmaA > 1e-10 && sunE > 1e-6) {
      float cosBeam = clamp(dot(normalize(-uEnvSunDir), viewDir), 0.0, 1.0);
      float shaft = 0.55 + 0.45 * pow(cosBeam, shaftPow);
      col += uEnvSun * sigmaA * 0.85 * shaft * baseStep * T * sunT * intensity;
    }

    t += baseStep;
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
  vol += marchGlobalSun(ro, rd, sceneZCam);
  // HDR linear contribution — tonemap + color-space encode happen in compose.
  gl_FragColor = vec4(vol, 1.0);
}
