import { Injectable, computed, inject, signal } from '@angular/core';
import {
  bakeNoiseVolume,
  clampRange,
  createDefaultNoiseRecipe,
  createDefaultNoiseLayer,
  createNoiseLayerId,
  downloadNoiseVolumeJson,
  downloadNoiseVolumeRaw,
  noiseLibraryMeta,
  normalizeNoiseRecipe,
  parseNoiseVolumeFile,
  readNoiseLibrary,
  upsertLibraryEntry,
  writeNoiseLibrary,
  type BakedNoiseVolume,
  type NoiseBlendMode,
  type NoiseDimension,
  type NoiseLayer,
  type NoiseLibraryEntry,
  type NoiseLibraryMeta,
  type NoiseVolumeRecipe,
  type NoiseVolumeResolution,
} from '@engine';
import { EngineHostService } from '../services/engine-host.service';

/**
 * Noise library + editor draft. Baked assets are picked per MediaVolume;
 * GPU sync pushes the whole library to the volumetric binder.
 */
@Injectable({ providedIn: 'root' })
export class NoiseVolumeService {
  private readonly engine = inject(EngineHostService);

  readonly entries = signal<NoiseLibraryEntry[]>(readNoiseLibrary());
  readonly libraryMeta = computed(() => noiseLibraryMeta(this.entries()));

  readonly recipe = signal<NoiseVolumeRecipe>(createDefaultNoiseRecipe(64, '3d'));
  readonly draftLabel = signal('Új zaj');
  readonly editingId = signal<string | null>(null);
  readonly bakedPreview = signal<BakedNoiseVolume | null>(null);
  readonly baking = signal(false);
  readonly selectedLayerId = signal<string | null>(null);
  readonly status = signal<string | null>(null);

  constructor() {
    const entries = this.entries();
    if (entries.length === 0) {
      const baked = bakeNoiseVolume(createDefaultNoiseRecipe(64, '3d'));
      const { entries: next, entry } = upsertLibraryEntry([], baked, { label: 'Alap 3D zaj' });
      this.entries.set(next);
      writeNoiseLibrary(next);
      this.loadEntry(entry.id);
    } else {
      this.loadEntry(entries[0]!.id);
    }
  }

  /** Push library textures to the Babylon volumetric cache. */
  syncToHost(): void {
    this.engine.getHost()?.syncNoiseLibrary(
      this.entries().map((e) => ({ id: e.id, baked: e.baked })),
    );
  }

  listMeta(): NoiseLibraryMeta[] {
    return this.libraryMeta();
  }

  getEntry(id: string): NoiseLibraryEntry | null {
    return this.entries().find((e) => e.id === id) ?? null;
  }

  loadEntry(id: string): void {
    const entry = this.getEntry(id);
    if (!entry) return;
    this.editingId.set(id);
    this.draftLabel.set(entry.label);
    this.recipe.set(normalizeNoiseRecipe(entry.baked.recipe));
    this.bakedPreview.set(entry.baked);
    this.selectedLayerId.set(entry.baked.recipe.layers[0]?.id ?? null);
  }

  newDraft(dimension: NoiseDimension = '3d'): void {
    const recipe = createDefaultNoiseRecipe(
      this.recipe().resolution as NoiseVolumeResolution,
      dimension,
    );
    this.editingId.set(null);
    this.draftLabel.set(dimension === '2d' ? 'Új 2D zaj' : 'Új 3D zaj');
    this.recipe.set(recipe);
    this.bakedPreview.set(null);
    this.selectedLayerId.set(recipe.layers[0]?.id ?? null);
    this.status.set(null);
  }

  setDraftLabel(label: string): void {
    this.draftLabel.set(label);
  }

  setDimension(dimension: NoiseDimension): void {
    this.recipe.update((r) => ({ ...r, dimension }));
    this.bakedPreview.set(null);
  }

  setResolution(resolution: NoiseVolumeResolution): void {
    this.recipe.update((r) => ({ ...r, resolution }));
    this.bakedPreview.set(null);
  }

  setNormalize(normalize: boolean): void {
    this.recipe.update((r) => ({ ...r, normalize }));
  }

  setContrast(contrast: number): void {
    if (!Number.isFinite(contrast)) return;
    this.recipe.update((r) => ({ ...r, contrast: clampRange(contrast, 0.05, 4) }));
  }

  selectLayer(id: string | null): void {
    this.selectedLayerId.set(id);
  }

  addLayer(): void {
    const layer = createDefaultNoiseLayer({
      name: `Réteg ${this.recipe().layers.length + 1}`,
      seed: (Math.random() * 1000) | 0,
      frequency: 4 + this.recipe().layers.length,
      blend: 'add',
    });
    this.recipe.update((r) => ({ ...r, layers: [...r.layers, layer] }));
    this.selectedLayerId.set(layer.id);
  }

  removeLayer(id: string): void {
    this.recipe.update((r) => ({
      ...r,
      layers: r.layers.filter((l) => l.id !== id),
    }));
    if (this.selectedLayerId() === id) {
      this.selectedLayerId.set(this.recipe().layers[0]?.id ?? null);
    }
  }

  duplicateLayer(id: string): void {
    const src = this.recipe().layers.find((l) => l.id === id);
    if (!src) return;
    const copy: NoiseLayer = {
      ...src,
      id: createNoiseLayerId(),
      name: `${src.name} másolat`,
      seed: src.seed + 17,
    };
    this.recipe.update((r) => {
      const idx = r.layers.findIndex((l) => l.id === id);
      const layers = [...r.layers];
      layers.splice(idx + 1, 0, copy);
      return { ...r, layers };
    });
    this.selectedLayerId.set(copy.id);
  }

  patchLayer(id: string, patch: Partial<NoiseLayer>): void {
    this.recipe.update((r) => ({
      ...r,
      layers: r.layers.map((l) => (l.id === id ? { ...l, ...patch, id: l.id } : l)),
    }));
  }

  setLayerBlend(id: string, blend: NoiseBlendMode): void {
    this.patchLayer(id, { blend });
  }

  resetDefault(): void {
    const dim = this.recipe().dimension;
    const recipe = createDefaultNoiseRecipe(this.recipe().resolution as NoiseVolumeResolution, dim);
    this.recipe.set(recipe);
    this.selectedLayerId.set(recipe.layers[0]?.id ?? null);
    this.bakedPreview.set(null);
  }

  /** Bake draft for preview (does not save to library). */
  bakePreview(): BakedNoiseVolume {
    this.baking.set(true);
    try {
      const baked = bakeNoiseVolume(this.recipe());
      this.bakedPreview.set(baked);
      this.recipe.set(baked.recipe);
      return baked;
    } finally {
      this.baking.set(false);
    }
  }

  /** Bake and upsert into the library, then sync GPU. */
  bakeAndSave(opts?: { asNew?: boolean }): NoiseLibraryEntry {
    this.baking.set(true);
    this.status.set(null);
    try {
      const baked = bakeNoiseVolume(this.recipe());
      this.bakedPreview.set(baked);
      this.recipe.set(baked.recipe);
      const id = opts?.asNew ? null : this.editingId();
      const { entries, entry } = upsertLibraryEntry(this.entries(), baked, {
        id,
        label: this.draftLabel(),
      });
      this.entries.set(entries);
      writeNoiseLibrary(entries);
      this.editingId.set(entry.id);
      this.draftLabel.set(entry.label);
      this.syncToHost();
      this.status.set('saved');
      return entry;
    } finally {
      this.baking.set(false);
    }
  }

  deleteEntry(id: string): void {
    const next = this.entries().filter((e) => e.id !== id);
    this.entries.set(next);
    writeNoiseLibrary(next);
    this.syncToHost();
    if (this.editingId() === id) {
      if (next[0]) this.loadEntry(next[0].id);
      else this.newDraft('3d');
    }
  }

  renameEntry(id: string, label: string): void {
    const trimmed = label.trim();
    if (!trimmed) return;
    const next = this.entries().map((e) =>
      e.id === id ? { ...e, label: trimmed, updatedAt: Date.now() } : e,
    );
    this.entries.set(next);
    writeNoiseLibrary(next);
    if (this.editingId() === id) this.draftLabel.set(trimmed);
  }

  exportJson(): void {
    const baked = this.bakedPreview() ?? this.bakePreview();
    downloadNoiseVolumeJson(baked, undefined, {
      id: this.editingId() ?? undefined,
      label: this.draftLabel(),
    });
  }

  exportRaw(): void {
    const baked = this.bakedPreview() ?? this.bakePreview();
    downloadNoiseVolumeRaw(baked);
  }

  async importFile(file: File): Promise<void> {
    const text = await file.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      this.status.set('import-error');
      throw new Error('Invalid JSON');
    }
    const baked = parseNoiseVolumeFile(parsed);
    const label =
      typeof (parsed as { label?: unknown }).label === 'string'
        ? ((parsed as { label: string }).label)
        : file.name.replace(/\.(noise[23]d\.)?json$/i, '');
    const { entries, entry } = upsertLibraryEntry(this.entries(), baked, {
      id: null,
      label: label || undefined,
    });
    this.entries.set(entries);
    writeNoiseLibrary(entries);
    this.loadEntry(entry.id);
    this.syncToHost();
    this.status.set('imported');
  }
}
