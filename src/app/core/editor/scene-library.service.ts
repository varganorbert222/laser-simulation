import { Injectable, computed, signal } from '@angular/core';
import type { World } from '../../../engine';
import {
  defaultSceneStorage,
  deleteSceneFromLibrary,
  listSceneMeta,
  loadWorldFromLibrary,
  readSceneLibrary,
  renameSceneInLibrary,
  resolveStartupWorld,
  upsertSceneInLibrary,
  writeSceneLibrary,
  type SceneLibrary,
  type SceneLibraryMeta,
  type SceneStorage,
} from '../../../platform/persistence';

/**
 * Browser-persisted multi-scene library (localStorage).
 * No dependency on EngineHost — safe to inject for startup world.
 */
@Injectable({ providedIn: 'root' })
export class SceneLibraryService {
  private readonly storage: SceneStorage = defaultSceneStorage();
  private readonly librarySig = signal<SceneLibrary>(readSceneLibrary(this.storage));

  readonly scenes = computed(() => listSceneMeta(this.librarySig()));
  readonly activeId = computed(() => this.librarySig().activeId);

  resolveStartupWorld(): World {
    const { world, library } = resolveStartupWorld(this.storage);
    this.librarySig.set(library);
    return world;
  }

  refresh(): void {
    this.librarySig.set(readSceneLibrary(this.storage));
  }

  list(): SceneLibraryMeta[] {
    return listSceneMeta(this.librarySig());
  }

  /** Save world into library (overwrite active/id or create new). */
  saveWorld(
    world: World,
    opts?: { id?: string | null; label?: string; asNew?: boolean },
  ): SceneLibraryMeta {
    const current = this.librarySig();
    const id = opts?.asNew ? null : (opts?.id ?? current.activeId);
    const { library, id: savedId, label } = upsertSceneInLibrary(current, world, {
      id,
      label: opts?.label,
    });
    this.persist(library);
    return { id: savedId, label, updatedAt: library.scenes[savedId]!.updatedAt };
  }

  loadWorld(id: string): World | null {
    const world = loadWorldFromLibrary(this.librarySig(), id);
    if (!world) return null;
    this.persist({ ...this.librarySig(), activeId: id });
    return world;
  }

  delete(id: string): void {
    this.persist(deleteSceneFromLibrary(this.librarySig(), id));
  }

  rename(id: string, label: string): void {
    this.persist(renameSceneInLibrary(this.librarySig(), id, label));
  }

  clearActive(): void {
    const lib = this.librarySig();
    if (!lib.activeId) return;
    this.persist({ ...lib, activeId: null });
  }

  getEntryLabel(id: string): string | null {
    return this.librarySig().scenes[id]?.label ?? null;
  }

  private persist(library: SceneLibrary): void {
    writeSceneLibrary(library, this.storage);
    this.librarySig.set(library);
  }
}
