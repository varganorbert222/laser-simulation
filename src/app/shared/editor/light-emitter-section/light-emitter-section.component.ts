import { Component, effect, input, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import {
  ALL_LIGHT_MODES,
  clampIntensityLm,
  clampSpill01,
  defaultModeParams,
  formatPowerW,
  isSpectralLightMode,
  normalizeLaserParams,
  normalizeOpticsSpill,
  normalizeSunParams,
  POWER_UNITS,
  powerFromUnit,
  powerToUnit,
  powerWFromSliderT,
  sliderTFromPowerW,
  suggestPowerUnit,
  type LightEmitter,
  type LightHdrAppearance,
  type LightMode,
  type PowerUnit,
} from '../../../../engine';
import { EditorFacade } from '../../../core/services/editor-facade.service';
import { LocalizationService } from '../../../core/services/localization.service';
import { SpectralColorFieldComponent } from '../spectral-color-field/spectral-color-field.component';
import { HdrColorFieldComponent } from '../hdr-color-field/hdr-color-field.component';

@Component({
  selector: 'app-light-emitter-section',
  standalone: true,
  imports: [DecimalPipe, SpectralColorFieldComponent, HdrColorFieldComponent],
  templateUrl: './light-emitter-section.component.html',
  styleUrl: './light-emitter-section.component.scss',
})
export class LightEmitterSectionComponent {
  readonly light = input.required<LightEmitter>();
  readonly editor = inject(EditorFacade);
  readonly l10n = inject(LocalizationService);
  readonly powerUnits = POWER_UNITS;
  readonly lightModes = ALL_LIGHT_MODES;
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

  isLaser(): boolean {
    return isSpectralLightMode(this.light().params.mode);
  }

  modeLabel(mode: LightMode): string {
    switch (mode) {
      case 'laser':
        return this.l10n.t('modeLaser');
      case 'flashlight':
        return this.l10n.t('modeFlashlight');
      case 'spotlight':
        return this.l10n.t('modeSpotlight');
      case 'omni_lamp':
        return this.l10n.t('modeOmni');
      case 'parallel':
        return this.l10n.t('modeParallel');
      case 'sun':
        return this.l10n.t('modeSun');
    }
  }

  onMode(raw: string): void {
    if (!this.lightModes.includes(raw as LightMode)) return;
    this.editor.setLightMode(raw as LightMode);
  }

  onWavelength(nm: number): void {
    if (Number.isFinite(nm)) this.editor.setWavelength(nm);
  }

  onHdrAppearance(patch: Partial<LightHdrAppearance>): void {
    this.editor.updateLight(patch, { coalesce: true });
  }

  intensitySliderT(): number {
    // Log-ish map 1 lm … 1e6 lm → 0…1
    const lm = Math.max(1, this.light().intensityLm);
    return Math.min(1, Math.max(0, Math.log10(lm) / 6));
  }

  onIntensityNumber(raw: string): void {
    const n = Number(raw);
    if (!Number.isFinite(n)) return;
    this.editor.setIntensityLm(clampIntensityLm(n));
  }

  onIntensitySlider(raw: string): void {
    const t = Number(raw);
    if (!Number.isFinite(t)) return;
    const lm = Math.pow(10, Math.min(1, Math.max(0, t)) * 6);
    this.editor.setIntensityLm(clampIntensityLm(lm));
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

  laserProbeDistance(): number {
    const p = this.light().params;
    return p.mode === 'laser' ? p.laser.probeDistanceM : 5;
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
      | 'probeDistanceM'
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
    const laser = normalizeLaserParams({ ...light.params.laser, [key]: n });
    this.editor.updateLight(
      { params: { mode: 'laser', laser } },
      { coalesce: true },
    );
  }

  spotInner(): number {
    const p = this.light().params;
    return p.mode === 'spotlight' || p.mode === 'flashlight' ? p.spot.innerConeDeg : 8;
  }

  spotOuter(): number {
    const p = this.light().params;
    return p.mode === 'spotlight' || p.mode === 'flashlight' ? p.spot.outerConeDeg : 18;
  }

  spotSharpness(): number {
    const p = this.light().params;
    return p.mode === 'spotlight' || p.mode === 'flashlight' ? p.spot.apertureSharpness : 4;
  }

  onSpotParam(key: 'innerConeDeg' | 'outerConeDeg' | 'apertureSharpness', value: string): void {
    const light = this.light();
    if (light.params.mode !== 'spotlight' && light.params.mode !== 'flashlight') return;
    const n = Number(value);
    if (!Number.isFinite(n)) return;
    const mode = light.params.mode;
    const defaults = defaultModeParams(mode);
    const spotBase =
      defaults.mode === 'spotlight' || defaults.mode === 'flashlight'
        ? defaults.spot
        : { innerConeDeg: 8, outerConeDeg: 18, apertureSharpness: 4 };
    const spot = { ...spotBase, ...light.params.spot, [key]: n };
    this.editor.updateLight({ params: { mode, spot } }, { coalesce: true });
  }

  omniSoftRadius(): number {
    const p = this.light().params;
    return p.mode === 'omni_lamp' ? p.omni.softRadiusM : 0.35;
  }

  omniFalloff(): number {
    const p = this.light().params;
    return p.mode === 'omni_lamp' ? p.omni.falloff : 2;
  }

  onOmniParam(key: 'softRadiusM' | 'falloff', value: string): void {
    const light = this.light();
    if (light.params.mode !== 'omni_lamp') return;
    const n = Number(value);
    if (!Number.isFinite(n)) return;
    this.editor.updateLight(
      { params: { mode: 'omni_lamp', omni: { ...light.params.omni, [key]: n } } },
      { coalesce: true },
    );
  }

  parallelRadius(): number {
    const p = this.light().params;
    return p.mode === 'parallel' ? p.parallel.beamRadiusM : 0.04;
  }

  parallelResidual(): number {
    const p = this.light().params;
    return p.mode === 'parallel' ? p.parallel.residualMrad : 1;
  }

  onParallelParam(key: 'beamRadiusM' | 'residualMrad', value: string): void {
    const light = this.light();
    if (light.params.mode !== 'parallel') return;
    const n = Number(value);
    if (!Number.isFinite(n)) return;
    this.editor.updateLight(
      {
        params: {
          mode: 'parallel',
          parallel: { ...light.params.parallel, [key]: n },
        },
      },
      { coalesce: true },
    );
  }

  sunAngularDiameter(): number {
    const p = this.light().params;
    return p.mode === 'sun' ? p.sun.angularDiameterDeg : 0.53;
  }

  onSunAngularDiameter(value: string): void {
    const light = this.light();
    if (light.params.mode !== 'sun') return;
    const n = Number(value);
    if (!Number.isFinite(n)) return;
    this.editor.updateLight(
      {
        params: {
          mode: 'sun',
          sun: normalizeSunParams({ ...light.params.sun, angularDiameterDeg: n }),
        },
      },
      { coalesce: true },
    );
  }

  formatPower(w: number): string {
    return formatPowerW(w);
  }
}
