#ifdef SURFACE_RADIANCE
        // @include contract/radiance_field.glsl
        // @include contract/microfacet_brdf.glsl
        // @include contract/incident_light.glsl

        vec3 srRadianceSpot(vec3 worldPos, vec3 N, vec3 V) {
          vec3 acc = vec3(0.0);
          float albedo = clamp(uSrAlbedo, 0.0, 1.0);
          float metal = clamp(uSrMetalness, 0.0, 1.0);
          float rough = clamp(uSrRoughness, 0.04, 1.0);
          float absorb = clamp(uSrAbsorption, 0.0, 1.0);
          {{SURFACE_LIGHT_EVAL_LOOP}}
          // Soft HDR ceiling only (∞ → ~1/k). Not a film curve — ACES/Reinhard/Hable
          // run once in volumetric compose on the full-frame linear composite.
          return acc / (vec3(1.0) + acc * 0.08);
        }
        #endif
