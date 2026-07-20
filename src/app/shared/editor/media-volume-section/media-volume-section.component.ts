import { Component, input, inject } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import {
  MEDIA_LAYERS,
  RAYLEIGH_PARTICLE_NM_MAX,
  RELATIVE_HUMIDITY_MAX,
  RELATIVE_HUMIDITY_MIN,
  SCATTER_MODELS,
  TEMPERATURE_C_MAX,
  TEMPERATURE_C_MIN,
  TYNDALL_PARTICLE_NM_MIN,
  TYNDALL_PARTICLE_NM_MAX,
  clampMieAnisotropy,
  clampParticleSizeForModel,
  clampRelativeHumidity,
  clampTemperatureC,
  defaultMieAnisotropy,
  defaultPresetForLayer,
  isClimatePreset,
  isMediaLayer,
  isMediaPresetId,
  opticalFieldsForMediaKind,
  opticalFieldsForScatterModel,
  opticalFieldsFromClimate,
  presetsForLayer,
  type MediaKind,
  type MediaLayer,
  type MediaPresetId,
  type MediaVolume,
  type ScatterModel,
  type Vec3Editable,
} from '../../../../engine';
import { EditorFacade } from '../../../core/services/editor-facade.service';
import { I18nService } from '../../../i18n/i18n.service';
import { ColorFieldComponent } from '../color-field/color-field.component';
import { Vec3FieldComponent } from '../vec3-field/vec3-field.component';

@Component({
  selector: 'app-media-volume-section',
  standalone: true,
  imports: [DecimalPipe, ColorFieldComponent, Vec3FieldComponent],
  templateUrl: './media-volume-section.component.html',
  styleUrl: './media-volume-section.component.scss',
})
export class MediaVolumeSectionComponent {
  readonly media = input.required<MediaVolume>();
  readonly editor = inject(EditorFacade);
  readonly i18n = inject(I18nService);
  readonly mediaLayers = MEDIA_LAYERS;
  readonly scatterModels = SCATTER_MODELS;
  readonly rayleighParticleNmMax = RAYLEIGH_PARTICLE_NM_MAX;
  readonly tyndallParticleNmMin = TYNDALL_PARTICLE_NM_MIN;
  readonly tyndallParticleNmMax = TYNDALL_PARTICLE_NM_MAX;
  readonly rhMin = RELATIVE_HUMIDITY_MIN;
  readonly rhMax = RELATIVE_HUMIDITY_MAX;
  readonly tempMin = TEMPERATURE_C_MIN;
  readonly tempMax = TEMPERATURE_C_MAX;

  halfExtentsVec(): Vec3Editable {
    const [x, y, z] = this.media().halfExtents;
    return { x, y, z };
  }

  activePreset(): MediaPresetId {
    const m = this.media();
    return isMediaPresetId(m.preset) ? m.preset : (m.kind as MediaPresetId);
  }

  presetsForCurrentLayer(): MediaPresetId[] {
    return presetsForLayer(this.media().layer);
  }

  isClimateAir(): boolean {
    return isClimatePreset(this.activePreset());
  }

  isRayleigh(): boolean {
    return this.media().scatterModel === 'rayleigh' && !this.isClimateAir();
  }

  particleSizeMin(): number {
    return this.isRayleigh() ? 0.1 : this.tyndallParticleNmMin;
  }

  particleSizeMax(): number {
    return this.isRayleigh() ? this.rayleighParticleNmMax : this.tyndallParticleNmMax;
  }

  layerLabel(layer: MediaLayer): string {
    switch (layer) {
      case 'outdoor':
        return this.i18n.t('mediaLayerOutdoor');
      case 'interior':
        return this.i18n.t('mediaLayerInterior');
      case 'particulate':
        return this.i18n.t('mediaLayerParticulate');
    }
  }

  presetLabel(preset: MediaPresetId | MediaKind): string {
    switch (preset) {
      case 'clearNight':
        return this.i18n.t('mediaPresetClearNight');
      case 'clearDay':
        return this.i18n.t('mediaPresetClearDay');
      case 'spring':
        return this.i18n.t('mediaPresetSpring');
      case 'summerHumid':
        return this.i18n.t('mediaPresetSummerHumid');
      case 'autumnMist':
        return this.i18n.t('mediaPresetAutumnMist');
      case 'winterDry':
        return this.i18n.t('mediaPresetWinterDry');
      case 'room':
        return this.i18n.t('mediaPresetRoom');
      case 'lab':
        return this.i18n.t('mediaPresetLab');
      case 'hall':
        return this.i18n.t('mediaPresetHall');
      case 'fog':
        return this.i18n.t('mediaPresetFog');
      case 'smoke':
        return this.i18n.t('mediaPresetSmoke');
      case 'dust':
        return this.i18n.t('mediaPresetDust');
      case 'haze':
        return this.i18n.t('mediaPresetHaze');
      default:
        return String(preset);
    }
  }

  onDensity(value: string): void {
    const d = Number(value);
    if (!Number.isFinite(d)) return;
    const m = this.media();
    if (isClimatePreset(this.activePreset())) {
      this.editor.updateMedia(
        opticalFieldsFromClimate(this.activePreset(), m.relativeHumidity, m.temperatureC, d),
        { coalesce: true },
      );
      return;
    }
    this.editor.setMediaDensity(d);
  }

  onMediaLayer(value: string): void {
    if (!isMediaLayer(value)) return;
    const preset = defaultPresetForLayer(value);
    this.editor.updateMedia(opticalFieldsForMediaKind(preset));
  }

  onMediaPreset(value: string): void {
    if (!isMediaPresetId(value)) return;
    this.editor.updateMedia(opticalFieldsForMediaKind(value));
  }

  onMediaColor(rgb: [number, number, number]): void {
    this.editor.updateMedia({ color: rgb }, { coalesce: true });
  }

  onHalfExtents(v: Vec3Editable): void {
    const halfExtents: [number, number, number] = [
      Math.max(0.05, v.x),
      Math.max(0.05, v.y),
      Math.max(0.05, v.z),
    ];
    this.editor.updateMedia({ halfExtents }, { coalesce: true });
  }

  onScatterModel(value: string): void {
    if (value !== 'tyndall' && value !== 'rayleigh') return;
    this.editor.updateMedia(
      opticalFieldsForScatterModel(value, this.activePreset()),
    );
  }

  onHumidity(value: string): void {
    const m = this.media();
    if (!isClimatePreset(this.activePreset())) return;
    const rh = clampRelativeHumidity(Number(value));
    this.editor.updateMedia(
      opticalFieldsFromClimate(this.activePreset(), rh, m.temperatureC, m.density),
      { coalesce: true },
    );
  }

  onTemperature(value: string): void {
    const m = this.media();
    if (!isClimatePreset(this.activePreset())) return;
    const temperatureC = clampTemperatureC(Number(value));
    this.editor.updateMedia(
      opticalFieldsFromClimate(this.activePreset(), m.relativeHumidity, temperatureC, m.density),
      { coalesce: true },
    );
  }

  onParticleSize(value: string): void {
    if (this.isClimateAir()) return;
    const n = Number(value);
    if (!Number.isFinite(n)) return;
    const model = this.media().scatterModel;
    const particleSizeNm = clampParticleSizeForModel(model, n);
    this.editor.updateMedia(
      {
        particleSizeNm,
        mieAnisotropy: defaultMieAnisotropy(model, particleSizeNm),
      },
      { coalesce: true },
    );
  }

  onMieAnisotropy(value: string): void {
    if (this.isRayleigh() || this.isClimateAir()) return;
    const n = Number(value);
    if (!Number.isFinite(n)) return;
    this.editor.updateMedia({ mieAnisotropy: clampMieAnisotropy(n) }, { coalesce: true });
  }

  scatterModelLabel(model: ScatterModel): string {
    return model === 'tyndall'
      ? this.i18n.t('scatterModelTyndall')
      : this.i18n.t('scatterModelRayleigh');
  }

  onMediaNumber(
    key:
      | 'fbmScale'
      | 'fbmTimeScale'
      | 'noiseThresholdLow'
      | 'noiseThresholdHigh'
      | 'scatter'
      | 'absorption',
    value: string,
  ): void {
    if (this.isClimateAir() && (key === 'scatter' || key === 'absorption')) return;
    const n = Number(value);
    if (!Number.isFinite(n)) return;
    this.editor.updateMedia({ [key]: n }, { coalesce: true });
  }
}
