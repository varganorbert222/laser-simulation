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
} from '@engine';
import { EditorFacade } from '../../../../core/services/editor-facade.service';
import { LocalizationService } from '../../../../core/services/localization.service';
import { NoiseVolumeService } from '../../../../core/editor/noise-volume.service';
import { ColorFieldComponent } from '../../fields/color-field/color-field.component';
import { Vec3FieldComponent } from '../../fields/vec3-field/vec3-field.component';

@Component({
  selector: 'app-media-volume-section',
  standalone: true,
  imports: [DecimalPipe, ColorFieldComponent, Vec3FieldComponent],
  templateUrl: './media-volume-section.component.html',
  styleUrl: './media-volume-section.component.scss',
})
export class MediaVolumeSectionComponent {
  readonly media = input.required<MediaVolume>();
  readonly targetIds = input<readonly string[]>([]);
  readonly editor = inject(EditorFacade);
  readonly l10n = inject(LocalizationService);
  readonly noiseLibrary = inject(NoiseVolumeService);
  readonly mediaLayers = MEDIA_LAYERS;
  readonly scatterModels = SCATTER_MODELS;
  readonly rayleighParticleNmMax = RAYLEIGH_PARTICLE_NM_MAX;
  readonly tyndallParticleNmMin = TYNDALL_PARTICLE_NM_MIN;
  readonly tyndallParticleNmMax = TYNDALL_PARTICLE_NM_MAX;
  readonly rhMin = RELATIVE_HUMIDITY_MIN;
  readonly rhMax = RELATIVE_HUMIDITY_MAX;
  readonly tempMin = TEMPERATURE_C_MIN;
  readonly tempMax = TEMPERATURE_C_MAX;

  private patchOpts(coalesce?: boolean): { coalesce?: boolean; entityIds?: readonly string[] } {
    const ids = this.targetIds();
    return {
      coalesce,
      ...(ids.length ? { entityIds: ids } : {}),
    };
  }

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
        return this.l10n.t('mediaLayerOutdoor');
      case 'interior':
        return this.l10n.t('mediaLayerInterior');
      case 'particulate':
        return this.l10n.t('mediaLayerParticulate');
    }
  }

  presetLabel(preset: MediaPresetId | MediaKind): string {
    switch (preset) {
      case 'clearNight':
        return this.l10n.t('mediaPresetClearNight');
      case 'clearDay':
        return this.l10n.t('mediaPresetClearDay');
      case 'spring':
        return this.l10n.t('mediaPresetSpring');
      case 'summerHumid':
        return this.l10n.t('mediaPresetSummerHumid');
      case 'autumnMist':
        return this.l10n.t('mediaPresetAutumnMist');
      case 'winterDry':
        return this.l10n.t('mediaPresetWinterDry');
      case 'room':
        return this.l10n.t('mediaPresetRoom');
      case 'lab':
        return this.l10n.t('mediaPresetLab');
      case 'hall':
        return this.l10n.t('mediaPresetHall');
      case 'fog':
        return this.l10n.t('mediaPresetFog');
      case 'smoke':
        return this.l10n.t('mediaPresetSmoke');
      case 'dust':
        return this.l10n.t('mediaPresetDust');
      case 'haze':
        return this.l10n.t('mediaPresetHaze');
      case 'cloud':
        return this.l10n.t('mediaPresetCloud');
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
        this.patchOpts(true),
      );
      return;
    }
    this.editor.updateMedia({ density: d }, this.patchOpts(true));
  }

  onMediaLayer(value: string): void {
    if (!isMediaLayer(value)) return;
    if (value === this.media().layer) return;
    const preset = defaultPresetForLayer(value);
    this.editor.updateMedia(opticalFieldsForMediaKind(preset), this.patchOpts());
  }

  onMediaPreset(value: string): void {
    if (!isMediaPresetId(value)) return;
    if (value === this.activePreset()) return;
    this.editor.updateMedia(opticalFieldsForMediaKind(value), this.patchOpts());
  }

  onMediaColor(rgb: [number, number, number]): void {
    this.editor.updateMedia({ color: rgb }, this.patchOpts(true));
  }

  onHalfExtents(v: Vec3Editable): void {
    const halfExtents: [number, number, number] = [
      Math.max(0.05, v.x),
      Math.max(0.05, v.y),
      Math.max(0.05, v.z),
    ];
    this.editor.updateMedia({ halfExtents }, this.patchOpts(true));
  }

  onScatterModel(value: string): void {
    if (value !== 'tyndall' && value !== 'rayleigh') return;
    if (value === this.media().scatterModel) return;
    this.editor.updateMedia(
      opticalFieldsForScatterModel(value, this.activePreset()),
      this.patchOpts(),
    );
  }

  onHumidity(value: string): void {
    const m = this.media();
    if (!isClimatePreset(this.activePreset())) return;
    const rh = clampRelativeHumidity(Number(value));
    this.editor.updateMedia(
      opticalFieldsFromClimate(this.activePreset(), rh, m.temperatureC, m.density),
      this.patchOpts(true),
    );
  }

  onTemperature(value: string): void {
    const m = this.media();
    if (!isClimatePreset(this.activePreset())) return;
    const temperatureC = clampTemperatureC(Number(value));
    this.editor.updateMedia(
      opticalFieldsFromClimate(this.activePreset(), m.relativeHumidity, temperatureC, m.density),
      this.patchOpts(true),
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
      this.patchOpts(true),
    );
  }

  onMieAnisotropy(value: string): void {
    if (this.isRayleigh() || this.isClimateAir()) return;
    const n = Number(value);
    if (!Number.isFinite(n)) return;
    this.editor.updateMedia({ mieAnisotropy: clampMieAnisotropy(n) }, this.patchOpts(true));
  }

  scatterModelLabel(model: ScatterModel): string {
    return model === 'tyndall'
      ? this.l10n.t('scatterModelTyndall')
      : this.l10n.t('scatterModelRayleigh');
  }

  onNoiseAsset(raw: string): void {
    const noiseAssetId = raw.trim() ? raw.trim() : null;
    if (noiseAssetId === this.media().noiseAssetId) return;
    this.editor.updateMedia({ noiseAssetId }, this.patchOpts());
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
    this.editor.updateMedia({ [key]: n }, this.patchOpts(true));
  }
}
