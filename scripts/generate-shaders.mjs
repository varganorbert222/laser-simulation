/**
 * Build-time GLSL codegen (plan 1C + 2B).
 * Reads hand-authored shaders/src/*.glsl (+ *.tpl.glsl), expands slot unrolls from
 * slots.ts MAX_GPU_LIGHTS / MAX_GPU_MEDIA, writes src/generated/shaders/*.{glsl,ts}.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const srcDir = path.join(root, 'shaders', 'src');
const outDir = path.join(root, 'src', 'generated', 'shaders');

/** GLSL preprocessor requires LF; Windows CRLF can glue `#ifdef` to the next token. */
function normalizeNewlines(s) {
  return s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function readSlots() {
  const slotsPath = path.join(root, 'src/engine/render/contract/slots.ts');
  const text = fs.readFileSync(slotsPath, 'utf8');
  const lights = text.match(/export const MAX_GPU_LIGHTS\s*=\s*(\d+)/);
  const media = text.match(/export const MAX_GPU_MEDIA\s*=\s*(\d+)/);
  if (!lights || !media) throw new Error('Could not parse MAX_GPU_LIGHTS / MAX_GPU_MEDIA from slots.ts');
  return { lights: Number(lights[1]), media: Number(media[1]) };
}

function beamSlotUniformDecls(slots, prefix, { scatter = false } = {}) {
  const lines = [];
  for (let i = 0; i < slots; i++) {
    lines.push(
      `uniform vec3 ${prefix}Origin${i};`,
      `uniform vec3 ${prefix}Dir${i};`,
      `uniform vec3 ${prefix}Color${i};`,
      `uniform float ${prefix}Power${i};`,
    );
    if (scatter) lines.push(`uniform float ${prefix}Scatter${i};`);
    lines.push(
      `uniform float ${prefix}Mode${i};`,
      `uniform float ${prefix}P0${i};`,
      `uniform float ${prefix}P1${i};`,
      `uniform float ${prefix}P2${i};`,
      `uniform float ${prefix}P3${i};`,
      `uniform float ${prefix}P4${i};`,
      `uniform float ${prefix}P5${i};`,
      `uniform vec3 ${prefix}Spill${i};`,
    );
  }
  return lines.join('\n');
}

function mediaUniformDecls(slots) {
  const lines = [];
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

function mediaNoiseSampleFns(slots) {
  const lines = [];
  for (let i = 0; i < slots; i++) {
    lines.push(`float sampleMediaNoise${i}(vec3 p) {
  float kind = uMediaNoiseKind${i};
  if (kind > 2.5) return texture(uMediaNoise3D${i}, fract(p)).r;
  if (kind > 1.5) return texture(uMediaNoise2D${i}, fract(p.xy)).r;
  return 0.5;
}`);
  }
  return lines.join('\n');
}

function mediaSampleAccum(slots) {
  const pass1 = [];
  const pass2 = [];
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

function mediaIntersectUnion(slots) {
  const blocks = [];
  for (let i = 0; i < slots; i++) {
    blocks.push(`  if (uMediaCount > ${i}.5 && intersectBox(ro, rd, uMediaCenter${i}, uMediaHalfExt${i}, te, tx)) {
    anyHit = true; tEnter = min(tEnter, te); tExit = max(tExit, tx);
  }`);
  }
  return blocks.join('\n');
}

function mediaExtinctionFastAccum(slots) {
  const pass1 = [];
  const pass2 = [];
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

function lightEvalInMarch(slots) {
  const blocks = [];
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

function surfaceLightEvalLoop(slots) {
  const blocks = [];
  for (let i = 0; i < slots; i++) {
    blocks.push(`
      if (uSrCount > ${i}.5) {
        vec3 o = uSrOrigin${i};
        vec3 dBeam = uSrDir${i};
        float mode = uSrMode${i};
        float p0 = uSrP0${i};
        float p1 = uSrP1${i};
        float p2 = uSrP2${i};
        float p3 = uSrP3${i};
        float p4 = uSrP4${i};
        float p5 = uSrP5${i};
        vec3 spill = uSrSpill${i};
        vec3 lightRgb = uSrColor${i};
        float power = uSrPower${i};

        // Optical irradiance (BeamModel: TEM00 / cone / tube / omni + spill)
        // × Cook–Torrance GGX (Fresnel V·H, D, G). L = Point/Spot/Directional by mode.
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
      }`);
  }
  return blocks.join('\n');
}

function surfaceLightUniforms(slots) {
  return [
    'uniform float uSrCount;',
    'uniform float uSrAlbedo;',
    'uniform float uSrMetalness;',
    'uniform float uSrRoughness;',
    'uniform float uSrAbsorption;',
    beamSlotUniformDecls(slots, 'uSr'),
  ].join('\n');
}

/** Resolve // @include path.glsl relative to shaders/src (or same-dir for contract). */
function resolveIncludes(source, fromFile) {
  const includeRe = /^[ \t]*\/\/[ \t]*@include[ \t]+(\S+)[ \t]*$/gm;
  let out = normalizeNewlines(source);
  let guard = 0;
  while (guard++ < 32) {
    let matched = false;
    out = out.replace(includeRe, (_full, rel) => {
      matched = true;
      const baseDir = path.dirname(fromFile);
      let abs = path.join(baseDir, rel);
      if (!fs.existsSync(abs)) {
        abs = path.join(srcDir, rel);
      }
      if (!fs.existsSync(abs)) {
        abs = path.join(srcDir, rel.replace(/^\.\//, ''));
      }
      if (!fs.existsSync(abs)) throw new Error(`include not found: ${rel} (from ${fromFile})`);
      const body = normalizeNewlines(fs.readFileSync(abs, 'utf8'));
      return resolveIncludes(body, abs).replace(/^\n+/, '').replace(/\n+$/, '');
    });
    if (!matched) break;
  }
  return out;
}

function applyMarkers(tpl, map) {
  let out = tpl;
  for (const [key, value] of Object.entries(map)) {
    const token = `{{${key}}}`;
    if (!out.includes(token)) {
      // optional markers ok
      continue;
    }
    out = out.split(token).join(value);
  }
  const leftover = out.match(/\{\{[A-Z0-9_]+\}\}/g);
  if (leftover) throw new Error(`unresolved markers: ${leftover.join(', ')}`);
  return out;
}

function writeOut(baseName, glsl, exportName) {
  glsl = normalizeNewlines(glsl);
  if (glsl.includes('`') || /\bexport const\b/.test(glsl)) {
    throw new Error(
      `${baseName}: generated GLSL still contains TypeScript leakage (backtick or export const)`,
    );
  }
  if (/#ifdef[^\n]*\r|^\r/m.test(glsl) || glsl.includes('\r')) {
    throw new Error(`${baseName}: generated GLSL still contains CR (\\r) line endings`);
  }
  fs.mkdirSync(outDir, { recursive: true });
  const glslPath = path.join(outDir, `${baseName}.glsl`);
  const tsPath = path.join(outDir, `${baseName}.ts`);
  fs.writeFileSync(glslPath, glsl.endsWith('\n') ? glsl : glsl + '\n', 'utf8');
  // JSON string avoids template-literal edge cases (backticks / ${} in GLSL comments).
  const ts = `/** Auto-generated by scripts/generate-shaders.mjs — do not edit. */\nexport const ${exportName} = ${JSON.stringify(glsl)};\n`;
  fs.writeFileSync(tsPath, ts, 'utf8');
  console.log(`  ${baseName}.glsl/.ts (${glsl.length} chars)`);
}

function readSrc(rel) {
  return normalizeNewlines(fs.readFileSync(path.join(srcDir, rel), 'utf8'));
}

function main() {
  const { lights, media } = readSlots();
  console.log(`generate-shaders: MAX_GPU_LIGHTS=${lights} MAX_GPU_MEDIA=${media}`);

  // --- Contract modules (resolved includes) ---
  const residual = resolveIncludes(readSrc('contract/residual_field.glsl'), path.join(srcDir, 'contract/residual_field.glsl'));
  const incident = resolveIncludes(readSrc('contract/incident_light.glsl'), path.join(srcDir, 'contract/incident_light.glsl'));
  const microfacet = resolveIncludes(readSrc('contract/microfacet_brdf.glsl'), path.join(srcDir, 'contract/microfacet_brdf.glsl'));
  const radiance = resolveIncludes(readSrc('contract/radiance_field.glsl'), path.join(srcDir, 'contract/radiance_field.glsl'));
  writeOut('residual_field', residual, 'RESIDUAL_FIELD_GLSL');
  writeOut('incident_light', incident, 'INCIDENT_LIGHT_GLSL');
  writeOut('microfacet_brdf', microfacet, 'MICROFACET_BRDF_GLSL');
  writeOut('radiance_field', radiance, 'RADIANCE_FIELD_GLSL');

  // --- Volumetric raymarch ---
  const rayTplPath = path.join(srcDir, 'volumetric/raymarch.tpl.glsl');
  let rayTpl = normalizeNewlines(fs.readFileSync(rayTplPath, 'utf8'));
  rayTpl = applyMarkers(rayTpl, {
    LIGHT_UNIFORMS: beamSlotUniformDecls(lights, 'uLight', { scatter: true }),
    MEDIA_UNIFORMS: mediaUniformDecls(media),
    MEDIA_NOISE_FNS: mediaNoiseSampleFns(media),
    MEDIA_EXTINCTION: mediaExtinctionFastAccum(media),
    MEDIA_SAMPLE_ACCUM: mediaSampleAccum(media),
    MEDIA_INTERSECT: mediaIntersectUnion(media),
    LIGHT_EVAL_MARCH: lightEvalInMarch(lights),
  });
  const raymarch = resolveIncludes(rayTpl, rayTplPath);
  writeOut('volumetric_raymarch', raymarch, 'VOLUMETRIC_FRAGMENT');

  const compose = resolveIncludes(readSrc('volumetric/compose.glsl'), path.join(srcDir, 'volumetric/compose.glsl'));
  writeOut('volumetric_compose', compose, 'VOLUMETRIC_COMPOSE_FRAGMENT');

  // --- Surface plugin ---
  const surfDefsPath = path.join(srcDir, 'surface/radiance_plugin_definitions.tpl.glsl');
  let surfDefs = normalizeNewlines(fs.readFileSync(surfDefsPath, 'utf8'));
  surfDefs = applyMarkers(surfDefs, {
    SURFACE_LIGHT_EVAL_LOOP: surfaceLightEvalLoop(lights),
  });
  surfDefs = resolveIncludes(surfDefs, surfDefsPath);
  writeOut('surface_radiance_definitions', surfDefs, 'SURFACE_RADIANCE_DEFINITIONS');

  const surfBefore = resolveIncludes(
    readSrc('surface/radiance_plugin_before_fragcolor.glsl'),
    path.join(srcDir, 'surface/radiance_plugin_before_fragcolor.glsl'),
  );
  writeOut('surface_radiance_before_fragcolor', surfBefore, 'SURFACE_RADIANCE_BEFORE_FRAGCOLOR');

  const surfUniforms = surfaceLightUniforms(lights);
  writeOut('surface_radiance_uniforms', surfUniforms, 'SURFACE_RADIANCE_UNIFORMS');

  // --- Noise preview ---
  const noiseVert = resolveIncludes(readSrc('noise/preview.vert.glsl'), path.join(srcDir, 'noise/preview.vert.glsl'));
  const noiseFrag = resolveIncludes(readSrc('noise/preview.frag.glsl'), path.join(srcDir, 'noise/preview.frag.glsl'));
  writeOut('noise_preview_vert', noiseVert, 'NOISE_PREVIEW_VERT');
  writeOut('noise_preview_frag', noiseFrag, 'NOISE_PREVIEW_FRAG');

  // --- Atmosphere LUTs + skybox ---
  const atmoTrans = resolveIncludes(
    readSrc('atmosphere/transmittance.frag.glsl'),
    path.join(srcDir, 'atmosphere/transmittance.frag.glsl'),
  );
  writeOut('atmosphere_transmittance', atmoTrans, 'ATMOSPHERE_TRANSMITTANCE_FRAGMENT');

  const atmoSkyView = resolveIncludes(
    readSrc('atmosphere/sky_view.frag.glsl'),
    path.join(srcDir, 'atmosphere/sky_view.frag.glsl'),
  );
  writeOut('atmosphere_sky_view', atmoSkyView, 'ATMOSPHERE_SKY_VIEW_FRAGMENT');

  const atmoAerial = resolveIncludes(
    readSrc('atmosphere/aerial_perspective.frag.glsl'),
    path.join(srcDir, 'atmosphere/aerial_perspective.frag.glsl'),
  );
  writeOut('atmosphere_aerial_perspective', atmoAerial, 'ATMOSPHERE_AERIAL_PERSPECTIVE_FRAGMENT');

  const atmoSkyVert = resolveIncludes(
    readSrc('atmosphere/skybox.vert.glsl'),
    path.join(srcDir, 'atmosphere/skybox.vert.glsl'),
  );
  const atmoSkyFrag = resolveIncludes(
    readSrc('atmosphere/skybox.frag.glsl'),
    path.join(srcDir, 'atmosphere/skybox.frag.glsl'),
  );
  writeOut('atmosphere_skybox_vert', atmoSkyVert, 'ATMOSPHERE_SKYBOX_VERT');
  writeOut('atmosphere_skybox_frag', atmoSkyFrag, 'ATMOSPHERE_SKYBOX_FRAG');

  // Env cubemap capture (mesh vert + same sky frag as skybox)
  const atmoEnvVert = resolveIncludes(
    readSrc('atmosphere/env_capture.vert.glsl'),
    path.join(srcDir, 'atmosphere/env_capture.vert.glsl'),
  );
  writeOut('atmosphere_env_capture_vert', atmoEnvVert, 'ATMOSPHERE_ENV_CAPTURE_VERT');

  // Index barrel for convenience
  const indexTs = `/** Auto-generated by scripts/generate-shaders.mjs — do not edit. */
export { RADIANCE_FIELD_GLSL } from './radiance_field';
export { RESIDUAL_FIELD_GLSL } from './residual_field';
export { INCIDENT_LIGHT_GLSL } from './incident_light';
export { MICROFACET_BRDF_GLSL } from './microfacet_brdf';
export { VOLUMETRIC_FRAGMENT } from './volumetric_raymarch';
export { VOLUMETRIC_COMPOSE_FRAGMENT } from './volumetric_compose';
export { SURFACE_RADIANCE_DEFINITIONS } from './surface_radiance_definitions';
export { SURFACE_RADIANCE_BEFORE_FRAGCOLOR } from './surface_radiance_before_fragcolor';
export { SURFACE_RADIANCE_UNIFORMS } from './surface_radiance_uniforms';
export { NOISE_PREVIEW_VERT } from './noise_preview_vert';
export { NOISE_PREVIEW_FRAG } from './noise_preview_frag';
export { ATMOSPHERE_TRANSMITTANCE_FRAGMENT } from './atmosphere_transmittance';
export { ATMOSPHERE_SKY_VIEW_FRAGMENT } from './atmosphere_sky_view';
export { ATMOSPHERE_AERIAL_PERSPECTIVE_FRAGMENT } from './atmosphere_aerial_perspective';
export { ATMOSPHERE_SKYBOX_VERT } from './atmosphere_skybox_vert';
export { ATMOSPHERE_SKYBOX_FRAG } from './atmosphere_skybox_frag';
export { ATMOSPHERE_ENV_CAPTURE_VERT } from './atmosphere_env_capture_vert';
`;
  fs.writeFileSync(path.join(outDir, 'index.ts'), indexTs, 'utf8');
  console.log('done →', path.relative(root, outDir));
}

main();
