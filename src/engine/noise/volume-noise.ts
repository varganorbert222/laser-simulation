/**
 * Offline multi-layer tileable noise bake (2D or 3D) for volumetric media sampling.
 * Lattice wraps so GPU wrap REPEAT is seamless on every axis used.
 */

import { clamp01, clampRange } from '../math/clamp';
import { hermite01 } from '../math/smoothstep';

export type NoiseBlendMode = 'add' | 'sub' | 'mul' | 'max' | 'min';
export type NoiseDimension = '2d' | '3d';

export interface NoiseLayer {
  id: string;
  enabled: boolean;
  name: string;
  seed: number;
  /** Integer cell cycles across the domain (required for seamless tiling). */
  frequency: number;
  octaves: number;
  lacunarity: number;
  persistence: number;
  amplitude: number;
  blend: NoiseBlendMode;
}

export interface NoiseVolumeRecipe {
  dimension: NoiseDimension;
  resolution: number;
  layers: NoiseLayer[];
  /** Remap combined field into [0,1] via min/max of the volume. */
  normalize: boolean;
  /** Power curve after normalize (1 = linear). */
  contrast: number;
}

export interface BakedNoiseVolume {
  dimension: NoiseDimension;
  resolution: number;
  width: number;
  height: number;
  /** 1 for 2D, resolution for 3D. */
  depth: number;
  /** R8 voxels, length = width×height×depth, row-major X then Y then Z. */
  data: Uint8Array;
  recipe: NoiseVolumeRecipe;
}

export const NOISE_VOLUME_RESOLUTIONS = [32, 64, 128] as const;
export type NoiseVolumeResolution = (typeof NOISE_VOLUME_RESOLUTIONS)[number];

export function createNoiseLayerId(): string {
  return `layer-${Math.random().toString(36).slice(2, 10)}`;
}

export function createNoiseAssetId(): string {
  return `noise-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createDefaultNoiseLayer(
  partial?: Partial<NoiseLayer> & Pick<NoiseLayer, 'name'>,
): NoiseLayer {
  return {
    id: partial?.id ?? createNoiseLayerId(),
    enabled: partial?.enabled ?? true,
    name: partial?.name ?? 'Layer',
    seed: partial?.seed ?? 1,
    frequency: partial?.frequency ?? 4,
    octaves: partial?.octaves ?? 2,
    lacunarity: partial?.lacunarity ?? 2,
    persistence: partial?.persistence ?? 0.5,
    amplitude: partial?.amplitude ?? 1,
    blend: partial?.blend ?? 'add',
  };
}

/** Default multi-octave stack roughly matching the old 2-octave shader FBM. */
export function createDefaultNoiseRecipe(
  resolution: NoiseVolumeResolution = 64,
  dimension: NoiseDimension = '3d',
): NoiseVolumeRecipe {
  return {
    dimension,
    resolution,
    normalize: true,
    contrast: 1,
    layers: [
      createDefaultNoiseLayer({
        name: 'Base',
        seed: 11,
        frequency: 3,
        octaves: 2,
        amplitude: 1,
        blend: 'add',
      }),
      createDefaultNoiseLayer({
        name: 'Detail',
        seed: 29,
        frequency: 7,
        octaves: 2,
        amplitude: 0.45,
        persistence: 0.45,
        blend: 'add',
      }),
      createDefaultNoiseLayer({
        name: 'Carve',
        seed: 47,
        frequency: 5,
        octaves: 1,
        amplitude: 0.35,
        blend: 'sub',
      }),
    ],
  };
}

export function normalizeNoiseRecipe(raw: unknown): NoiseVolumeRecipe {
  const d = createDefaultNoiseRecipe();
  if (!raw || typeof raw !== 'object') return d;
  const r = raw as Partial<NoiseVolumeRecipe> & { layers?: unknown };
  const dimension: NoiseDimension = r.dimension === '2d' ? '2d' : '3d';
  const resolution = clampResolution(
    typeof r.resolution === 'number' ? r.resolution : d.resolution,
  );
  const layersIn = Array.isArray(r.layers) ? r.layers : d.layers;
  const layers = layersIn.map((layer, i) => normalizeLayer(layer, i));
  return {
    dimension,
    resolution,
    normalize: typeof r.normalize === 'boolean' ? r.normalize : d.normalize,
    contrast: typeof r.contrast === 'number' && Number.isFinite(r.contrast) ? r.contrast : d.contrast,
    layers: layers.length > 0 ? layers : d.layers,
  };
}

function normalizeLayer(raw: unknown, index: number): NoiseLayer {
  const fallback = createDefaultNoiseLayer({ name: `Layer ${index + 1}` });
  if (!raw || typeof raw !== 'object') return fallback;
  const r = raw as Partial<NoiseLayer>;
  const blend = r.blend;
  return {
    id: typeof r.id === 'string' && r.id ? r.id : createNoiseLayerId(),
    enabled: typeof r.enabled === 'boolean' ? r.enabled : true,
    name: typeof r.name === 'string' && r.name.trim() ? r.name.trim() : fallback.name,
    seed: num(r.seed, fallback.seed),
    frequency: Math.max(1, Math.round(num(r.frequency, fallback.frequency))),
    octaves: Math.round(clampRange(num(r.octaves, fallback.octaves), 1, 6)),
    lacunarity: Math.max(1.1, num(r.lacunarity, fallback.lacunarity)),
    persistence: clampRange(num(r.persistence, fallback.persistence), 0.05, 1),
    amplitude: num(r.amplitude, fallback.amplitude),
    blend:
      blend === 'add' || blend === 'sub' || blend === 'mul' || blend === 'max' || blend === 'min'
        ? blend
        : 'add',
  };
}

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

export function clampResolution(v: number): NoiseVolumeResolution {
  if (v <= 32) return 32;
  if (v <= 64) return 64;
  return 128;
}

/** Hash → [0,1), deterministic, seed-aware. */
function hash3(ix: number, iy: number, iz: number, seed: number): number {
  let n =
    Math.imul(ix | 0, 374761393) ^
    Math.imul(iy | 0, 668265263) ^
    Math.imul(iz | 0, 2146138331);
  n = Math.imul(n ^ (seed | 0), 0x27d4eb2d);
  n = (n ^ (n >>> 15)) >>> 0;
  return n / 4294967295;
}

/**
 * Tileable value noise. `period` = integer cells across the unit domain.
 * For 2D, pass pz=0 and periodZ=1 (constant in Z).
 */
function valueNoiseTileable(
  px: number,
  py: number,
  pz: number,
  periodX: number,
  periodY: number,
  periodZ: number,
  seed: number,
): number {
  const perX = Math.max(1, periodX | 0);
  const perY = Math.max(1, periodY | 0);
  const perZ = Math.max(1, periodZ | 0);
  const x = px * perX;
  const y = py * perY;
  const z = pz * perZ;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const z0 = Math.floor(z);
  const fx = hermite01(x - x0);
  const fy = hermite01(y - y0);
  const fz = hermite01(z - z0);

  const wrap = (i: number, per: number) => ((i % per) + per) % per;
  const n000 = hash3(wrap(x0, perX), wrap(y0, perY), wrap(z0, perZ), seed);
  const n100 = hash3(wrap(x0 + 1, perX), wrap(y0, perY), wrap(z0, perZ), seed);
  const n010 = hash3(wrap(x0, perX), wrap(y0 + 1, perY), wrap(z0, perZ), seed);
  const n110 = hash3(wrap(x0 + 1, perX), wrap(y0 + 1, perY), wrap(z0, perZ), seed);
  const n001 = hash3(wrap(x0, perX), wrap(y0, perY), wrap(z0 + 1, perZ), seed);
  const n101 = hash3(wrap(x0 + 1, perX), wrap(y0, perY), wrap(z0 + 1, perZ), seed);
  const n011 = hash3(wrap(x0, perX), wrap(y0 + 1, perY), wrap(z0 + 1, perZ), seed);
  const n111 = hash3(wrap(x0 + 1, perX), wrap(y0 + 1, perY), wrap(z0 + 1, perZ), seed);

  const nx00 = n000 + (n100 - n000) * fx;
  const nx10 = n010 + (n110 - n010) * fx;
  const nx01 = n001 + (n101 - n001) * fx;
  const nx11 = n011 + (n111 - n011) * fx;
  const nxy0 = nx00 + (nx10 - nx00) * fy;
  const nxy1 = nx01 + (nx11 - nx01) * fy;
  return nxy0 + (nxy1 - nxy0) * fz;
}

function fbmTileable(
  px: number,
  py: number,
  pz: number,
  layer: NoiseLayer,
  dimension: NoiseDimension,
): number {
  let freq = Math.max(1, layer.frequency | 0);
  let amp = 1;
  let sum = 0;
  let norm = 0;
  const octaves = Math.round(clampRange(layer.octaves, 1, 6));
  for (let o = 0; o < octaves; o++) {
    const pzPeriod = dimension === '2d' ? 1 : freq;
    const z = dimension === '2d' ? 0 : pz;
    sum +=
      amp *
      valueNoiseTileable(px, py, z, freq, freq, pzPeriod, layer.seed + o * 1013);
    norm += amp;
    // Keep integer periods so every octave stays seamlessly tileable.
    freq = Math.max(1, Math.round(freq * layer.lacunarity));
    amp *= layer.persistence;
  }
  return norm > 1e-8 ? sum / norm : 0;
}

function blendLayers(current: number, sample: number, layer: NoiseLayer): number {
  const v = sample * layer.amplitude;
  switch (layer.blend) {
    case 'sub':
      return current - v;
    case 'mul':
      return current * (1 + (v - 0.5) * 2 * Math.min(Math.abs(layer.amplitude), 1));
    case 'max':
      return Math.max(current, v);
    case 'min':
      return Math.min(current, v);
    case 'add':
    default:
      return current + v;
  }
}

/** Sample combined float field at unit UVW (before normalize / contrast). */
export function sampleNoiseRecipe(
  recipe: NoiseVolumeRecipe,
  u: number,
  v: number,
  w = 0,
): number {
  let field = 0;
  let any = false;
  for (const layer of recipe.layers) {
    if (!layer.enabled) continue;
    const s = fbmTileable(u, v, w, layer, recipe.dimension);
    field = any ? blendLayers(field, s, layer) : s * layer.amplitude;
    any = true;
  }
  return any ? field : 0;
}

/**
 * Bake recipe → R8 texture.
 * 2D: resolution² (depth=1). 3D: resolution³. Both seamless on their axes.
 */
export function bakeNoiseVolume(recipeInput: NoiseVolumeRecipe): BakedNoiseVolume {
  const recipe = normalizeNoiseRecipe(recipeInput);
  const res = clampResolution(recipe.resolution);
  const width = res;
  const height = res;
  const depth = recipe.dimension === '2d' ? 1 : res;
  const count = width * height * depth;
  const floats = new Float32Array(count);

  let minV = Infinity;
  let maxV = -Infinity;
  let i = 0;
  for (let z = 0; z < depth; z++) {
    const w = depth <= 1 ? 0 : z / depth;
    for (let y = 0; y < height; y++) {
      const v = y / height;
      for (let x = 0; x < width; x++) {
        const u = x / width;
        const f = sampleNoiseRecipe(recipe, u, v, w);
        floats[i++] = f;
        if (f < minV) minV = f;
        if (f > maxV) maxV = f;
      }
    }
  }

  const data = new Uint8Array(count);
  const span = Math.max(maxV - minV, 1e-6);
  const contrast = Math.max(recipe.contrast, 0.01);
  for (let j = 0; j < count; j++) {
    let t = floats[j]!;
    if (recipe.normalize) {
      t = (t - minV) / span;
    } else {
      t = clamp01(t);
    }
    if (contrast !== 1) {
      t = Math.pow(Math.max(t, 0), contrast);
    }
    data[j] = Math.round(clampRange(t * 255, 0, 255));
  }

  const finalRecipe: NoiseVolumeRecipe = { ...recipe, resolution: res };
  return {
    dimension: recipe.dimension,
    resolution: res,
    width,
    height,
    depth,
    data,
    recipe: finalRecipe,
  };
}

/** Max edge difference on opposite borders — ~0 for seamless tilable fields. */
export function seamlessError(baked: BakedNoiseVolume): number {
  const { width: w, height: h, depth: d, data } = baked;
  let err = 0;
  let n = 0;
  const at = (x: number, y: number, z: number) => data[(z * h + y) * w + x]!;
  for (let z = 0; z < d; z++) {
    for (let y = 0; y < h; y++) {
      err += Math.abs(at(0, y, z) - at(w - 1, y, z));
      n++;
    }
  }
  for (let z = 0; z < d; z++) {
    for (let x = 0; x < w; x++) {
      err += Math.abs(at(x, 0, z) - at(x, h - 1, z));
      n++;
    }
  }
  if (d > 1) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        err += Math.abs(at(x, y, 0) - at(x, y, d - 1));
        n++;
      }
    }
  }
  return n > 0 ? err / n : 0;
}

/** Extract an XY slice (zIndex) into an RGBA buffer for fallback/debug. */
export function noiseSliceToRgba(
  baked: BakedNoiseVolume,
  zIndex: number,
  out?: Uint8ClampedArray,
): Uint8ClampedArray {
  const { width: res, height, depth, data } = baked;
  const z = Math.round(clampRange(zIndex | 0, 0, depth - 1));
  const rgba =
    out && out.length >= res * height * 4 ? out : new Uint8ClampedArray(res * height * 4);
  const base = z * res * height;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < res; x++) {
      const v = data[base + y * res + x]!;
      const o = (y * res + x) * 4;
      rgba[o] = v;
      rgba[o + 1] = v;
      rgba[o + 2] = v;
      rgba[o + 3] = 255;
    }
  }
  return rgba;
}
