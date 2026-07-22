import { Component, inject } from '@angular/core';
import { EditorFacade } from '../../../core/services/editor-facade.service';
import { I18nService } from '../../../i18n/i18n.service';
import type { QualityPreset, ShadowQuality } from '../../../../engine';

@Component({
  selector: 'app-render-settings-panel',
  standalone: true,
  templateUrl: './render-settings-panel.component.html',
  styleUrl: './render-settings-panel.component.scss',
})
export class RenderSettingsPanelComponent {
  readonly editor = inject(EditorFacade);
  readonly i18n = inject(I18nService);

  setPreset(preset: QualityPreset): void {
    this.editor.setQuality(preset);
  }

  onNumber(
    key:
      | 'stepSize'
      | 'maxSteps'
      | 'densityThreshold'
      | 'transmittanceCut'
      | 'renderScale',
    raw: string,
  ): void {
    const v = Number(raw);
    if (!Number.isFinite(v)) return;
    this.editor.patchQuality({ [key]: v });
  }

  onShadow(raw: string): void {
    this.editor.setShadowQuality(raw as ShadowQuality);
  }

  onTonemap(raw: string): void {
    this.editor.setTonemapMode(raw === 'reinhard' ? 'reinhard' : 'aces');
  }
}
