import { Component, computed, inject } from '@angular/core';
import { resolveSceneAmbientLevel } from '@engine';
import { EditorFacade } from '../../../../core/services/editor-facade.service';
import { EngineHostService } from '../../../../core/services/engine-host.service';
import { LocalizationService } from '../../../../core/services/localization.service';
import { DisplayResponseCurveComponent } from '../../fields/display-response-curve/display-response-curve.component';

@Component({
  selector: 'app-vision-settings-panel',
  standalone: true,
  imports: [DisplayResponseCurveComponent],
  templateUrl: './vision-settings-panel.component.html',
  styleUrl: './vision-settings-panel.component.scss',
})
export class VisionSettingsPanelComponent {
  readonly editor = inject(EditorFacade);
  readonly engine = inject(EngineHostService);
  readonly l10n = inject(LocalizationService);

  /** SPA-derived ambient when sky ON; stored ambient when lab. */
  readonly visionAmbientLevel = computed(() =>
    resolveSceneAmbientLevel(this.editor.ambientLevel(), this.editor.atmosphere()),
  );

  readonly autoExposure = computed(() => {
    void this.engine.atmosphereRevision();
    void this.editor.atmosphere().enabled;
    return this.engine.presenterAutoExposure();
  });
}
