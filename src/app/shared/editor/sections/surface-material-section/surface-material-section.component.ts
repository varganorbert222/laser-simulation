import { Component, input, inject } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import {
  SURFACE_FINISH_PRESETS,
  clampUnit,
  surfaceMaterialFromPreset,
  type SurfaceFinishPreset,
  type SurfaceMaterial,
} from '@engine';
import { EditorFacade } from '../../../core/services/editor-facade.service';
import { LocalizationService } from '../../../core/services/localization.service';

@Component({
  selector: 'app-surface-material-section',
  standalone: true,
  imports: [DecimalPipe],
  templateUrl: './surface-material-section.component.html',
  styleUrl: './surface-material-section.component.scss',
})
export class SurfaceMaterialSectionComponent {
  readonly material = input.required<SurfaceMaterial>();
  /** Entities this section is editing — survives selection races on native controls. */
  readonly targetIds = input<readonly string[]>([]);
  readonly editor = inject(EditorFacade);
  readonly l10n = inject(LocalizationService);
  readonly finishPresets = SURFACE_FINISH_PRESETS;

  private patchOpts(coalesce?: boolean): { coalesce?: boolean; entityIds?: readonly string[] } {
    const ids = this.targetIds();
    return {
      coalesce,
      ...(ids.length ? { entityIds: ids } : {}),
    };
  }

  onFinishPreset(preset: SurfaceFinishPreset): void {
    if (preset === this.material().preset) return;
    if (preset === 'custom') {
      this.editor.updateSurfaceMaterial({ preset: 'custom' }, this.patchOpts());
      return;
    }
    this.editor.updateSurfaceMaterial(surfaceMaterialFromPreset(preset), this.patchOpts());
  }

  onSurfaceParam(
    key: 'albedo' | 'metalness' | 'roughness' | 'transmission',
    value: string,
  ): void {
    const n = Number(value);
    if (!Number.isFinite(n)) return;
    this.editor.updateSurfaceMaterial(
      { preset: 'custom', [key]: clampUnit(n) },
      this.patchOpts(true),
    );
  }

  finishLabel(preset: SurfaceFinishPreset): string {
    switch (preset) {
      case 'matte_black':
        return this.l10n.t('finishMatteBlack');
      case 'anodized_aluminum':
        return this.l10n.t('finishAnodized');
      case 'painted_plastic':
        return this.l10n.t('finishPlastic');
      case 'brushed_metal':
        return this.l10n.t('finishBrushed');
      case 'chrome':
        return this.l10n.t('finishChrome');
      case 'glass_clear':
        return this.l10n.t('finishGlassClear');
      default:
        return this.l10n.t('finishCustom');
    }
  }
}
