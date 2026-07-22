import {
  bakeNoiseVolume,
  createNoiseAssetId,
  normalizeNoiseRecipe,
  type BakedNoiseVolume,
  type NoiseDimension,
  type NoiseVolumeRecipe,
} from './volume-noise';

export const NOISE_VOLUME_FILE_KIND = 'light-studio-noise-volume' as const;
export const NOISE_VOLUME_FILE_VERSION = 2 as const;
export const NOISE_LIBRARY_STORAGE_KEY = 'ls-noise-library-v1';
const LEGACY_SINGLE_KEY = 'ls-noise-volume-v1';

export interface NoiseVolumeFile {
  kind: typeof NOISE_VOLUME_FILE_KIND;
  version: number;
  id?: string;
  label?: string;
  recipe: NoiseVolumeRecipe;
  /** Base64 of R8 voxels. Optional — rebake from recipe if missing. */
  dataBase64?: string;
}

export interface NoiseLibraryEntry {
  id: string;
  label: string;
  updatedAt: number;
  baked: BakedNoiseVolume;
}

export interface NoiseLibraryMeta {
  id: string;
  label: string;
  updatedAt: number;
  dimension: NoiseDimension;
  resolution: number;
}

export interface NoiseLibraryStore {
  version: 1;
  entries: Record<string, SerializedNoiseEntry>;
}

interface SerializedNoiseEntry {
  id: string;
  label: string;
  updatedAt: number;
  file: NoiseVolumeFile;
}

export function bakedToNoiseVolumeFile(
  baked: BakedNoiseVolume,
  meta?: { id?: string; label?: string },
): NoiseVolumeFile {
  return {
    kind: NOISE_VOLUME_FILE_KIND,
    version: NOISE_VOLUME_FILE_VERSION,
    id: meta?.id,
    label: meta?.label,
    recipe: baked.recipe,
    dataBase64: uint8ToBase64(baked.data),
  };
}

export function parseNoiseVolumeFile(raw: unknown): BakedNoiseVolume {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid noise volume file');
  }
  const f = raw as Partial<NoiseVolumeFile>;
  if (f.kind !== NOISE_VOLUME_FILE_KIND) {
    throw new Error('Not a noise volume file');
  }
  const recipe = normalizeNoiseRecipe(f.recipe);
  if (typeof f.dataBase64 === 'string' && f.dataBase64.length > 0) {
    const data = base64ToUint8(f.dataBase64);
    const depth = recipe.dimension === '2d' ? 1 : recipe.resolution;
    const expected = recipe.resolution * recipe.resolution * depth;
    if (data.length === expected) {
      return {
        dimension: recipe.dimension,
        resolution: recipe.resolution,
        width: recipe.resolution,
        height: recipe.resolution,
        depth,
        data,
        recipe,
      };
    }
  }
  return bakeNoiseVolume(recipe);
}

export function serializeNoiseVolumeFile(
  baked: BakedNoiseVolume,
  meta?: { id?: string; label?: string },
): string {
  return JSON.stringify(bakedToNoiseVolumeFile(baked, meta));
}

export function downloadNoiseVolumeJson(
  baked: BakedNoiseVolume,
  filename?: string,
  meta?: { id?: string; label?: string },
): void {
  const json = serializeNoiseVolumeFile(baked, meta);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const dim = baked.dimension;
  a.download =
    filename ??
    `${meta?.label?.replace(/\s+/g, '-') || 'noise'}-${dim}-${baked.resolution}.${dim === '2d' ? 'noise2d' : 'noise3d'}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadNoiseVolumeRaw(baked: BakedNoiseVolume, filename?: string): void {
  const blob = new Blob([baked.data], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download =
    filename ??
    `noise-${baked.dimension}-${baked.resolution}.${baked.dimension === '2d' ? 'r8' : 'r8.3d'}`;
  a.click();
  URL.revokeObjectURL(url);
}

export function readNoiseLibrary(): NoiseLibraryEntry[] {
  try {
    const raw = localStorage.getItem(NOISE_LIBRARY_STORAGE_KEY);
    if (raw) {
      const store = JSON.parse(raw) as NoiseLibraryStore;
      return Object.values(store.entries ?? {}).map(deserializeEntry).filter(Boolean) as NoiseLibraryEntry[];
    }
  } catch {
    // fall through to legacy
  }
  return migrateLegacySingle();
}

export function writeNoiseLibrary(entries: NoiseLibraryEntry[]): void {
  const store: NoiseLibraryStore = { version: 1, entries: {} };
  for (const e of entries) {
    store.entries[e.id] = {
      id: e.id,
      label: e.label,
      updatedAt: e.updatedAt,
      file: bakedToNoiseVolumeFile(e.baked, { id: e.id, label: e.label }),
    };
  }
  try {
    localStorage.setItem(NOISE_LIBRARY_STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Quota / private mode
  }
}

export function noiseLibraryMeta(entries: readonly NoiseLibraryEntry[]): NoiseLibraryMeta[] {
  return entries
    .map((e) => ({
      id: e.id,
      label: e.label,
      updatedAt: e.updatedAt,
      dimension: e.baked.dimension,
      resolution: e.baked.resolution,
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export function upsertLibraryEntry(
  entries: NoiseLibraryEntry[],
  baked: BakedNoiseVolume,
  opts?: { id?: string | null; label?: string },
): { entries: NoiseLibraryEntry[]; entry: NoiseLibraryEntry } {
  const id = opts?.id && entries.some((e) => e.id === opts.id) ? opts.id : createNoiseAssetId();
  const existing = entries.find((e) => e.id === id);
  const label =
    (opts?.label && opts.label.trim()) ||
    existing?.label ||
    defaultLabel(baked);
  const entry: NoiseLibraryEntry = {
    id,
    label,
    updatedAt: Date.now(),
    baked,
  };
  const next = entries.filter((e) => e.id !== id);
  next.push(entry);
  return { entries: next, entry };
}

function defaultLabel(baked: BakedNoiseVolume): string {
  const dim = baked.dimension === '2d' ? '2D' : '3D';
  return `Zaj ${dim} ${baked.resolution}`;
}

function deserializeEntry(raw: SerializedNoiseEntry): NoiseLibraryEntry | null {
  try {
    const baked = parseNoiseVolumeFile(raw.file);
    return {
      id: raw.id || createNoiseAssetId(),
      label: raw.label || defaultLabel(baked),
      updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : Date.now(),
      baked,
    };
  } catch {
    return null;
  }
}

function migrateLegacySingle(): NoiseLibraryEntry[] {
  try {
    const raw = localStorage.getItem(LEGACY_SINGLE_KEY);
    if (!raw) return [];
    const baked = parseNoiseVolumeFile(JSON.parse(raw));
    const entry: NoiseLibraryEntry = {
      id: createNoiseAssetId(),
      label: defaultLabel(baked),
      updatedAt: Date.now(),
      baked,
    };
    writeNoiseLibrary([entry]);
    localStorage.removeItem(LEGACY_SINGLE_KEY);
    return [entry];
  } catch {
    return [];
  }
}

function uint8ToBase64(data: Uint8Array): string {
  const chunk = 0x8000;
  let binary = '';
  for (let i = 0; i < data.length; i += chunk) {
    binary += String.fromCharCode(...data.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64ToUint8(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}
