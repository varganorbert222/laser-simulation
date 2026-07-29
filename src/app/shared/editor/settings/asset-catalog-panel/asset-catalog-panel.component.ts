import { Component, computed, effect, inject, signal } from '@angular/core';
import {
  studioAssets,
} from '@engine';
import { EditorFacade } from '../../../core/services/editor-facade.service';
import { LocalizationService } from '../../../core/services/localization.service';

export type AssetCatalogTab = 'skyboxes' | 'models' | 'textures';

export type CatalogKind = 'skybox' | 'model' | 'texture';

export interface CatalogItem {
  kind: CatalogKind;
  id: string;
  label: string;
  thumbUrl: string | null;
  /** Extra face URLs for cubemap inspector mosaic. */
  faceUrls: string[];
  path: string;
  typeLabel: string;
  category: string;
  usage: string;
  extension: string;
  scaleLabel: string;
  resolutionLabel: string;
  sizeLabel: string;
}

@Component({
  selector: 'app-asset-catalog-panel',
  standalone: true,
  templateUrl: './asset-catalog-panel.component.html',
  styleUrl: './asset-catalog-panel.component.scss',
})
export class AssetCatalogPanelComponent {
  readonly editor = inject(EditorFacade);
  readonly l10n = inject(LocalizationService);

  readonly tab = signal<AssetCatalogTab>('textures');
  readonly query = signal('');
  readonly selectedKey = signal<string | null>(null);
  /** Loaded image pixel size for the selected preview. */
  readonly previewPixels = signal<string>('—');
  /** Approximate file size from HEAD Content-Length. */
  readonly previewBytes = signal<string>('—');
  readonly previewFailed = signal(false);

  readonly items = computed((): CatalogItem[] => {
    // Re-read applied state so badges refresh.
    this.editor.atmosphere();
    this.editor.selectedEnvironmentPiece();
    const tab = this.tab();
    if (tab === 'skyboxes') {
      return studioAssets.listSkyboxIds().map((id) => skyboxItem(id));
    }
    if (tab === 'models') {
      return studioAssets.listModelIds().map((id) => modelItem(id));
    }
    return studioAssets.listTextureIds().map((id) => textureItem(id));
  });

  readonly filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    const list = this.items();
    if (!q) return list;
    return list.filter(
      (it) =>
        it.id.toLowerCase().includes(q) ||
        it.label.toLowerCase().includes(q) ||
        it.path.toLowerCase().includes(q) ||
        it.category.toLowerCase().includes(q) ||
        it.typeLabel.toLowerCase().includes(q),
    );
  });

  readonly selected = computed((): CatalogItem | null => {
    const key = this.selectedKey();
    if (!key) return null;
    return this.filtered().find((it) => itemKey(it) === key) ?? null;
  });

  constructor() {
    effect(() => {
      // Auto-select first item when tab/filter changes and selection is empty/missing.
      const list = this.filtered();
      const key = this.selectedKey();
      if (!list.length) {
        this.selectedKey.set(null);
        return;
      }
      if (!key || !list.some((it) => itemKey(it) === key)) {
        this.selectedKey.set(itemKey(list[0]!));
      }
    });

    effect(() => {
      const item = this.selected();
      this.previewPixels.set('—');
      this.previewBytes.set('—');
      this.previewFailed.set(false);
      if (!item) return;
      void this.loadPreviewMeta(item);
    });
  }

  setTab(tab: AssetCatalogTab): void {
    this.tab.set(tab);
    this.query.set('');
  }

  onQuery(raw: string): void {
    this.query.set(raw);
  }

  select(item: CatalogItem): void {
    this.selectedKey.set(itemKey(item));
  }

  isSelected(item: CatalogItem): boolean {
    return this.selectedKey() === itemKey(item);
  }

  isApplied(item: CatalogItem): boolean {
    if (item.kind === 'skybox') return this.isActiveSkybox(item.id);
    if (item.kind === 'model') return this.isActiveModel(item.id);
    return this.isActiveNightSky(item.id) || this.isActiveMoon(item.id);
  }

  isActiveSkybox(id: string): boolean {
    return this.editor.atmosphere().skyboxAssetId === id;
  }

  isActiveNightSky(id: string): boolean {
    return this.editor.atmosphere().nightSkyTextureId === id;
  }

  isActiveMoon(id: string): boolean {
    return this.editor.atmosphere().moonTextureId === id;
  }

  isActiveModel(id: string): boolean {
    return this.editor.selectedEnvironmentPiece()?.catalogId === id;
  }

  useAsSceneSkybox(id: string): void {
    this.editor.patchAtmosphere({ skyboxAssetId: id, enabled: false });
  }

  clearSceneSkybox(): void {
    this.editor.patchAtmosphere({ skyboxAssetId: null });
  }

  useAsNightSky(id: string): void {
    this.editor.patchAtmosphere({ nightSkyTextureId: id });
  }

  useAsMoon(id: string): void {
    this.editor.patchAtmosphere({ moonTextureId: id });
  }

  assignModelToSelection(id: string): void {
    this.editor.assignCatalogModel(id);
  }

  clearModelFromSelection(): void {
    this.editor.assignCatalogModel(null);
  }

  canAssignModel(): boolean {
    return this.editor.isEditMode() && this.editor.hasEnvironmentSelection();
  }

  onPreviewError(): void {
    this.previewFailed.set(true);
  }

  private async loadPreviewMeta(item: CatalogItem): Promise<void> {
    const previewUrl = item.thumbUrl;
    const sizeUrl =
      item.kind === 'model'
        ? studioAssets.getModelUrl(item.id)
        : previewUrl;

    if (previewUrl) {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => {
        if (this.selectedKey() !== itemKey(item)) return;
        this.previewPixels.set(`${img.naturalWidth} × ${img.naturalHeight}`);
      };
      img.onerror = () => {
        if (this.selectedKey() !== itemKey(item)) return;
        this.previewFailed.set(true);
      };
      img.src = previewUrl;
    }

    if (!sizeUrl) return;
    try {
      const res = await fetch(sizeUrl, { method: 'HEAD' });
      if (this.selectedKey() !== itemKey(item)) return;
      const len = res.headers.get('content-length');
      if (len) this.previewBytes.set(formatBytes(Number(len)));
    } catch {
      /* ignore — size optional */
    }
  }

  onTileActivate(item: CatalogItem): void {
    if (item.kind === 'skybox') {
      if (this.editor.isEditMode()) this.useAsSceneSkybox(item.id);
      return;
    }
    if (item.kind === 'model') {
      if (this.canAssignModel()) this.assignModelToSelection(item.id);
      return;
    }
    if (this.editor.isEditMode()) this.useAsNightSky(item.id);
  }
}

function itemKey(it: CatalogItem): string {
  return `${it.kind}:${it.id}`;
}

function extensionOf(path: string): string {
  const base = path.split('/').pop() ?? path;
  const i = base.lastIndexOf('.');
  return i >= 0 ? base.slice(i + 1).toUpperCase() : '—';
}

function skyboxItem(id: string): CatalogItem {
  const entry = studioAssets.getSkybox(id)!;
  const urls = studioAssets.getSkyboxUrls(id) ?? [];
  if (entry.type === 'photodome') {
    return {
      kind: 'skybox',
      id,
      label: entry.label ?? id,
      thumbUrl: urls[0] ?? null,
      faceUrls: [],
      path: entry.textures[0] ?? '',
      typeLabel: 'photodome',
      category: 'skybox',
      usage: 'equirect',
      extension: extensionOf(entry.textures[0] ?? ''),
      scaleLabel: entry.size != null ? `${entry.size}` : '—',
      resolutionLabel: entry.resolution != null ? `${entry.resolution}` : '—',
      sizeLabel: '—',
    };
  }
  return {
    kind: 'skybox',
    id,
    label: entry.label ?? id,
    thumbUrl: urls[0] ?? null,
    faceUrls: urls,
    path: entry.faces.join(', '),
    typeLabel: 'cubemap',
    category: 'skybox',
    usage: '6 faces',
    extension: extensionOf(entry.faces[0] ?? ''),
    scaleLabel: '—',
    resolutionLabel: '—',
    sizeLabel: '—',
  };
}

function modelItem(id: string): CatalogItem {
  const entry = studioAssets.getModel(id)!;
  const scale =
    entry.scale == null
      ? '—'
      : typeof entry.scale === 'number'
        ? String(entry.scale)
        : entry.scale.join(' × ');
  return {
    kind: 'model',
    id,
    label: entry.label ?? id,
    thumbUrl: null,
    faceUrls: [],
    path: entry.path,
    typeLabel: 'model',
    category: entry.category ?? '—',
    usage: 'glb',
    extension: extensionOf(entry.path),
    scaleLabel: scale,
    resolutionLabel: '—',
    sizeLabel: '—',
  };
}

function textureItem(id: string): CatalogItem {
  const entry = studioAssets.getTexture(id)!;
  return {
    kind: 'texture',
    id,
    label: entry.label ?? id,
    thumbUrl: studioAssets.getTextureUrl(id),
    faceUrls: [],
    path: entry.path,
    typeLabel: 'texture',
    category: entry.category ?? '—',
    usage: entry.usage ?? '—',
    extension: extensionOf(entry.path),
    scaleLabel: '—',
    resolutionLabel: '—',
    sizeLabel: '—',
  };
}

function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}
