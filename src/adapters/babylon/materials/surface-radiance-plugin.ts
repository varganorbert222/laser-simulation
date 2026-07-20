import {
  MaterialPluginBase,
  ShaderLanguage,
  StandardMaterial,
  type AbstractEngine,
  type Material,
  type Scene,
  type SubMesh,
  type UniformBuffer,
} from '@babylonjs/core';
import '@babylonjs/core/Materials/materialPluginManager.js';
import { radianceFieldGlslFunctions } from '../../../engine/optics/beam-model';
import { incidentLightDirGlsl } from '../../../engine/optics/light-incident';
import { microfacetBrdfGlslFunctions } from '../../../engine/optics/microfacet-brdf';
import { MAX_GPU_LIGHTS } from '../../../engine';

/** Packed BeamModel light for surface radiance (matches GpuLight slot layout). */
export interface SurfaceRadianceGpuLight {
  origin: [number, number, number];
  direction: [number, number, number];
  color: [number, number, number];
  power: number;
  mode: number;
  p0: number;
  p1: number;
  p2: number;
  p3: number;
  p4: number;
  p5: number;
  spill: [number, number, number];
}

function lightUniformDecls(slots: number): string {
  const lines: string[] = [
    'uniform float uSrCount;',
    'uniform float uSrAlbedo;',
    'uniform float uSrMetalness;',
    'uniform float uSrRoughness;',
    'uniform float uSrAbsorption;',
  ];
  for (let i = 0; i < slots; i++) {
    lines.push(
      `uniform vec3 uSrOrigin${i};`,
      `uniform vec3 uSrDir${i};`,
      `uniform vec3 uSrColor${i};`,
      `uniform float uSrPower${i};`,
      `uniform float uSrMode${i};`,
      `uniform float uSrP0${i};`,
      `uniform float uSrP1${i};`,
      `uniform float uSrP2${i};`,
      `uniform float uSrP3${i};`,
      `uniform float uSrP4${i};`,
      `uniform float uSrP5${i};`,
      `uniform vec3 uSrSpill${i};`,
    );
  }
  return lines.join('\n');
}

function lightEvalLoop(slots: number): string {
  const blocks: string[] = [];
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

function uboEntries(slots: number): Array<{ name: string; size: number; type: string }> {
  const entries: Array<{ name: string; size: number; type: string }> = [
    { name: 'uSrCount', size: 1, type: 'float' },
    { name: 'uSrAlbedo', size: 1, type: 'float' },
    { name: 'uSrMetalness', size: 1, type: 'float' },
    { name: 'uSrRoughness', size: 1, type: 'float' },
    { name: 'uSrAbsorption', size: 1, type: 'float' },
  ];
  for (let i = 0; i < slots; i++) {
    entries.push(
      { name: `uSrOrigin${i}`, size: 3, type: 'vec3' },
      { name: `uSrDir${i}`, size: 3, type: 'vec3' },
      { name: `uSrColor${i}`, size: 3, type: 'vec3' },
      { name: `uSrPower${i}`, size: 1, type: 'float' },
      { name: `uSrMode${i}`, size: 1, type: 'float' },
      { name: `uSrP0${i}`, size: 1, type: 'float' },
      { name: `uSrP1${i}`, size: 1, type: 'float' },
      { name: `uSrP2${i}`, size: 1, type: 'float' },
      { name: `uSrP3${i}`, size: 1, type: 'float' },
      { name: `uSrP4${i}`, size: 1, type: 'float' },
      { name: `uSrP5${i}`, size: 1, type: 'float' },
      { name: `uSrSpill${i}`, size: 3, type: 'vec3' },
    );
  }
  return entries;
}

/**
 * StandardMaterial plugin: optical surface BRDF for LightEmitters.
 *
 * Not a Babylon Spot/Point specular path. Fragment adds:
 *   BeamModel irradiance (Gaussian propagation, cone, tube, omni + spill)
 *   × Cook–Torrance GGX (Schlick F(V·H), GGX D, Smith G)
 *   with Unity-like L (Point / Spot / Directional by beam mode).
 *
 * Env fill still comes from StandardMaterial hemi/sun.
 */
export class SurfaceRadiancePlugin extends MaterialPluginBase {
  static readonly PLUGIN_NAME = 'SurfaceRadiancePlugin';

  private _enabled = true;
  private _count = 0;
  private readonly _lights: SurfaceRadianceGpuLight[] = [];
  private _albedo = 0.5;
  private _metalness = 0.2;
  private _roughness = 0.45;
  private _absorption = 0.4;

  constructor(material: Material) {
    super(material, SurfaceRadiancePlugin.PLUGIN_NAME, 200, { SURFACE_RADIANCE: false });
    this._enable(true);
  }

  override getClassName(): string {
    return SurfaceRadiancePlugin.PLUGIN_NAME;
  }

  override isCompatible(shaderLanguage: ShaderLanguage): boolean {
    return shaderLanguage === ShaderLanguage.GLSL;
  }

  setMaterialOptics(
    albedoOrReflectivity: number,
    absorption: number,
    roughnessOrShininess = 0.45,
    metalness = 0,
    _specularWeight?: number,
  ): void {
    // New API: setMaterialPbr(albedo, metal, rough, absorb)
    // Legacy: (reflectivity, absorption, shininess, diffuseW, specularW)
    if (_specularWeight !== undefined) {
      // Legacy call from surface-lights before migration completes
      const shin = roughnessOrShininess;
      this._albedo = Math.max(albedoOrReflectivity, metalness);
      this._metalness = Math.min(1, Math.max(0, _specularWeight > 0.2 ? 0.7 : metalness));
      this._roughness = Math.max(0.04, 1 - (Math.min(64, shin) - 8) / 56);
      this._absorption = absorption;
      return;
    }
    this._albedo = albedoOrReflectivity;
    this._absorption = absorption;
    this._roughness = roughnessOrShininess;
    this._metalness = metalness;
  }

  setMaterialPbr(albedo: number, metalness: number, roughness: number, absorption: number): void {
    this._albedo = albedo;
    this._metalness = metalness;
    this._roughness = roughness;
    this._absorption = absorption;
  }

  setLights(lights: readonly SurfaceRadianceGpuLight[]): void {
    const n = Math.min(lights.length, MAX_GPU_LIGHTS);
    const countChanged = n !== this._count;
    this._lights.length = 0;
    for (let i = 0; i < n; i++) this._lights.push(lights[i]!);
    this._count = n;
    // Avoid rebuilding the shader every frame — only when light count changes.
    if (countChanged) this.markAllDefinesAsDirty();
  }

  override prepareDefines(defines: Record<string, unknown>): void {
    defines['SURFACE_RADIANCE'] = this._enabled && this._count > 0;
  }

  override getUniforms(): {
    ubo?: Array<{ name: string; size: number; type: string }>;
    fragment?: string;
  } {
    return {
      ubo: uboEntries(MAX_GPU_LIGHTS),
      fragment: lightUniformDecls(MAX_GPU_LIGHTS),
    };
  }

  override bindForSubMesh(
    uniformBuffer: UniformBuffer,
    _scene: Scene,
    _engine: AbstractEngine,
    _subMesh: SubMesh,
  ): void {
    if (!this._enabled) return;
    uniformBuffer.updateFloat('uSrCount', this._count);
    uniformBuffer.updateFloat('uSrAlbedo', this._albedo);
    uniformBuffer.updateFloat('uSrMetalness', this._metalness);
    uniformBuffer.updateFloat('uSrRoughness', this._roughness);
    uniformBuffer.updateFloat('uSrAbsorption', this._absorption);

    for (let i = 0; i < MAX_GPU_LIGHTS; i++) {
      const L = this._lights[i];
      if (L) {
        uniformBuffer.updateFloat3(`uSrOrigin${i}`, L.origin[0], L.origin[1], L.origin[2]);
        uniformBuffer.updateFloat3(`uSrDir${i}`, L.direction[0], L.direction[1], L.direction[2]);
        uniformBuffer.updateFloat3(`uSrColor${i}`, L.color[0], L.color[1], L.color[2]);
        uniformBuffer.updateFloat(`uSrPower${i}`, L.power);
        uniformBuffer.updateFloat(`uSrMode${i}`, L.mode);
        uniformBuffer.updateFloat(`uSrP0${i}`, L.p0);
        uniformBuffer.updateFloat(`uSrP1${i}`, L.p1);
        uniformBuffer.updateFloat(`uSrP2${i}`, L.p2);
        uniformBuffer.updateFloat(`uSrP3${i}`, L.p3);
        uniformBuffer.updateFloat(`uSrP4${i}`, L.p4);
        uniformBuffer.updateFloat(`uSrP5${i}`, L.p5);
        uniformBuffer.updateFloat3(`uSrSpill${i}`, L.spill[0], L.spill[1], L.spill[2]);
      } else {
        uniformBuffer.updateFloat3(`uSrOrigin${i}`, 0, 0, 0);
        uniformBuffer.updateFloat3(`uSrDir${i}`, 0, 0, 1);
        uniformBuffer.updateFloat3(`uSrColor${i}`, 0, 0, 0);
        uniformBuffer.updateFloat(`uSrPower${i}`, 0);
        uniformBuffer.updateFloat(`uSrMode${i}`, 0);
        uniformBuffer.updateFloat(`uSrP0${i}`, 0.01);
        uniformBuffer.updateFloat(`uSrP1${i}`, 1);
        uniformBuffer.updateFloat(`uSrP2${i}`, 0);
        uniformBuffer.updateFloat(`uSrP3${i}`, 1);
        uniformBuffer.updateFloat(`uSrP4${i}`, 0);
        uniformBuffer.updateFloat(`uSrP5${i}`, 0);
        uniformBuffer.updateFloat3(`uSrSpill${i}`, 0, 0, 0);
      }
    }
  }

  override getCustomCode(shaderType: string): { [pointName: string]: string } | null {
    if (shaderType !== 'fragment') return null;
    return {
      CUSTOM_FRAGMENT_DEFINITIONS: `
        #ifdef SURFACE_RADIANCE
        ${radianceFieldGlslFunctions()}
        ${microfacetBrdfGlslFunctions()}
        ${incidentLightDirGlsl()}

        vec3 srRadianceSpot(vec3 worldPos, vec3 N, vec3 V) {
          vec3 acc = vec3(0.0);
          float albedo = clamp(uSrAlbedo, 0.0, 1.0);
          float metal = clamp(uSrMetalness, 0.0, 1.0);
          float rough = clamp(uSrRoughness, 0.04, 1.0);
          float absorb = clamp(uSrAbsorption, 0.0, 1.0);
          ${lightEvalLoop(MAX_GPU_LIGHTS)}
          // Soft display compress so GGX peaks stay visible without hard clip.
          // Mild knee — keep power decades distinguishable after Weber–Fechner.
          return acc / (vec3(1.0) + acc * 0.18);
        }
        #endif
      `,
      CUSTOM_FRAGMENT_BEFORE_FRAGCOLOR: `
        #ifdef SURFACE_RADIANCE
        {
          vec3 srN = normalize(normalW);
          vec3 srV = normalize(vEyePosition.xyz - vPositionW);
          color.rgb += srRadianceSpot(vPositionW, srN, srV);
        }
        #endif
      `,
    };
  }
}

const PLUGIN_BY_MATERIAL = new WeakMap<Material, SurfaceRadiancePlugin>();

export function getOrCreateSurfaceRadiancePlugin(
  material: Material,
): SurfaceRadiancePlugin | null {
  if (!(material instanceof StandardMaterial)) return null;
  const existing = PLUGIN_BY_MATERIAL.get(material);
  if (existing) return existing;
  const plugin = new SurfaceRadiancePlugin(material);
  PLUGIN_BY_MATERIAL.set(material, plugin);
  return plugin;
}
