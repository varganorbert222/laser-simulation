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
import { MAX_GPU_LIGHTS } from '@engine';
import {
  SURFACE_RADIANCE_BEFORE_FRAGCOLOR,
  SURFACE_RADIANCE_DEFINITIONS,
  SURFACE_RADIANCE_UNIFORMS,
} from '../../../generated/shaders';

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
      fragment: SURFACE_RADIANCE_UNIFORMS,
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
      CUSTOM_FRAGMENT_DEFINITIONS: SURFACE_RADIANCE_DEFINITIONS,
      CUSTOM_FRAGMENT_BEFORE_FRAGCOLOR: SURFACE_RADIANCE_BEFORE_FRAGCOLOR,
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
