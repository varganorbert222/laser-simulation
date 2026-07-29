import { DecimalPipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import {
  MAX_FLARE_ELEMENTS,
  QUALITY_LADDER_ORDER,
  type LensFlareElementKind,
  type LensFlareGroupTune,
  type QualityLadder,
  type QualityPresetSelection,
  type Vec3,
} from '@engine';
import { EditorFacade } from '../../../../core/services/editor-facade.service';
import { LocalizationService } from '../../../../core/services/localization.service';
import type { LocaleKey } from '../../../../i18n/messages';
import { ColorFieldComponent } from '../../fields/color-field/color-field.component';

type FlareSliderKey = Exclude<keyof LensFlareGroupTune, 'enabled'>;

@Component({
  selector: 'app-presentation-settings-panel',
  standalone: true,
  imports: [DecimalPipe, ColorFieldComponent],
  templateUrl: './presentation-settings-panel.component.html',
  styleUrl: './presentation-settings-panel.component.scss',
})
export class PresentationSettingsPanelComponent {
  readonly editor = inject(EditorFacade);
  readonly l10n = inject(LocalizationService);
  readonly ladder = QUALITY_LADDER_ORDER;
  readonly maxElements = MAX_FLARE_ELEMENTS;

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

  onOpticsSlider(key: 'chromatic' | 'dirt', value: string): void {
    const n = Number(value);
    if (!Number.isFinite(n)) return;
    this.editor.patchLensFlareOptics({ [key]: n });
  }

  addElement(kind: LensFlareElementKind): void {
    this.editor.addLensFlareElement(kind);
  }

  removeElement(index: number): void {
    this.editor.removeLensFlareElement(index);
  }

  moveElement(from: number, delta: -1 | 1): void {
    this.editor.moveLensFlareElement(from, from + delta);
  }

  onElementKind(index: number, raw: string): void {
    if (raw !== 'ghost' && raw !== 'streak' && raw !== 'halo') return;
    this.editor.patchLensFlareElement(index, { kind: raw });
  }

  onElementColor(index: number, rgb: Vec3): void {
    this.editor.patchLensFlareElement(index, { color: rgb });
  }

  onElementSlider(
    index: number,
    key: 'size' | 'axis' | 'weight',
    value: string,
  ): void {
    const n = Number(value);
    if (!Number.isFinite(n)) return;
    this.editor.patchLensFlareElement(index, { [key]: n });
  }

  kindLabel(kind: LensFlareElementKind): string {
    if (kind === 'streak') return this.l10n.t('flareKindStreak');
    if (kind === 'halo') return this.l10n.t('flareKindHalo');
    return this.l10n.t('flareKindGhost');
  }

  canAddElement(): boolean {
    const n = this.editor.qualitySettings().lensFlareOptics.elements.length;
    return n < this.maxElements;
  }

  customHintKey(): LocaleKey {
    return 'hintQualityCustom';
  }
}
