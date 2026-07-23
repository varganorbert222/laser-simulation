import { Component, inject } from '@angular/core';
import { EditorFacade } from '../../../core/services/editor-facade.service';
import { LocalizationService } from '../../../core/services/localization.service';
import type { QualityPreset, ShadowQuality } from '@engine';

@Component({
  selector: 'app-render-settings-panel',
  standalone: true,
  templateUrl: './render-settings-panel.component.html',
  styleUrl: './render-settings-panel.component.scss',
})
export class RenderSettingsPanelComponent {
  readonly editor = inject(EditorFacade);
  readonly l10n = inject(LocalizationService);

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
