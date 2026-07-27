import { DecimalPipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import {
  QUALITY_LADDER_ORDER,
  type LensFlareGroupTune,
  type QualityLadder,
  type QualityPresetSelection,
} from '@engine';
import { EditorFacade } from '../../../core/services/editor-facade.service';
import { LocalizationService } from '../../../core/services/localization.service';
import type { LocaleKey } from '../../../i18n/messages';

type FlareSliderKey = Exclude<keyof LensFlareGroupTune, 'enabled'>;

@Component({
  selector: 'app-presentation-settings-panel',
  standalone: true,
  imports: [DecimalPipe],
  templateUrl: './presentation-settings-panel.component.html',
  styleUrl: './presentation-settings-panel.component.scss',
})
export class PresentationSettingsPanelComponent {
  readonly editor = inject(EditorFacade);
  readonly l10n = inject(LocalizationService);
  readonly ladder = QUALITY_LADDER_ORDER;

  presetLabel(p: QualityPresetSelection): string {
    if (p === 'custom') return this.l10n.t('qualityPresetCustom');
    return p;
  }

  isActive(current: QualityPresetSelection, p: QualityLadder): boolean {
    return current === p;
  }

  setPresentation(preset: QualityLadder): void {
    this.editor.setPresentationPreset(preset);
  }

  onTonemap(raw: string): void {
    if (raw === 'reinhard' || raw === 'hable' || raw === 'aces') {
      this.editor.setTonemapMode(raw);
    }
  }

  onColorProfile(raw: string): void {
    this.editor.setColorProfile(raw === 'sdr' ? 'sdr' : 'hdr');
  }

  onOutputGamma(raw: string): void {
    const v = Number(raw);
    if (!Number.isFinite(v)) return;
    this.editor.setOutputGamma(v);
  }

  onLights(key: 'enabled', value: boolean): void;
  onLights(key: FlareSliderKey, value: string): void;
  onLights(key: keyof LensFlareGroupTune, value: boolean | string): void {
    if (key === 'enabled') {
      this.editor.patchLensFlareLights({ enabled: !!value });
      return;
    }
    const n = Number(value);
    if (!Number.isFinite(n)) return;
    this.editor.patchLensFlareLights({ [key]: n });
  }

  onSun(key: 'enabled', value: boolean): void;
  onSun(key: FlareSliderKey, value: string): void;
  onSun(key: keyof LensFlareGroupTune, value: boolean | string): void {
    if (key === 'enabled') {
      this.editor.patchLensFlareSun({ enabled: !!value });
      return;
    }
    const n = Number(value);
    if (!Number.isFinite(n)) return;
    this.editor.patchLensFlareSun({ [key]: n });
  }

  customHintKey(): LocaleKey {
    return 'hintQualityCustom';
  }
}
