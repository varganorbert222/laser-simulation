import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import type { GizmoMode, GizmoSpace, Vec3Editable } from '../../../../engine';
import { LocalizationService } from '../../../core/services/localization.service';
import { Vec3FieldComponent } from '../vec3-field/vec3-field.component';

@Component({
  selector: 'app-transform-inspector',
  standalone: true,
  imports: [Vec3FieldComponent],
  templateUrl: './transform-inspector.component.html',
  styleUrl: './transform-inspector.component.scss',
})
export class TransformInspectorComponent {
  readonly l10n = inject(LocalizationService);

  @Input({ required: true }) position!: Vec3Editable;
  @Input({ required: true }) rotationDeg!: Vec3Editable;
  @Input({ required: true }) scale!: Vec3Editable;
  @Input() positionMixed = false;
  @Input() rotationMixed = false;
  @Input() scaleMixed = false;
  @Input() gizmoMode: GizmoMode = 'position';
  @Input() gizmoSpace: GizmoSpace = 'world';
  @Input() readonly = false;
  @Input() showGizmo = true;

  @Output() positionChange = new EventEmitter<Vec3Editable>();
  @Output() rotationChange = new EventEmitter<Vec3Editable>();
  @Output() scaleChange = new EventEmitter<Vec3Editable>();
  @Output() gizmoModeChange = new EventEmitter<GizmoMode>();
  @Output() gizmoSpaceChange = new EventEmitter<GizmoSpace>();
  @Output() editStart = new EventEmitter<void>();
}
