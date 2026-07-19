import { Component, effect, input, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import {
  clampSpill01,
  formatPowerW,
  normalizeOpticsSpill,
  POWER_UNITS,
  powerFromUnit,
  powerToUnit,
  powerWFromSliderT,
  sliderTFromPowerW,
  suggestPowerUnit,
  type LightEmitter,
  type PowerUnit,
} from '../../../../engine';
import { EditorFacade } from '../../../core/services/editor-facade.service';
import { I18nService } from '../../../i18n/i18n.service';
import { SpectralColorFieldComponent } from '../spectral-color-field/spectral-color-field.component';

@Component({
  selector: 'app-light-emitter-section',
  standalone: true,
  imports: [DecimalPipe, SpectralColorFieldComponent],
  templateUrl: './light-emitter-section.component.html',
  styleUrl: './light-emitter-section.component.scss',
})
export class LightEmitterSectionComponent {
  readonly light = input.required<LightEmitter>();
  readonly editor = inject(EditorFacade);
  readonly i18n = inject(I18nService);
  readonly powerUnits = POWER_UNITS;
  readonly powerUnit = signal<PowerUnit>('W');
  private lastSelectionId: string | null = null;

  constructor() {
    effect(() => {
      const id = this.editor.selectedId();
      const light = this.light();
      if (id !== this.lastSelectionId) {
        this.lastSelectionId = id;
        this.powerUnit.set(suggestPowerUnit(light.powerW));
      }
    });
  }

  onWavelength(nm: number): void {
    if (Number.isFinite(nm)) this.editor.setWavelength(nm);
  }

  powerValueInUnit(): number {
    return powerToUnit(this.light().powerW, this.powerUnit());
  }

  powerSliderT(): number {
    return sliderTFromPowerW(this.light().powerW);
  }

  onPowerUnit(unit: string): void {
    if (unit === 'mW' || unit === 'W' || unit === 'kW') {
      this.powerUnit.set(unit);
    }
  }

  onPowerNumber(raw: string): void {
    const n = Number(raw);
    if (!Number.isFinite(n)) return;
    this.editor.setPower(powerFromUnit(n, this.powerUnit()));
  }

  onPowerSlider(raw: string): void {
    const t = Number(raw);
    if (!Number.isFinite(t)) return;
    this.editor.setPower(powerWFromSliderT(t));
  }

  strayPowerFraction(): number {
    return normalizeOpticsSpill(this.light().spill).strayPowerFraction;
  }

  onStrayPowerFraction(value: string): void {
    const v = Number(value);
    if (!Number.isFinite(v)) return;
    this.editor.updateLight(
      { spill: { strayPowerFraction: clampSpill01(v) } },
      { coalesce: true },
    );
  }

  laserW0(): number {
    const p = this.light().params;
    return p.mode === 'laser' ? p.laser.w0M : 0;
  }

  laserM2(): number {
    const p = this.light().params;
    return p.mode === 'laser' ? p.laser.m2 : 1;
  }

  laserElliptic(): number {
    const p = this.light().params;
    return p.mode === 'laser' ? p.laser.ellipticRatio : 1;
  }

  laserWaistOffset(): number {
    const p = this.light().params;
    return p.mode === 'laser' ? p.laser.waistOffsetM : 0;
  }

  laserTopHat(): number {
    const p = this.light().params;
    return p.mode === 'laser' ? p.laser.topHatMix : 0;
  }

  laserSpherical(): number {
    const p = this.light().params;
    return p.mode === 'laser' ? p.laser.sphericalAberration : 0;
  }

  laserComa(): number {
    const p = this.light().params;
    return p.mode === 'laser' ? p.laser.coma : 0;
  }

  laserAstig(): number {
    const p = this.light().params;
    return p.mode === 'laser' ? p.laser.astigmatism : 0;
  }

  onLaserW0(value: string): void {
    this.onLaserParam('w0M', value);
  }

  onLaserParam(
    key:
      | 'w0M'
      | 'm2'
      | 'ellipticRatio'
      | 'waistOffsetM'
      | 'topHatMix'
      | 'sphericalAberration'
      | 'coma'
      | 'astigmatism',
    value: string,
  ): void {
    const light = this.light();
    if (light.params.mode !== 'laser') return;
    const n = Number(value);
    if (!Number.isFinite(n)) return;
    this.editor.updateLight(
      { params: { mode: 'laser', laser: { ...light.params.laser, [key]: n } } },
      { coalesce: true },
    );
  }

  formatPower(w: number): string {
    return formatPowerW(w);
  }
}
