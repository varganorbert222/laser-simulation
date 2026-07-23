        #ifdef SURFACE_RADIANCE
        {
          vec3 srN = normalize(normalW);
          vec3 srV = normalize(vEyePosition.xyz - vPositionW);
          color.rgb += srRadianceSpot(vPositionW, srN, srV);
        }
        #endif
      
