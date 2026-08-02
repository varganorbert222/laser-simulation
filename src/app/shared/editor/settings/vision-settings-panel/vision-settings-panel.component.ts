import { Component, computed, inject } from '@angular/core';
import {
  DEBUG_VIEW_MODES,
  listObserversByCategory,
  resolveObserver,
  type DebugViewMode,
  type ObserverCategory,
  type ObserverId,
  resolveSceneAmbientLevel,
} from '@engine';
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

  readonly observerGroups = listObserversByCategory({ selectableOnly: true });
  readonly debugModes = DEBUG_VIEW_MODES;

  /** SPA-derived ambient when sky ON; stored ambient when lab. */
  readonly visionAmbientLevel = computed(() =>
    resolveSceneAmbientLevel(this.editor.ambientLevel(), this.editor.atmosphere()),
  );

  readonly autoExposure = computed(() => {
    void this.engine.atmosphereRevision();
    void this.editor.atmosphere().enabled;
    return this.engine.presenterAutoExposure();
  });

  readonly observerStatusNote = computed((): 'hintObserverApproximated' | 'hintObserverGpuPending' | null => {
    const id = this.editor.activeObserverId();
    const resolved = resolveObserver(id);
    if (resolved.observer.approximationTag === 'approximated') return 'hintObserverApproximated';
    if (resolved.observer.status === 'ready') return null;
    return 'hintObserverGpuPending';
  });

  onObserverChange(raw: string): void {
    this.editor.setActiveObserverId(raw as ObserverId);
  }

  onDebugViewChange(raw: string): void {
    this.editor.setDebugViewMode(raw as DebugViewMode);
  }

  categoryLabel(category: ObserverCategory): string {
    const map: Record<ObserverCategory, 'observerCategoryHuman' | 'observerCategoryColourBlind' | 'observerCategoryCamera' | 'observerCategoryAnimal' | 'observerCategoryCustom'> = {
      human: 'observerCategoryHuman',
      'colour-blind': 'observerCategoryColourBlind',
      camera: 'observerCategoryCamera',
      animal: 'observerCategoryAnimal',
      custom: 'observerCategoryCustom',
    };
    return this.l10n.t(map[category]);
  }

  observerLabel(id: ObserverId, labelKey: string): string {
    const t = this.l10n.t(labelKey as 'observerHumanEye');
    return t === labelKey ? id : t;
  }

  debugLabel(mode: DebugViewMode): string {
    const map: Record<DebugViewMode, 'debugView_final' | 'debugView_radiance_rgb' | 'debugView_radiance_luminance' | 'debugView_radiance_split' | 'debugView_observer_bypass'> = {
      final: 'debugView_final',
      'radiance-rgb': 'debugView_radiance_rgb',
      'radiance-luminance': 'debugView_radiance_luminance',
      'radiance-split': 'debugView_radiance_split',
      'observer-bypass': 'debugView_observer_bypass',
    };
    return this.l10n.t(map[mode]);
  }
}
