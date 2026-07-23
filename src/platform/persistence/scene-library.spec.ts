import { describe, expect, it } from 'vitest';
import { createDemoWorld, serializeWorld } from '@engine';
import { documentToWorld } from './scene-io';
import {
  createEmptySceneLibrary,
  createMemorySceneStorage,
  deleteSceneFromLibrary,
  listSceneMeta,
  loadWorldFromLibrary,
  normalizeSceneLibrary,
  readSceneLibrary,
  renameSceneInLibrary,
  resolveStartupWorld,
  sanitizeSceneFilename,
  upsertSceneInLibrary,
  writeSceneLibrary,
  SCENE_LIBRARY_STORAGE_KEY,
} from './scene-library';

describe('scene library', () => {
  it('upserts multiple scenes and lists newest first', () => {
    let lib = createEmptySceneLibrary();
    const a = createDemoWorld();
    const r1 = upsertSceneInLibrary(lib, a, { label: 'Alpha' });
    lib = r1.library;
    const b = createDemoWorld();
    const r2 = upsertSceneInLibrary(lib, b, { label: 'Beta' });
    lib = r2.library;
    expect(Object.keys(lib.scenes)).toHaveLength(2);
    expect(lib.activeId).toBe(r2.id);
    const meta = listSceneMeta(lib);
    expect(meta[0]!.label).toBe('Beta');
    expect(meta.map((m) => m.label).sort()).toEqual(['Alpha', 'Beta']);
  });

  it('overwrites existing id and round-trips through storage', () => {
    const storage = createMemorySceneStorage();
    let lib = createEmptySceneLibrary();
    const world = createDemoWorld();
    const { library, id } = upsertSceneInLibrary(lib, world, { label: 'Lab' });
    lib = library;
    writeSceneLibrary(lib, storage);

    world.resources.Quality.preset = 'ultra';
    world.bump();
    lib = upsertSceneInLibrary(lib, world, { id, label: 'Lab v2' }).library;
    writeSceneLibrary(lib, storage);

    const loaded = readSceneLibrary(storage);
    expect(Object.keys(loaded.scenes)).toHaveLength(1);
    expect(loaded.scenes[id]!.label).toBe('Lab v2');
    const w = loadWorldFromLibrary(loaded, id)!;
    expect(w.resources.Quality.preset).toBe('ultra');
    expect(w.resources.ActiveScene.sceneId).toBe(id);
  });

  it('resolveStartupWorld restores active scene', () => {
    const storage = createMemorySceneStorage();
    const world = createDemoWorld();
    const { library, id } = upsertSceneInLibrary(createEmptySceneLibrary(), world, {
      label: 'Mentett',
    });
    writeSceneLibrary(library, storage);
    const boot = resolveStartupWorld(storage);
    expect(boot.world.resources.ActiveScene.sceneId).toBe(id);
    expect(boot.world.resources.ActiveScene.label).toBe('Mentett');
  });

  it('resolveStartupWorld falls back to demo when empty', () => {
    const storage = createMemorySceneStorage();
    const boot = resolveStartupWorld(storage);
    expect(boot.world.resources.ActiveScene.sceneId).toBe('room');
    expect(boot.library.activeId).toBeNull();
  });

  it('delete and rename work', () => {
    let lib = createEmptySceneLibrary();
    const { library, id } = upsertSceneInLibrary(lib, createDemoWorld(), { label: 'X' });
    lib = renameSceneInLibrary(library, id, 'Y');
    expect(lib.scenes[id]!.label).toBe('Y');
    lib = deleteSceneFromLibrary(lib, id);
    expect(lib.scenes[id]).toBeUndefined();
    expect(lib.activeId).toBeNull();
  });

  it('normalize rejects bad version', () => {
    expect(normalizeSceneLibrary({ version: 99, scenes: {}, activeId: null }).scenes).toEqual(
      {},
    );
  });

  it('sanitizeSceneFilename produces json name', () => {
    expect(sanitizeSceneFilename('Szoba Labor!')).toMatch(/\.json$/);
    expect(sanitizeSceneFilename('')).toBe('light-studio-scene.json');
  });

  it('imported document can be stored as a scene', () => {
    const storage = createMemorySceneStorage();
    const json = serializeWorld(createDemoWorld());
    const world = documentToWorld(json);
    const { library } = upsertSceneInLibrary(createEmptySceneLibrary(), world, {
      label: 'Importált',
    });
    writeSceneLibrary(library, storage);
    expect(storage.getItem(SCENE_LIBRARY_STORAGE_KEY)).toContain('Importált');
  });
});
