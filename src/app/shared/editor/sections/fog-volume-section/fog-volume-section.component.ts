import { Component, inject, input } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { type FogVolume, type Vec3Editable } from '@engine';
import { EditorFacade } from '../../../../core/services/editor-facade.service';
import { LocalizationService } from '../../../../core/services/localization.service';
import { ColorFieldComponent } from '../../fields/color-field/color-field.component';
import { Vec3FieldComponent } from '../../fields/vec3-field/vec3-field.component';

@Component({
  selector: 'app-fog-volume-section',
  standalone: true,
  imports: [DecimalPipe, ColorFieldComponent, Vec3FieldComponent],
  templateUrl: './fog-volume-section.component.html',
  styleUrl: './fog-volume-section.component.scss',
})
export class FogVolumeSectionComponent {
  readonly fog = input.required<FogVolume>();
  readonly targetIds = input<readonly string[]>([]);
  readonly editor = inject(EditorFacade);
  readonly l10n = inject(LocalizationService);

  private patchOpts(coalesce?: boolean): { coalesce?: boolean; entityIds?: readonly string[] } {
    const ids = this.targetIds();
    return {
      coalesce,
      ...(ids.length ? { entityIds: ids } : {}),
    };
  }

  halfExtentsVec(): Vec3Editable {
    const [x, y, z] = this.fog().halfExtents;
    return { x, y, z };
  }

  onEnabled(checked: boolean): void {
    this.editor.updateFog({ enabled: checked }, this.patchOpts());
  }

  onColor(rgb: [number, number, number]): void {
    this.editor.updateFog({ color: rgb }, this.patchOpts(true));
  }

  onHalfExtents(v: Vec3Editable): void {
    this.editor.updateFog(
      {
        halfExtents: [Math.max(0.05, v.x), Math.max(0.05, v.y), Math.max(0.05, v.z)],
      },
      this.patchOpts(true),
    );
  }

  onBoundaryMode(mode: FogVolume['boundaryMode']): void {
    this.editor.updateFog({ boundaryMode: mode }, this.patchOpts());
  }

  onNumber(
    key:
      | 'viscosity'
      | 'dissipation'
      | 'buoyancy'
      | 'vorticityStrength'
      | 'emissionRate'
      | 'opticalDensity'
      | 'scatter'
      | 'absorption'
      | 'maxDensity'
      | 'boundaryPad'
      | 'windCoupling'
      | 'inertiaCoupling',
    value: string,
  ): void {
    const n = Number(value);
    if (!Number.isFinite(n)) return;
    this.editor.updateFog({ [key]: n }, this.patchOpts(true));
  }
}
