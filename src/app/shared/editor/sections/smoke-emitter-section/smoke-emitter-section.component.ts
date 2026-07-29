import { Component, input, inject } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import {
  SMOKE_CONE_ANGLE_DEG_MAX,
  SMOKE_CONE_ANGLE_DEG_MIN,
  SMOKE_EMISSION_RATE_MAX,
  SMOKE_EMISSION_RATE_MIN,
  SMOKE_PLUME_LENGTH_M_MAX,
  SMOKE_PLUME_LENGTH_M_MIN,
  type SmokeEmitter,
} from '@engine';
import { EditorFacade } from '../../../../core/services/editor-facade.service';
import { LocalizationService } from '../../../../core/services/localization.service';

@Component({
  selector: 'app-smoke-emitter-section',
  standalone: true,
  imports: [DecimalPipe],
  templateUrl: './smoke-emitter-section.component.html',
  styleUrl: './smoke-emitter-section.component.scss',
})
export class SmokeEmitterSectionComponent {
  readonly smoke = input.required<SmokeEmitter>();
  readonly targetIds = input<readonly string[]>([]);
  readonly editor = inject(EditorFacade);
  readonly l10n = inject(LocalizationService);

  readonly emissionMin = SMOKE_EMISSION_RATE_MIN;
  readonly emissionMax = SMOKE_EMISSION_RATE_MAX;
  readonly coneMin = SMOKE_CONE_ANGLE_DEG_MIN;
  readonly coneMax = SMOKE_CONE_ANGLE_DEG_MAX;
  readonly lengthMin = SMOKE_PLUME_LENGTH_M_MIN;
  readonly lengthMax = SMOKE_PLUME_LENGTH_M_MAX;

  private patchOpts(coalesce?: boolean): { coalesce?: boolean; entityIds?: readonly string[] } {
    const ids = this.targetIds();
    return {
      coalesce,
      ...(ids.length ? { entityIds: ids } : {}),
    };
  }

  onEnabled(checked: boolean): void {
    this.editor.updateSmoke({ enabled: checked }, this.patchOpts());
  }

  onEmission(value: string): void {
    const n = Number(value);
    if (!Number.isFinite(n)) return;
    this.editor.updateSmoke({ emissionRate: n }, this.patchOpts(true));
  }

  onCone(value: string): void {
    const n = Number(value);
    if (!Number.isFinite(n)) return;
    this.editor.updateSmoke({ coneAngleDeg: n }, this.patchOpts(true));
  }

  onPlumeLength(value: string): void {
    const n = Number(value);
    if (!Number.isFinite(n)) return;
    this.editor.updateSmoke({ plumeLengthM: n }, this.patchOpts(true));
  }
}
