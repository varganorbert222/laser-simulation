import { Component, effect, input, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import {
  POWER_UNITS,
  clampSpill01,
  clampUnit,
  formatPowerW,
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

  onSpill(
    key: 'strayLight' | 'internalReflection' | 'apertureSpill',
    value: string,
  ): void {
    const v = Number(value);
    if (!Number.isFinite(v)) return;
    const spill = { ...this.light().spill, [key]: clampSpill01(v) };
    this.editor.updateLight({ spill }, { coalesce: true });
  }

  onGain(
    key: 'surfaceGain' | 'glowGain' | 'bloomGain',
    value: string,
  ): void {
    const n = Number(value);
    if (!Number.isFinite(n)) return;
    this.editor.updateLight({ [key]: Math.min(8, Math.max(0, n)) }, { coalesce: true });
  }

  onApertureCoupling(value: string): void {
    const n = Number(value);
    if (!Number.isFinite(n)) return;
    this.editor.updateLight({ apertureCoupling: clampUnit(n) }, { coalesce: true });
  }

  laserW0(): number {
    const p = this.light().params;
    return p.mode === 'laser' ? p.laser.w0M : 0;
  }

  onLaserW0(value: string): void {
    const light = this.light();
    if (light.params.mode !== 'laser') return;
    const w0 = Number(value);
    if (!Number.isFinite(w0)) return;
    this.editor.updateLight(
      { params: { mode: 'laser', laser: { ...light.params.laser, w0M: w0 } } },
      { coalesce: true },
    );
  }

  formatPower(w: number): string {
    return formatPowerW(w);
  }
}
