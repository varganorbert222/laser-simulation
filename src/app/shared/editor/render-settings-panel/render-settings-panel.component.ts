import { Component, inject } from '@angular/core';
import {
  QUALITY_LADDER_ORDER,
  type QualityLadder,
  type QualityPresetSelection,
  type ShadowQuality,
} from '@engine';
import { EditorFacade } from '../../../core/services/editor-facade.service';
import { LocalizationService } from '../../../core/services/localization.service';
import type { LocaleKey } from '../../../i18n/messages';

@Component({
  selector: 'app-render-settings-panel',
  standalone: true,
  templateUrl: './render-settings-panel.component.html',
  styleUrl: './render-settings-panel.component.scss',
})
export class RenderSettingsPanelComponent {
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

  setOverall(preset: QualityLadder): void {
    this.editor.setQuality(preset);
  }

  setVolumetrics(preset: QualityLadder): void {
    this.editor.setVolumetricsPreset(preset);
  }

  setShadow(preset: QualityLadder): void {
    this.editor.setShadowPreset(preset);
  }

  setSky(preset: QualityLadder): void {
    this.editor.setAtmosphereQuality(preset);
  }

  setPresentation(preset: QualityLadder): void {
    this.editor.setPresentationPreset(preset);
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

  onSkyNumber(
    key:
      | 'sunAngularDiameterDeg'
      | 'exposure'
      | 'lutBlend'
      | 'reflectionLevel'
      | 'skyViewSamples'
      | 'transmittanceSamples',
    raw: string,
  ): void {
    const v = Number(raw);
    if (!Number.isFinite(v)) return;
    this.editor.patchAtmosphere({ [key]: v });
  }

  customHintKey(): LocaleKey {
    return 'hintQualityCustom';
  }
}
