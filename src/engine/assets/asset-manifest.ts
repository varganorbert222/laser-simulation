import { resolveAssetUrl } from './runtime-paths';

export type ModelCategory = 'fixture' | 'prop' | 'stage' | string;

export interface ModelManifestEntry {
  label?: string;
  category?: ModelCategory;
  /** Primary GLB path relative to `/assets`. */
  path: string;
  /** Optional LOD / variant GLBs (random pick or LOD ladder). */
  variants?: string[];
  scale?: number | [number, number, number];
}

export interface SkyboxCubemapEntry {
  type: 'cubemap';
  label?: string;
  /** Order: +X, -X, +Y, -Y, +Z, -Z — paths relative to `/assets`. */
  faces: string[];
}

export interface SkyboxPhotodomeEntry {
  type: 'photodome';
  label?: string;
  /** Equirectangular spheremaps relative to `/assets`. */
  textures: string[];
  resolution?: number;
  size?: number;
  useDirectMapping?: boolean;
}

export type SkyboxManifestEntry = SkyboxCubemapEntry | SkyboxPhotodomeEntry;

/** Shipped 2D texture (night sky, moon, future surface maps). */
export type TextureCategory = 'sky' | 'surface' | 'ui' | string;

export interface TextureManifestEntry {
  label?: string;
  category?: TextureCategory;
  /** Path relative to `/assets`. */
  path: string;
  /** Hint for consumers (equirect starfield, moon disc, albedo, …). */
  usage?: string;
}

export interface AssetManifest {
  models: Record<string, ModelManifestEntry>;
  skyboxes: Record<string, SkyboxManifestEntry>;
  textures: Record<string, TextureManifestEntry>;
}

/** Default night overlay texture ids (must exist in `data/manifest.json`). */
export const DEFAULT_NIGHT_SKY_TEXTURE_ID = 'night_sky_default';
export const DEFAULT_MOON_TEXTURE_ID = 'moon_default';

const warned = new Set<string>();

export async function loadAssetManifest(url: string): Promise<AssetManifest> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load asset manifest: ${url}`);
  const json = (await res.json()) as Partial<AssetManifest>;
  return {
    models: json.models ?? {},
    skyboxes: json.skyboxes ?? {},
    textures: json.textures ?? {},
  };
}

export function modelAssetUrl(entry: ModelManifestEntry, assetsBase = '/assets'): string {
  return resolveAssetUrl(entry.path, assetsBase);
}

export function textureAssetUrl(entry: TextureManifestEntry, assetsBase = '/assets'): string {
  return resolveAssetUrl(entry.path, assetsBase);
}

export function warnMissingOnce(id: string): void {
  if (!warned.has(id)) {
    warned.add(id);
    console.warn(`[Assets] missing: ${id} — using placeholder`);
  }
}
