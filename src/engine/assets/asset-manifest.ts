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
  /** Order: +X, -X, +Y, -Y, +Z, -Z — paths relative to `/assets`. */
  faces: string[];
}

export interface SkyboxPhotodomeEntry {
  type: 'photodome';
  /** Equirectangular spheremaps relative to `/assets`. */
  textures: string[];
  resolution?: number;
  size?: number;
  useDirectMapping?: boolean;
}

export type SkyboxManifestEntry = SkyboxCubemapEntry | SkyboxPhotodomeEntry;

export interface AssetManifest {
  models: Record<string, ModelManifestEntry>;
  skyboxes: Record<string, SkyboxManifestEntry>;
}

const warned = new Set<string>();

export async function loadAssetManifest(url: string): Promise<AssetManifest> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load asset manifest: ${url}`);
  const json = (await res.json()) as Partial<AssetManifest>;
  return {
    models: json.models ?? {},
    skyboxes: json.skyboxes ?? {},
  };
}

export function modelAssetUrl(entry: ModelManifestEntry, assetsBase = '/assets'): string {
  return resolveAssetUrl(entry.path, assetsBase);
}

export function warnMissingOnce(id: string): void {
  if (!warned.has(id)) {
    warned.add(id);
    console.warn(`[Assets] missing: ${id} — using placeholder`);
  }
}
