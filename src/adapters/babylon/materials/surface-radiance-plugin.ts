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
    { name: 'uSrCausticStrength', size: 1, type: 'float' },
    { name: 'uSrCausticFill', size: 1, type: 'float' },
    { name: 'uSrCausticTime', size: 1, type: 'float' },
    { name: 'uSrCausticSunDir', size: 3, type: 'vec3' },
    { name: 'uSrCausticSunRgb', size: 3, type: 'vec3' },
    { name: 'uSrCausticCenter', size: 3, type: 'vec3' },
    { name: 'uSrCausticHalfExt', size: 3, type: 'vec3' },
    { name: 'uSrCausticAxisX', size: 3, type: 'vec3' },
    { name: 'uSrCausticAxisY', size: 3, type: 'vec3' },
    { name: 'uSrCausticAxisZ', size: 3, type: 'vec3' },
    { name: 'uSrCausticWaveAmp', size: 1, type: 'float' },
    { name: 'uSrCausticWaveFreq', size: 1, type: 'float' },
    { name: 'uSrCausticWaveSteep', size: 1, type: 'float' },
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

export interface SurfaceRadianceCaustic {
  strength: number;
  fillHeight: number;
  timeS: number;
  sunDir: [number, number, number];
  sunRgb: [number, number, number];
  center: [number, number, number];
  halfExtents: [number, number, number];
  axisX: [number, number, number];
  axisY: [number, number, number];
  axisZ: [number, number, number];
  /** Free-surface wave params (same as water PP). */
  waveAmplitude: number;
  waveFrequency: number;
  waveSteepness: number;
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
 * Water projected caustics are an additive cookie along env sun.
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
  private _caustic: SurfaceRadianceCaustic = {
    strength: 0,
    fillHeight: 0.65,
    timeS: 0,
    sunDir: [0, -1, 0],
    sunRgb: [0, 0, 0],
    center: [0, 0, 0],
    halfExtents: [0, 0, 0],
    axisX: [1, 0, 0],
    axisY: [0, 1, 0],
    axisZ: [0, 0, 1],
    waveAmplitude: 0,
    waveFrequency: 1,
    waveSteepness: 0,
  };

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

  setCaustic(c: SurfaceRadianceCaustic): void {
    const wasOn = this._caustic.strength > 1e-5;
    const nowOn = c.strength > 1e-5;
    this._caustic = c;
    if (wasOn !== nowOn) this.markAllDefinesAsDirty();
  }

  override prepareDefines(defines: Record<string, unknown>): void {
    defines['SURFACE_RADIANCE'] =
      this._enabled && (this._count > 0 || this._caustic.strength > 1e-5);
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
    const c = this._caustic;
    uniformBuffer.updateFloat('uSrCausticStrength', c.strength);
    uniformBuffer.updateFloat('uSrCausticFill', c.fillHeight);
    uniformBuffer.updateFloat('uSrCausticTime', c.timeS);
    uniformBuffer.updateFloat3('uSrCausticSunDir', c.sunDir[0], c.sunDir[1], c.sunDir[2]);
    uniformBuffer.updateFloat3('uSrCausticSunRgb', c.sunRgb[0], c.sunRgb[1], c.sunRgb[2]);
    uniformBuffer.updateFloat3('uSrCausticCenter', c.center[0], c.center[1], c.center[2]);
    uniformBuffer.updateFloat3(
      'uSrCausticHalfExt',
      c.halfExtents[0],
      c.halfExtents[1],
      c.halfExtents[2],
    );
    uniformBuffer.updateFloat3('uSrCausticAxisX', c.axisX[0], c.axisX[1], c.axisX[2]);
    uniformBuffer.updateFloat3('uSrCausticAxisY', c.axisY[0], c.axisY[1], c.axisY[2]);
    uniformBuffer.updateFloat3('uSrCausticAxisZ', c.axisZ[0], c.axisZ[1], c.axisZ[2]);
    uniformBuffer.updateFloat('uSrCausticWaveAmp', c.waveAmplitude);
    uniformBuffer.updateFloat('uSrCausticWaveFreq', c.waveFrequency);
    uniformBuffer.updateFloat('uSrCausticWaveSteep', c.waveSteepness);

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
