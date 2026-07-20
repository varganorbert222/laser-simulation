import { Component, input, inject } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import {
  SCATTER_MODELS,
  clampMieAnisotropy,
  clampParticleSizeNm,
  defaultMieAnisotropy,
  defaultParticleSizeNm,
  type MediaKind,
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
  readonly mediaKinds: MediaKind[] = ['fog', 'smoke', 'dust'];
  readonly scatterModels = SCATTER_MODELS;

  halfExtentsVec(): Vec3Editable {
    const [x, y, z] = this.media().halfExtents;
    return { x, y, z };
  }

  onDensity(value: string): void {
    const d = Number(value);
    if (Number.isFinite(d)) this.editor.setMediaDensity(d);
  }

  onMediaKind(value: string): void {
    if (value === 'fog' || value === 'smoke' || value === 'dust') {
      this.editor.updateMedia({ kind: value });
    }
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
    const model = value as ScatterModel;
    const particleSizeNm = defaultParticleSizeNm(model);
    this.editor.updateMedia({
      scatterModel: model,
      particleSizeNm,
      mieAnisotropy: defaultMieAnisotropy(model, particleSizeNm),
    });
  }

  onParticleSize(value: string): void {
    const n = Number(value);
    if (!Number.isFinite(n)) return;
    const particleSizeNm = clampParticleSizeNm(n);
    this.editor.updateMedia(
      {
        particleSizeNm,
        mieAnisotropy: defaultMieAnisotropy(this.media().scatterModel, particleSizeNm),
      },
      { coalesce: true },
    );
  }

  onMieAnisotropy(value: string): void {
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
    const n = Number(value);
    if (!Number.isFinite(n)) return;
    this.editor.updateMedia({ [key]: n }, { coalesce: true });
  }
}
