#ifdef SURFACE_RADIANCE
        // @include contract/radiance_field.glsl
        // @include contract/microfacet_brdf.glsl
        // @include contract/incident_light.glsl

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
          {{SURFACE_LIGHT_EVAL_LOOP}}
          acc += srProjectedCaustic(worldPos, N) * albedo;
          // Soft HDR ceiling only (∞ → ~1/k). Not a film curve — ACES/Reinhard/Hable
          // run once in volumetric compose on the full-frame linear composite.
          return acc / (vec3(1.0) + acc * 0.08);
        }
        #endif
