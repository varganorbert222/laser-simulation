import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { USER_ADDABLE_COMPONENTS, type UserAddableComponent } from '@engine';
import { EditorFacade } from '../../../../core/services/editor-facade.service';
import { LocalizationService } from '../../../../core/services/localization.service';
import { TransformInspectorComponent } from '../../sections/transform-inspector/transform-inspector.component';
import { LightEmitterSectionComponent } from '../../sections/light-emitter-section/light-emitter-section.component';
import { MediaVolumeSectionComponent } from '../../sections/media-volume-section/media-volume-section.component';
import { FluidVolumeSectionComponent } from '../../sections/fluid-volume-section/fluid-volume-section.component';
import { FogVolumeSectionComponent } from '../../sections/fog-volume-section/fog-volume-section.component';
import { SmokeEmitterSectionComponent } from '../../sections/smoke-emitter-section/smoke-emitter-section.component';
import { SurfaceMaterialSectionComponent } from '../../sections/surface-material-section/surface-material-section.component';

@Component({
  selector: 'app-inspector-panel',
  standalone: true,
  imports: [
    FormsModule,
    TransformInspectorComponent,
    LightEmitterSectionComponent,
    MediaVolumeSectionComponent,
    FluidVolumeSectionComponent,
    FogVolumeSectionComponent,
    SmokeEmitterSectionComponent,
    SurfaceMaterialSectionComponent,
  ],
  templateUrl: './inspector-panel.component.html',
  styleUrl: './inspector-panel.component.scss',
})
export class InspectorPanelComponent {
  readonly editor = inject(EditorFacade);
  readonly l10n = inject(LocalizationService);
  readonly addable = USER_ADDABLE_COMPONENTS;

  onRename(value: string): void {
    if (value.trim()) this.editor.rename(value.trim());
  }

  addComponent(raw: string): void {
    if (!raw) return;
    this.editor.addComponent(raw as UserAddableComponent);
  }

  canAdd(component: UserAddableComponent): boolean {
    return this.editor.canAddComponent(component);
  }
}
