/**
 * Analytical scientific water: gravity-aligned fillFraction free-surface + OBB body.
 * Dielectric Fresnel, Snell refraction, Beer–Lambert absorption, Gerstner-like waves.
 * Camera-relative rays (world − cameraPos). Scene depth = Babylon camera-space |Z|.
 */
precision highp float;

varying vec2 vUV;
uniform sampler2D textureSampler;
uniform sampler2D uSceneDepth;
uniform sampler2D uEnvCube;
uniform float uUseEnv;
uniform mat4 uInvViewProj;
uniform mat4 uView;
uniform vec3 uCameraPos;
uniform vec3 uFluidCenter;
uniform vec3 uFluidHalfExt;
uniform vec3 uAxisX;
uniform vec3 uAxisY;
uniform vec3 uAxisZ;
uniform vec3 uGravityDir;
uniform vec3 uSunDir;
uniform vec3 uSunRgb;
uniform vec3 uHemiRgb;
uniform vec3 uWaterColor;
uniform float uOpticalDensity;
uniform float uScatter;
uniform float uAbsorb;
uniform float uCausticStrength;
uniform float uFoamStrength;
uniform float uIor;
uniform float uFillFraction;
uniform float uWaveAmp;
uniform float uWaveFreq;
uniform float uWaveSteep;
uniform float uTime;
uniform float uEnableRefraction;
uniform float uMaxSurfaceBounces;
uniform float uSurfaceSamples;
uniform float uRefractionMultiplier;
uniform float uExtinctionScale;
uniform vec2 uResolution;

bool hitObb(vec3 ro, vec3 rd, out float t0, out float t1) {
  vec3 d = ro - uFluidCenter;
  vec3 o = vec3(dot(d, uAxisX), dot(d, uAxisY), dot(d, uAxisZ));
  vec3 r = vec3(dot(rd, uAxisX), dot(rd, uAxisY), dot(rd, uAxisZ));
  vec3 inv = 1.0 / (r + vec3(sign(r) * 1e-6 + 1e-6));
  vec3 tA = (-uFluidHalfExt - o) * inv;
  vec3 tB = (uFluidHalfExt - o) * inv;
  vec3 tmin = min(tA, tB);
  vec3 tmax = max(tA, tB);
  t0 = max(max(tmin.x, tmin.y), tmin.z);
  t1 = min(min(tmax.x, tmax.y), tmax.z);
  return t1 >= max(t0, 0.0);
}

float camZ(vec3 pCam) {
  return abs((uView * vec4(pCam + uCameraPos, 1.0)).z);
}

vec3 worldUp() {
  vec3 g = uGravityDir;
  float len = length(g);
  return len > 1e-5 ? normalize(-g) : vec3(0.0, 1.0, 0.0);
}

float extAlongUp(vec3 up) {
  return abs(dot(uAxisX, up)) * uFluidHalfExt.x
    + abs(dot(uAxisY, up)) * uFluidHalfExt.y
    + abs(dot(uAxisZ, up)) * uFluidHalfExt.z;
}

float surfaceHeight(vec3 up) {
  float fill = clamp(uFillFraction, 0.0, 1.0);
  float ext = extAlongUp(up);
  float centerH = dot(uFluidCenter, up);
  return centerH - ext + 2.0 * ext * fill;
}

float heightOf(vec3 p, vec3 up) {
  return dot(p, up);
}

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

/** Multi-sine / Gerstner-derivative normal on the free surface. */
vec3 waveNormal(vec3 hit, vec3 up) {
  return waveNormalAt(hit, up, uWaveAmp, uWaveFreq, uWaveSteep, uTime);
}

/** Flat fill height + Gerstner displacement along up. */
float displacedSurfaceHeight(vec3 p, vec3 up) {
  vec3 ax;
  vec3 az;
  waveTangentFrame(up, ax, az);
  float x = dot(p, ax);
  float z = dot(p, az);
  return surfaceHeight(up) + waveHeight(x, z, uWaveAmp, uWaveFreq, uWaveSteep, uTime);
}

/**
 * Ray × wavy free-surface: seed from flat plane, refine with height field
 * so the silhouette tracks Gerstner displacement.
 */
float intersectWavySurface(vec3 ro, vec3 rd, vec3 up) {
  float yFlat = surfaceHeight(up);
  float denom = dot(rd, up);
  if (abs(denom) < 1e-5) return -1.0;
  float t = (yFlat - heightOf(ro, up)) / denom;
  for (int i = 0; i < 4; i++) {
    vec3 p = ro + rd * t;
    float target = displacedSurfaceHeight(p, up);
    float err = target - heightOf(p, up);
    t += err / denom;
  }
  return t;
}

vec3 sampleSky(vec3 R) {
  vec3 towardSun = normalize(-uSunDir);
  float elev = clamp(R.y * 0.5 + 0.5, 0.0, 1.0);
  vec3 zenith = vec3(0.08, 0.37, 0.73);
  vec3 horizon = vec3(1.0, 1.0, 1.0);
  vec3 ground = vec3(0.35, 0.3, 0.35) * 0.53;
  float skyT = pow(smoothstep(0.0, 0.4, R.y), 0.35);
  float g2s = smoothstep(-0.01, 0.0, R.y);
  vec3 sky = mix(horizon, zenith, skyT);
  sky = mix(ground, sky, g2s);
  sky += uHemiRgb * 0.35;
  float sun = pow(max(dot(normalize(R), towardSun), 0.0), 180.0);
  sky += uSunRgb * sun * (g2s >= 1.0 ? 1.0 : 0.0);
  if (uUseEnv > 0.5) {
    float u = 0.5 + atan(R.z, R.x) / (2.0 * 3.14159265);
    float v = 0.5 - asin(clamp(R.y, -1.0, 1.0)) / 3.14159265;
    sky = mix(sky, texture2D(uEnvCube, vec2(u, v)).rgb, 0.55);
  }
  return sky;
}

float fresnelDielectric(float cosThetaI, float eta) {
  float cosi = clamp(cosThetaI, 0.0, 1.0);
  float sint2 = eta * eta * (1.0 - cosi * cosi);
  if (sint2 >= 1.0) return 1.0;
  float cost = sqrt(max(1.0 - sint2, 0.0));
  float rs = (eta * cosi - cost) / max(eta * cosi + cost, 1e-5);
  float rp = (cosi - eta * cost) / max(cosi + eta * cost, 1e-5);
  return clamp(0.5 * (rs * rs + rp * rp), 0.0, 1.0);
}

vec3 refractSafe(vec3 i, vec3 n, float eta) {
  float cosi = clamp(-dot(i, n), -1.0, 1.0);
  float k = 1.0 - eta * eta * (1.0 - cosi * cosi);
  if (k < 0.0) return reflect(i, n);
  return eta * i + (eta * cosi - sqrt(k)) * n;
}

vec3 beerExtinction() {
  float dens = max(uOpticalDensity, 0.15);
  float a = max(uAbsorb, 0.02) * dens * max(uExtinctionScale, 0.25);
  vec3 inv = vec3(1.0) - uWaterColor;
  return max(inv, vec3(0.05)) * a * 1.6 + vec3(a * 0.3) + vec3(max(uScatter, 0.0) * dens * 0.15);
}

bool pointInObb(vec3 p) {
  vec3 d = p - uFluidCenter;
  vec3 local = vec3(dot(d, uAxisX), dot(d, uAxisY), dot(d, uAxisZ));
  return all(lessThanEqual(abs(local), uFluidHalfExt + vec3(1e-4)));
}

void main(void) {
  vec3 scene = texture2D(textureSampler, vUV).rgb;
  if (uOpticalDensity < 1e-6 && uFillFraction < 1e-4) {
    gl_FragColor = vec4(scene, 1.0);
    return;
  }

  vec2 ndc = vUV * 2.0 - 1.0;
  vec4 nearH = uInvViewProj * vec4(ndc, -1.0, 1.0);
  vec4 farH = uInvViewProj * vec4(ndc, 1.0, 1.0);
  vec3 nearW = nearH.xyz / max(nearH.w, 1e-8);
  vec3 farW = farH.xyz / max(farH.w, 1e-8);
  vec3 ro = nearW - uCameraPos;
  vec3 rd = normalize(farW - nearW);

  float tEnter;
  float tExit;
  if (!hitObb(ro, rd, tEnter, tExit)) {
    gl_FragColor = vec4(scene, 1.0);
    return;
  }
  tEnter = max(tEnter, 0.0);
  if (tExit <= tEnter + 1e-4) {
    gl_FragColor = vec4(scene, 1.0);
    return;
  }

  float sceneZCam = texture2D(uSceneDepth, vUV).r;
  if (sceneZCam > 1e-4) {
    float zEnter = camZ(ro + rd * tEnter);
    if (sceneZCam < zEnter - 0.03) {
      gl_FragColor = vec4(scene, 1.0);
      return;
    }
  }

  vec3 up = worldUp();
  float denom = dot(rd, up);
  float tPlane = intersectWavySurface(ro, rd, up);

  float tW0 = tEnter;
  float tW1 = tExit;
  if (abs(denom) < 1e-5) {
    if (heightOf(ro, up) > displacedSurfaceHeight(ro, up)) {
      gl_FragColor = vec4(scene, 1.0);
      return;
    }
  } else if (denom > 0.0) {
    tW1 = min(tW1, tPlane);
  } else {
    tW0 = max(tW0, tPlane);
  }

  if (sceneZCam > 1e-4) {
    float z0 = max(camZ(ro + rd * max(tEnter, 1e-3)), 1e-4);
    float tScene = sceneZCam * (max(tEnter, 1e-3) / z0);
    tW1 = min(tW1, tScene);
    tExit = min(tExit, tScene);
  }

  bool hasBody = tW1 > tW0 + 1e-4;
  bool hitSurface =
    tPlane >= tEnter - 1e-3 && tPlane <= tExit + 1e-3 && abs(denom) >= 1e-5;
  bool camInside = heightOf(ro, up) < displacedSurfaceHeight(ro, up) && pointInObb(ro);

  if (!hasBody && !hitSurface && !camInside) {
    gl_FragColor = vec4(scene, 1.0);
    return;
  }

  vec3 col = scene;
  float surfT = hitSurface ? tPlane : (camInside ? tEnter : tW0);
  vec3 hit = ro + rd * max(surfT, tEnter);
  vec3 N = waveNormal(hit, up);
  if (dot(N, -rd) < 0.0) N = -N;

  bool fromBelow =
    camInside || (hitSurface && denom > 0.0 && heightOf(ro, up) < displacedSurfaceHeight(ro, up));
  float eta = fromBelow ? max(uIor, 1.01) : (1.0 / max(uIor, 1.01));

  if (hitSurface || camInside) {
    vec3 R = reflect(rd, N);
    vec3 Tdir = uEnableRefraction > 0.5 ? refractSafe(rd, N, eta) : rd;

    float pathHint = hasBody ? max(tW1 - tW0, 0.05) : 0.35;
    float refrScale = clamp(pathHint * uRefractionMultiplier * 0.06, 0.0, 0.12);
    vec2 refrBase = Tdir.xy * refrScale + N.xy * (refrScale * 0.25);

    int taps = int(clamp(uSurfaceSamples, 1.0, 8.0));
    vec3 refr = vec3(0.0);
    float tapW = 0.0;
    for (int ti = 0; ti < 8; ti++) {
      if (ti >= taps) break;
      float o = float(ti) - float(taps - 1) * 0.5;
      vec2 offset = refrBase * (1.0 + 0.1 * o);
      vec2 refrUv = clamp(vUV + (uEnableRefraction > 0.5 ? offset : vec2(0.0)), 0.0, 1.0);
      refr += texture2D(textureSampler, refrUv).rgb;
      tapW += 1.0;
    }
    refr /= max(tapW, 1.0);

    float thick = hasBody ? (tW1 - tW0) : pathHint;
    vec3 transmission = exp(-beerExtinction() * thick);
    refr *= transmission;
    refr = mix(refr, refr * uWaterColor * 1.05, clamp(0.2 + thick * 0.3, 0.0, 0.75));

    vec3 towardSun = normalize(-uSunDir);
    vec3 reflectCol = sampleSky(R);
    vec2 reflUv = clamp(vUV + R.xz * 0.05, 0.0, 1.0);
    reflectCol = mix(reflectCol, texture2D(textureSampler, reflUv).rgb, 0.18);
    float sunSpec = pow(max(dot(R, towardSun), 0.0), 96.0);
    reflectCol += uSunRgb * sunSpec * 1.15;

    float F = fresnelDielectric(max(dot(N, -rd), 0.0), eta);
    // foamStrength → slight roughness / edge Fresnel boost (not sparkle foam).
    float edge = pow(1.0 - max(dot(N, -rd), 0.0), 3.0);
    F = clamp(F + edge * uFoamStrength * 0.12, 0.0, 1.0);

    if (uEnableRefraction < 0.5 || uMaxSurfaceBounces < 0.5) {
      col = mix(scene, mix(uWaterColor, reflectCol, 0.55), 0.55);
    } else {
      col = mix(reflectCol, refr, 1.0 - F);
    }
  }

  if (hasBody || camInside) {
    float path = hasBody ? (tW1 - tW0) : max(0.0, tExit - tEnter);
    vec3 beer = exp(-beerExtinction() * path);
    col *= beer;
    float fog = 1.0 - exp(-(uAbsorb + uScatter) * max(uOpticalDensity, 0.15) * path * 0.45);
    col = mix(col, uWaterColor * (0.22 + uSunRgb * 0.5 + uHemiRgb * 0.25), clamp(fog, 0.0, 0.85));

    // Soft underwater caustic cue (ground caustics are surface-plugin).
    float cau = pow(max(dot(N, normalize(-uSunDir)), 0.0), 5.0) * uCausticStrength;
    col += uSunRgb * cau * uWaterColor * 0.18 * beer;
  }

  gl_FragColor = vec4(col, 1.0);
}
