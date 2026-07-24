import { Component, inject } from '@angular/core';
import {
  QUALITY_LADDER_ORDER,
  studioAssets,
  type QualityLadder,
  type QualityPresetSelection,
  type ShadowQuality,
} from '@engine';
import { EditorFacade } from '../../../core/services/editor-facade.service';
import { LocalizationService } from '../../../core/services/localization.service';
import type { LocaleKey } from '../../../i18n/messages';
import { ColorFieldComponent } from '../color-field/color-field.component';

@Component({
  selector: 'app-render-settings-panel',
  standalone: true,
  imports: [ColorFieldComponent],
  templateUrl: './render-settings-panel.component.html',
  styleUrl: './render-settings-panel.component.scss',
})
export class RenderSettingsPanelComponent {
  readonly editor = inject(EditorFacade);
  readonly l10n = inject(LocalizationService);
  readonly ladder = QUALITY_LADDER_ORDER;
  readonly skyboxIds = studioAssets.listSkyboxIds();
  readonly nightSkyTextureIds = studioAssets.listTextureIdsByUsage('equirect');
  readonly moonTextureIds = studioAssets.listTextureIdsByUsage('sprite');

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

  onSkyNumber(
    key:
      | 'sunAngularDiameterDeg'
      | 'exposure'
      | 'lutBlend'
      | 'reflectionLevel'
      | 'skyViewSamples'
      | 'transmittanceSamples'
      | 'nightExposure'
      | 'moonAngularDiameterDeg'
      | 'moonExposure'
      | 'nightBlendStrength',
    raw: string,
  ): void {
    const v = Number(raw);
    if (!Number.isFinite(v)) return;
    this.editor.patchAtmosphere({ [key]: v });
  }

  onSkyGroundColor(rgb: readonly [number, number, number]): void {
    this.editor.patchAtmosphere({
      skyboxGroundColor: [rgb[0], rgb[1], rgb[2]],
    });
  }

  onSkyEquatorColor(rgb: readonly [number, number, number]): void {
    this.editor.patchAtmosphere({
      skyboxEquatorColor: [rgb[0], rgb[1], rgb[2]],
    });
  }

  customHintKey(): LocaleKey {
    return 'hintQualityCustom';
  }

  skyboxLabel(id: string): string {
    return studioAssets.getSkybox(id)?.label ?? id;
  }

  textureLabel(id: string): string {
    return studioAssets.getTexture(id)?.label ?? id;
  }

  onSkyboxAsset(raw: string): void {
    const skyboxAssetId = raw.trim() ? raw.trim() : null;
    this.editor.patchAtmosphere({
      skyboxAssetId,
      ...(skyboxAssetId ? { enabled: false } : {}),
    });
  }

  onNightSkyTexture(raw: string): void {
    const id = raw.trim();
    if (!id) return;
    this.editor.patchAtmosphere({ nightSkyTextureId: id });
  }

  onMoonTexture(raw: string): void {
    const id = raw.trim();
    if (!id) return;
    this.editor.patchAtmosphere({ moonTextureId: id });
  }
}
