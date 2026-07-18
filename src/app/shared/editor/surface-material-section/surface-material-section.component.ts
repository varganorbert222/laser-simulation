import { Component, input, inject } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import {
  SURFACE_FINISH_PRESETS,
  clampUnit,
  surfaceMaterialFromPreset,
  type SurfaceFinishPreset,
  type SurfaceMaterial,
} from '../../../../engine';
import { EditorFacade } from '../../../core/services/editor-facade.service';
import { I18nService } from '../../../i18n/i18n.service';

@Component({
  selector: 'app-surface-material-section',
  standalone: true,
  imports: [DecimalPipe],
  templateUrl: './surface-material-section.component.html',
  styleUrl: './surface-material-section.component.scss',
})
export class SurfaceMaterialSectionComponent {
  readonly material = input.required<SurfaceMaterial>();
  readonly editor = inject(EditorFacade);
  readonly i18n = inject(I18nService);
  readonly finishPresets = SURFACE_FINISH_PRESETS;

  onFinishPreset(value: string): void {
    if (value === 'custom') {
      this.editor.updateSurfaceMaterial({ preset: 'custom' });
      return;
    }
    if (
      value === 'matte_black' ||
      value === 'anodized_aluminum' ||
      value === 'painted_plastic' ||
      value === 'brushed_metal' ||
      value === 'chrome'
    ) {
      this.editor.updateSurfaceMaterial(surfaceMaterialFromPreset(value));
    }
  }

  onSurfaceParam(key: 'albedo' | 'metalness' | 'roughness', value: string): void {
    const n = Number(value);
    if (!Number.isFinite(n)) return;
    this.editor.updateSurfaceMaterial(
      { preset: 'custom', [key]: clampUnit(n) },
      { coalesce: true },
    );
  }

  finishLabel(preset: SurfaceFinishPreset): string {
    switch (preset) {
      case 'matte_black':
        return this.i18n.t('finishMatteBlack');
      case 'anodized_aluminum':
        return this.i18n.t('finishAnodized');
      case 'painted_plastic':
        return this.i18n.t('finishPlastic');
      case 'brushed_metal':
        return this.i18n.t('finishBrushed');
      case 'chrome':
        return this.i18n.t('finishChrome');
      default:
        return this.i18n.t('finishCustom');
    }
  }
}
