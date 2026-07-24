import { Component, computed, inject, signal } from '@angular/core';
import {
  studioAssets,
  type ModelManifestEntry,
  type SkyboxManifestEntry,
  type TextureManifestEntry,
} from '@engine';
import { EditorFacade } from '../../../core/services/editor-facade.service';
import { LocalizationService } from '../../../core/services/localization.service';

export type AssetCatalogTab = 'skyboxes' | 'models' | 'textures';

@Component({
  selector: 'app-asset-catalog-panel',
  standalone: true,
  templateUrl: './asset-catalog-panel.component.html',
  styleUrl: './asset-catalog-panel.component.scss',
})
export class AssetCatalogPanelComponent {
  readonly editor = inject(EditorFacade);
  readonly l10n = inject(LocalizationService);

  readonly tab = signal<AssetCatalogTab>('skyboxes');

  readonly skyboxRows = computed(() => {
    this.editor.atmosphere();
    return studioAssets.listSkyboxIds().map((id) => {
      const entry = studioAssets.getSkybox(id)!;
      return { id, entry, summary: skyboxSummary(entry) };
    });
  });

  readonly modelRows = computed(() => {
    this.editor.selectedEnvironmentPiece();
    return studioAssets.listModelIds().map((id) => {
      const entry = studioAssets.getModel(id)!;
      return { id, entry, summary: modelSummary(entry) };
    });
  });

  readonly textureRows = computed(() => {
    this.editor.atmosphere();
    return studioAssets.listTextureIds().map((id) => {
      const entry = studioAssets.getTexture(id)!;
      return { id, entry, summary: textureSummary(entry) };
    });
  });

  setTab(tab: AssetCatalogTab): void {
    this.tab.set(tab);
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
}

function skyboxSummary(entry: SkyboxManifestEntry): string {
  if (entry.type === 'photodome') {
    return `photodome · ${entry.textures[0] ?? ''}`;
  }
  return `cubemap · ${entry.faces.length} faces`;
}

function modelSummary(entry: ModelManifestEntry): string {
  const cat = entry.category ? `${entry.category} · ` : '';
  return `${cat}${entry.path}`;
}

function textureSummary(entry: TextureManifestEntry): string {
  const bits = [entry.category, entry.usage, entry.path].filter(Boolean);
  return bits.join(' · ');
}
