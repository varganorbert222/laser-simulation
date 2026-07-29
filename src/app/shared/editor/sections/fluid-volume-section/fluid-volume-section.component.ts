import { Component, inject, input } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import {
  FLUID_WALL_MODES,
  WATER_PRESET_IDS,
  applyWaterPreset,
  fluidParticleCount,
  surfaceMaterialForFluidWall,
  type FluidVolume,
  type FluidWallMode,
  type Vec3Editable,
  type WaterPresetId,
} from '@engine';
import { EditorFacade } from '../../../../core/services/editor-facade.service';
import { LocalizationService } from '../../../../core/services/localization.service';
import { ColorFieldComponent } from '../../fields/color-field/color-field.component';
import { Vec3FieldComponent } from '../../fields/vec3-field/vec3-field.component';

@Component({
  selector: 'app-fluid-volume-section',
  standalone: true,
  imports: [DecimalPipe, ColorFieldComponent, Vec3FieldComponent],
  templateUrl: './fluid-volume-section.component.html',
  styleUrl: './fluid-volume-section.component.scss',
})
export class FluidVolumeSectionComponent {
  readonly fluid = input.required<FluidVolume>();
  readonly targetIds = input<readonly string[]>([]);
  readonly editor = inject(EditorFacade);
  readonly l10n = inject(LocalizationService);
  readonly presetIds = WATER_PRESET_IDS;
  readonly wallModes = FLUID_WALL_MODES;

  private patchOpts(coalesce?: boolean): { coalesce?: boolean; entityIds?: readonly string[] } {
    const ids = this.targetIds();
    return {
      coalesce,
      ...(ids.length ? { entityIds: ids } : {}),
    };
  }

  halfExtentsVec(): Vec3Editable {
    const [x, y, z] = this.fluid().halfExtents;
    return { x, y, z };
  }

  /** Derived from fillFraction × tank volume / particle packing (invisible SPH). */
  derivedParticleCount(): number {
    return fluidParticleCount(this.fluid());
  }

  onEnabled(checked: boolean): void {
    this.editor.updateFluid({ enabled: checked }, this.patchOpts());
  }

  onPreset(presetId: WaterPresetId): void {
    if (presetId === this.fluid().presetId) return;
    if (presetId === 'custom') {
      this.editor.updateFluid({ presetId: 'custom' }, this.patchOpts());
      return;
    }
    const p = applyWaterPreset(presetId);
    this.editor.updateFluid(
      {
        presetId,
        ior: p.ior,
        opticalDensity: p.opticalDensity,
        color: [...p.color] as FluidVolume['color'],
        scatter: p.scatter,
        absorption: p.absorption,
        causticStrength: p.causticStrength,
        foamStrength: p.foamStrength,
        waveAmplitude: p.waveAmplitude,
        waveFrequency: p.waveFrequency,
        waveSteepness: p.waveSteepness,
        ...(typeof p.fillFraction === 'number' ? { fillFraction: p.fillFraction } : {}),
      },
      this.patchOpts(),
    );
  }

  presetLabel(id: WaterPresetId): string {
    switch (id) {
      case 'aquarium':
        return this.l10n.t('waterPresetAquarium');
      case 'lake':
        return this.l10n.t('waterPresetLake');
      case 'sea':
        return this.l10n.t('waterPresetSea');
      default:
        return this.l10n.t('waterPresetCustom');
    }
  }

  wallModeLabel(mode: FluidWallMode): string {
    switch (mode) {
      case 'glass':
        return this.l10n.t('fluidWallGlass');
      case 'solid':
        return this.l10n.t('fluidWallSolid');
      default:
        return this.l10n.t('fluidWallNone');
    }
  }

  onWallMode(mode: FluidWallMode): void {
    if (mode === this.fluid().wallMode) return;
    this.editor.updateFluid({ wallMode: mode }, this.patchOpts());
    const sm = surfaceMaterialForFluidWall(mode);
    if (sm) {
      this.editor.updateSurfaceMaterial(sm, this.patchOpts());
    }
  }

  onColor(rgb: [number, number, number]): void {
    this.editor.updateFluid({ color: rgb, presetId: 'custom' }, this.patchOpts(true));
  }

  onHalfExtents(v: Vec3Editable): void {
    this.editor.updateFluid(
      {
        halfExtents: [Math.max(0.05, v.x), Math.max(0.05, v.y), Math.max(0.05, v.z)],
      },
      this.patchOpts(true),
    );
  }

  onNumber(
    key:
      | 'fillFraction'
      | 'particleRadius'
      | 'stiffness'
      | 'viscosity'
      | 'opticalDensity'
      | 'scatter'
      | 'absorption'
      | 'ior'
      | 'causticStrength'
      | 'waveAmplitude'
      | 'waveFrequency'
      | 'waveSteepness'
      | 'inertiaCoupling',
    value: string,
  ): void {
    const n = Number(value);
    if (!Number.isFinite(n)) return;
    const optics =
      key === 'opticalDensity' ||
      key === 'scatter' ||
      key === 'absorption' ||
      key === 'ior' ||
      key === 'causticStrength' ||
      key === 'waveAmplitude' ||
      key === 'waveFrequency' ||
      key === 'waveSteepness';
    this.editor.updateFluid(
      { [key]: n, ...(optics ? { presetId: 'custom' as const } : {}) },
      this.patchOpts(true),
    );
  }
}
