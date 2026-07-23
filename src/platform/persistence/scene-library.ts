/**
 * Multi-scene library persisted in browser storage (localStorage by default).
 * Each entry stores a full SceneDocument (SerializedWorld).
 */

import { createDemoWorld, type World } from '@engine';
import { documentToWorld, worldToDocument, type SceneDocument } from './scene-io';

export const SCENE_LIBRARY_STORAGE_KEY = 'light-studio.scene-library.v1';
export const SCENE_LIBRARY_VERSION = 1 as const;

export interface SceneStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

export interface SceneLibraryEntry {
  id: string;
  label: string;
  updatedAt: number;
  document: SceneDocument;
}

export interface SceneLibraryMeta {
  id: string;
  label: string;
  updatedAt: number;
}

export interface SceneLibrary {
  version: typeof SCENE_LIBRARY_VERSION;
  activeId: string | null;
  scenes: Record<string, SceneLibraryEntry>;
}

export function createEmptySceneLibrary(): SceneLibrary {
  return { version: SCENE_LIBRARY_VERSION, activeId: null, scenes: {} };
}

export function createMemorySceneStorage(
  initial: Record<string, string> = {},
): SceneStorage & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key]! : null;
    },
    setItem(key, value) {
      data[key] = value;
    },
    removeItem(key) {
      delete data[key];
    },
  };
}

function browserStorage(): SceneStorage | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

export function defaultSceneStorage(): SceneStorage {
  return browserStorage() ?? createMemorySceneStorage();
}

export function normalizeSceneLibrary(raw: unknown): SceneLibrary {
  const empty = createEmptySceneLibrary();
  if (!raw || typeof raw !== 'object') return empty;
  const obj = raw as Partial<SceneLibrary>;
  if (obj.version !== SCENE_LIBRARY_VERSION) return empty;
  const scenes: Record<string, SceneLibraryEntry> = {};
  if (obj.scenes && typeof obj.scenes === 'object') {
    for (const [id, entry] of Object.entries(obj.scenes)) {
      if (!entry || typeof entry !== 'object') continue;
      if (typeof entry.document !== 'object' || !entry.document) continue;
      const label =
        typeof entry.label === 'string' && entry.label.trim()
          ? entry.label.trim()
          : id;
      scenes[id] = {
        id,
        label,
        updatedAt:
          typeof entry.updatedAt === 'number' && Number.isFinite(entry.updatedAt)
            ? entry.updatedAt
            : Date.now(),
        document: entry.document as SceneDocument,
      };
    }
  }
  const activeId =
    typeof obj.activeId === 'string' && scenes[obj.activeId] ? obj.activeId : null;
  return { version: SCENE_LIBRARY_VERSION, activeId, scenes };
}

export function readSceneLibrary(storage: SceneStorage = defaultSceneStorage()): SceneLibrary {
  try {
    const raw = storage.getItem(SCENE_LIBRARY_STORAGE_KEY);
    if (!raw) return createEmptySceneLibrary();
    return normalizeSceneLibrary(JSON.parse(raw));
  } catch {
    return createEmptySceneLibrary();
  }
}

export function writeSceneLibrary(
  library: SceneLibrary,
  storage: SceneStorage = defaultSceneStorage(),
): void {
  storage.setItem(SCENE_LIBRARY_STORAGE_KEY, JSON.stringify(library));
}

export function listSceneMeta(library: SceneLibrary): SceneLibraryMeta[] {
  return Object.values(library.scenes)
    .map(({ id, label, updatedAt }) => ({ id, label, updatedAt }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export function newSceneId(): string {
  return `scene_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function sanitizeSceneFilename(label: string): string {
  const base = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9áéíóöőúüű\-_\s]+/gi, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
  return `${base || 'light-studio-scene'}.json`;
}

/** Persist world into library (overwrite id or create new). Sets ActiveScene + activeId. */
export function upsertSceneInLibrary(
  library: SceneLibrary,
  world: World,
  opts?: { id?: string | null; label?: string },
): { library: SceneLibrary; id: string; label: string } {
  const id = opts?.id && library.scenes[opts.id] ? opts.id : newSceneId();
  const label =
    (opts?.label?.trim() ||
      world.resources.ActiveScene.label?.trim() ||
      'Jelenet') ||
    'Jelenet';
  world.resources.ActiveScene = { sceneId: id, label };
  world.bump();
  const entry: SceneLibraryEntry = {
    id,
    label,
    updatedAt: Date.now(),
    document: worldToDocument(world),
  };
  const next: SceneLibrary = {
    ...library,
    activeId: id,
    scenes: { ...library.scenes, [id]: entry },
  };
  return { library: next, id, label };
}

export function deleteSceneFromLibrary(
  library: SceneLibrary,
  id: string,
): SceneLibrary {
  if (!library.scenes[id]) return library;
  const scenes = { ...library.scenes };
  delete scenes[id];
  return {
    ...library,
    scenes,
    activeId: library.activeId === id ? null : library.activeId,
  };
}

export function renameSceneInLibrary(
  library: SceneLibrary,
  id: string,
  label: string,
): SceneLibrary {
  const entry = library.scenes[id];
  if (!entry) return library;
  const nextLabel = label.trim() || entry.label;
  const document = structuredClone(entry.document) as SceneDocument;
  if (document.resources?.ActiveScene) {
    document.resources.ActiveScene = {
      ...document.resources.ActiveScene,
      sceneId: id,
      label: nextLabel,
    };
  }
  return {
    ...library,
    scenes: {
      ...library.scenes,
      [id]: {
        ...entry,
        label: nextLabel,
        updatedAt: Date.now(),
        document,
      },
    },
  };
}

export function loadWorldFromLibrary(library: SceneLibrary, id: string): World | null {
  const entry = library.scenes[id];
  if (!entry) return null;
  try {
    const world = documentToWorld(entry.document);
    world.resources.ActiveScene = { sceneId: id, label: entry.label };
    return world;
  } catch {
    return null;
  }
}

/** Startup world: last active scene, or demo if none / corrupt. */
export function resolveStartupWorld(
  storage: SceneStorage = defaultSceneStorage(),
): { world: World; library: SceneLibrary } {
  const library = readSceneLibrary(storage);
  if (library.activeId) {
    const world = loadWorldFromLibrary(library, library.activeId);
    if (world) return { world, library };
  }
  return { world: createDemoWorld(), library };
}
