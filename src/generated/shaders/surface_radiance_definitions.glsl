#ifdef SURFACE_RADIANCE
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
float mfSchlickFresnel(float vDotH, float f0) {
  float x = 1.0 - clamp(vDotH, 0.0, 1.0);
  return f0 + (1.0 - f0) * pow(x, 5.0);
}

float mfGgxD(float nDotH, float alpha) {
  float a = max(alpha, 1e-4);
  float a2 = a * a;
  float nh = max(nDotH, 0.0);
  float d = nh * nh * (a2 - 1.0) + 1.0;
  return a2 / (3.14159265 * d * d);
}

float mfSmithG1(float nDotX, float alpha) {
  float a = max(alpha, 1e-4);
  float nd = max(nDotX, 1e-5);
  float a2 = a * a;
  return (2.0 * nd) / (nd + sqrt(a2 + (1.0 - a2) * nd * nd));
}

float mfSmithG(float nDotL, float nDotV, float alpha) {
  return mfSmithG1(nDotL, alpha) * mfSmithG1(nDotV, alpha);
}

float mfSpecularF0(float albedo, float metalness) {
  return mix(0.04, clamp(albedo, 0.0, 1.0), clamp(metalness, 0.0, 1.0));
}

// Returns vec2(diffuse, specular) BRDF terms (multiply by irradiance E).
// Fresnel uses V·H (Cook–Torrance), not N·V.
vec2 mfEvaluate(float nDotL, float nDotV, float nDotH, float vDotH, float albedo, float metal, float rough, float absorption) {
  nDotL = max(nDotL, 0.0);
  nDotV = max(nDotV, 1e-5);
  if (nDotL <= 1e-6) return vec2(0.0);
  float alpha = max(rough * rough, 1e-4);
  float f0 = mfSpecularF0(albedo, metal);
  float F = mfSchlickFresnel(max(vDotH, 0.0), f0);
  float D = mfGgxD(nDotH, alpha);
  float G = mfSmithG(nDotL, nDotV, alpha);
  float spec = (D * F * G) / max(4.0 * nDotL * nDotV, 1e-5);
  float kd = (1.0 - f0) * (1.0 - metal);
  float survive = max(1.0 - clamp(absorption, 0.0, 1.0), 0.05);
  float diffuse = kd * albedo * 0.318309886 * survive;
  return vec2(diffuse, spec * survive);
}
// Unity-like L: Point/Spot from emitter; Directional (tube/laser) = -beamDir.
vec3 srLightDir(vec3 worldPos, vec3 o, vec3 dIn, float mode) {
  if (mode < 1.5) {
    // 0 = Point (omni), 1 = Spot (cone)
    vec3 toLight = o - worldPos;
    float len = length(toLight);
    if (len < 1e-6) return normalize(-dIn);
    return toLight / len;
  }
  // 2 = Directional tube, 3 = Directional laser
  return normalize(-dIn);
}

        /**
         * Projected caustic under gravity-aligned fill slab.
         * Pattern driven by FluidVolume waveAmplitude / waveFrequency / waveSteepness
         * (same Gerstner-like multi-sine as water_surface PP).
         */
        float srHash21(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
        }
        float srCausticPattern(vec2 uv, float t) {
          float amp = max(uSrCausticWaveAmp, 0.0);
          float freq = max(uSrCausticWaveFreq, 0.05);
          float steep = clamp(uSrCausticWaveSteep, 0.0, 1.0);
          // Spatial scale from wave frequency; amplitude boosts filament contrast.
          float spat = 1.4 + freq * 0.85;
          vec2 p = uv * spat;
          float a0 = 0.55 + amp * 18.0;
          float a1 = 0.35 + amp * 10.0;
          float a2 = 0.25 + amp * 6.0;
          float f0 = freq;
          float f1 = freq * 1.7;
          float f2 = freq * 2.9;
          float p0 = (p.x * 1.0 + p.y * 0.15) * f0 - t * 1.4;
          float p1 = (p.x * -0.55 + p.y * 0.85) * f1 + t * 1.1;
          float p2 = (p.x * 0.35 + p.y * -0.9) * f2 - t * 2.2;
          float slope =
            a0 * cos(p0) * (1.0 + steep) +
            a1 * cos(p1) * (1.0 + steep * 0.7) +
            a2 * cos(p2);
          float ridges = abs(slope) * (0.35 + steep * 0.45);
          float filaments = pow(1.0 - smoothstep(0.0, 0.55, ridges), 2.0 + steep);
          float fine = pow(0.5 + 0.5 * sin(p.x * (6.0 + freq) + p.y * (5.0 + freq * 0.5) + t * 2.1), 3.0 + steep);
          float hashJitter = srHash21(floor(p * 4.0) + t * 0.01) * 0.06;
          float contrast = clamp(0.55 + amp * 22.0, 0.4, 2.2);
          return clamp((filaments * 1.1 + fine * 0.3 + hashJitter) * contrast, 0.0, 1.8);
        }
        vec3 srProjectedCaustic(vec3 worldPos, vec3 N) {
          if (uSrCausticStrength < 1e-5) return vec3(0.0);
          vec3 ax = normalize(uSrCausticAxisX);
          vec3 ay = normalize(uSrCausticAxisY);
          vec3 az = normalize(uSrCausticAxisZ);
          vec3 L = normalize(uSrCausticSunDir + vec3(1e-5));
          // Free surface settles under world gravity — shade with world-up, not tank local +Y.
          vec3 worldUp = vec3(0.0, 1.0, 0.0);
          float sunOntoSurface = max(-dot(L, worldUp), 0.0);
          if (sunOntoSurface < 0.05) return vec3(0.0);

          vec3 d = worldPos - uSrCausticCenter;
          vec3 local = vec3(dot(d, ax), dot(d, ay), dot(d, az));
          float extUp =
            abs(dot(ax, worldUp)) * uSrCausticHalfExt.x +
            abs(dot(ay, worldUp)) * uSrCausticHalfExt.y +
            abs(dot(az, worldUp)) * uSrCausticHalfExt.z;
          float centerH = dot(uSrCausticCenter, worldUp);
          float fill = clamp(uSrCausticFill, 0.0, 1.0);
          float surfaceH = centerH - extUp + 2.0 * extUp * fill;
          float below = surfaceH - dot(worldPos, worldUp);
          if (below < -0.02) return vec3(0.0);

          vec2 halfXZ = vec2(max(uSrCausticHalfExt.x, 1e-3), max(uSrCausticHalfExt.z, 1e-3));
          vec2 uv = vec2(local.x, local.z) / halfXZ;
          float edgeX = 1.0 - smoothstep(0.92, 1.08, abs(uv.x));
          float edgeZ = 1.0 - smoothstep(0.92, 1.08, abs(uv.y));
          float fall = edgeX * edgeZ;
          if (fall < 1e-4) return vec3(0.0);

          // Snell footprint parallax: refracted sun direction projected onto ground plane.
          float eta = 1.0 / 1.333;
          vec3 Nsurf = worldUp;
          float cosi = clamp(-dot(L, Nsurf), 0.0, 1.0);
          float k = 1.0 - eta * eta * (1.0 - cosi * cosi);
          vec3 T = k < 0.0 ? L : normalize(eta * L + (eta * cosi - sqrt(max(k, 0.0))) * Nsurf);
          vec3 Tloc = vec3(dot(T, ax), dot(T, ay), dot(T, az));
          float depth = max(below, 0.02);
          float waveParallax = 0.04 + uSrCausticWaveAmp * 2.5;
          vec2 snellShift = vec2(Tloc.x, Tloc.z) * (depth * (0.08 + uSrCausticWaveSteep * 0.04));
          vec2 uvPat = uv + snellShift + waveParallax * vec2(L.x, L.z) / max(sunOntoSurface, 0.15);
          float pattern = srCausticPattern(uvPat, uSrCausticTime);

          float ndl = max(dot(normalize(N), -L), 0.0);
          if (ndl < 1e-4) return vec3(0.0);
          float depthAtt = exp(-0.1 * max(below, 0.0));
          float elev = pow(sunOntoSurface, 0.65);
          float snellFocus = 0.75 + 0.45 * pow(cosi, 1.5);
          return uSrCausticSunRgb
            * (uSrCausticStrength * pattern * fall * ndl * depthAtt * elev * snellFocus * 14.0);
        }

        vec3 srRadianceSpot(vec3 worldPos, vec3 N, vec3 V) {
          vec3 acc = vec3(0.0);
          float albedo = clamp(uSrAlbedo, 0.0, 1.0);
          float metal = clamp(uSrMetalness, 0.0, 1.0);
          float rough = clamp(uSrRoughness, 0.04, 1.0);
          float absorb = clamp(uSrAbsorption, 0.0, 1.0);
          
      if (uSrCount > 0.5) {
        vec3 o = uSrOrigin0;
        vec3 dBeam = uSrDir0;
        float mode = uSrMode0;
        float p0 = uSrP00;
        float p1 = uSrP10;
        float p2 = uSrP20;
        float p3 = uSrP30;
        float p4 = uSrP40;
        float p5 = uSrP50;
        vec3 spill = uSrSpill0;
        vec3 lightRgb = uSrColor0;
        float power = uSrPower0;

        // Optical irradiance (BeamModel: TEM00 / cone / tube / omni + spill)
        // Ă— Cookâ€“Torrance GGX (Fresnel VÂ·H, D, G). L = Point/Spot/Directional by mode.
        float Li = rfEvalRadianceField(worldPos, o, dBeam, mode, p0, p1, p2, p3, p4, p5, spill);
        vec3 L = srLightDir(worldPos, o, dBeam, mode);
        float nDotL = max(dot(N, L), 0.0);
        if (Li > 1e-12 && nDotL > 1e-5) {
          float E = power * Li * nDotL;
          vec3 H = normalize(L + V);
          float nDotH = max(dot(N, H), 0.0);
          float nDotV = max(dot(N, V), 0.0);
          float vDotH = max(dot(V, H), 0.0);
          vec2 lobes = mfEvaluate(nDotL, nDotV, nDotH, vDotH, albedo, metal, rough, absorb);
          // Diffuse (view-stable) + specular (view-dependent optical highlight)
          acc += lightRgb * E * lobes.x;
          acc += lightRgb * E * lobes.y;
        }
      }

      if (uSrCount > 1.5) {
        vec3 o = uSrOrigin1;
        vec3 dBeam = uSrDir1;
        float mode = uSrMode1;
        float p0 = uSrP01;
        float p1 = uSrP11;
        float p2 = uSrP21;
        float p3 = uSrP31;
        float p4 = uSrP41;
        float p5 = uSrP51;
        vec3 spill = uSrSpill1;
        vec3 lightRgb = uSrColor1;
        float power = uSrPower1;

        // Optical irradiance (BeamModel: TEM00 / cone / tube / omni + spill)
        // Ă— Cookâ€“Torrance GGX (Fresnel VÂ·H, D, G). L = Point/Spot/Directional by mode.
        float Li = rfEvalRadianceField(worldPos, o, dBeam, mode, p0, p1, p2, p3, p4, p5, spill);
        vec3 L = srLightDir(worldPos, o, dBeam, mode);
        float nDotL = max(dot(N, L), 0.0);
        if (Li > 1e-12 && nDotL > 1e-5) {
          float E = power * Li * nDotL;
          vec3 H = normalize(L + V);
          float nDotH = max(dot(N, H), 0.0);
          float nDotV = max(dot(N, V), 0.0);
          float vDotH = max(dot(V, H), 0.0);
          vec2 lobes = mfEvaluate(nDotL, nDotV, nDotH, vDotH, albedo, metal, rough, absorb);
          // Diffuse (view-stable) + specular (view-dependent optical highlight)
          acc += lightRgb * E * lobes.x;
          acc += lightRgb * E * lobes.y;
        }
      }

      if (uSrCount > 2.5) {
        vec3 o = uSrOrigin2;
        vec3 dBeam = uSrDir2;
        float mode = uSrMode2;
        float p0 = uSrP02;
        float p1 = uSrP12;
        float p2 = uSrP22;
        float p3 = uSrP32;
        float p4 = uSrP42;
        float p5 = uSrP52;
        vec3 spill = uSrSpill2;
        vec3 lightRgb = uSrColor2;
        float power = uSrPower2;

        // Optical irradiance (BeamModel: TEM00 / cone / tube / omni + spill)
        // Ă— Cookâ€“Torrance GGX (Fresnel VÂ·H, D, G). L = Point/Spot/Directional by mode.
        float Li = rfEvalRadianceField(worldPos, o, dBeam, mode, p0, p1, p2, p3, p4, p5, spill);
        vec3 L = srLightDir(worldPos, o, dBeam, mode);
        float nDotL = max(dot(N, L), 0.0);
        if (Li > 1e-12 && nDotL > 1e-5) {
          float E = power * Li * nDotL;
          vec3 H = normalize(L + V);
          float nDotH = max(dot(N, H), 0.0);
          float nDotV = max(dot(N, V), 0.0);
          float vDotH = max(dot(V, H), 0.0);
          vec2 lobes = mfEvaluate(nDotL, nDotV, nDotH, vDotH, albedo, metal, rough, absorb);
          // Diffuse (view-stable) + specular (view-dependent optical highlight)
          acc += lightRgb * E * lobes.x;
          acc += lightRgb * E * lobes.y;
        }
      }

      if (uSrCount > 3.5) {
        vec3 o = uSrOrigin3;
        vec3 dBeam = uSrDir3;
        float mode = uSrMode3;
        float p0 = uSrP03;
        float p1 = uSrP13;
        float p2 = uSrP23;
        float p3 = uSrP33;
        float p4 = uSrP43;
        float p5 = uSrP53;
        vec3 spill = uSrSpill3;
        vec3 lightRgb = uSrColor3;
        float power = uSrPower3;

        // Optical irradiance (BeamModel: TEM00 / cone / tube / omni + spill)
        // Ă— Cookâ€“Torrance GGX (Fresnel VÂ·H, D, G). L = Point/Spot/Directional by mode.
        float Li = rfEvalRadianceField(worldPos, o, dBeam, mode, p0, p1, p2, p3, p4, p5, spill);
        vec3 L = srLightDir(worldPos, o, dBeam, mode);
        float nDotL = max(dot(N, L), 0.0);
        if (Li > 1e-12 && nDotL > 1e-5) {
          float E = power * Li * nDotL;
          vec3 H = normalize(L + V);
          float nDotH = max(dot(N, H), 0.0);
          float nDotV = max(dot(N, V), 0.0);
          float vDotH = max(dot(V, H), 0.0);
          vec2 lobes = mfEvaluate(nDotL, nDotV, nDotH, vDotH, albedo, metal, rough, absorb);
          // Diffuse (view-stable) + specular (view-dependent optical highlight)
          acc += lightRgb * E * lobes.x;
          acc += lightRgb * E * lobes.y;
        }
      }
          acc += srProjectedCaustic(worldPos, N) * albedo;
          // Soft HDR ceiling only (∞ → ~1/k). Not a film curve — ACES/Reinhard/Hable
          // run once in volumetric compose on the full-frame linear composite.
          return acc / (vec3(1.0) + acc * 0.08);
        }
        #endif
