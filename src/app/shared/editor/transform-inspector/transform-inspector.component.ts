import { Component, EventEmitter, Input, Output } from '@angular/core';
import type { GizmoMode, Vec3Editable } from '../../../../engine';
import { Vec3FieldComponent } from '../vec3-field/vec3-field.component';

@Component({
  selector: 'app-transform-inspector',
  standalone: true,
  imports: [Vec3FieldComponent],
  templateUrl: './transform-inspector.component.html',
  styleUrl: './transform-inspector.component.scss',
})
export class TransformInspectorComponent {
  @Input({ required: true }) position!: Vec3Editable;
  @Input({ required: true }) rotationDeg!: Vec3Editable;
  @Input({ required: true }) scale!: Vec3Editable;
  @Input() positionMixed = false;
  @Input() rotationMixed = false;
  @Input() scaleMixed = false;
  @Input() gizmoMode: GizmoMode = 'position';
  @Input() readonly = false;
  @Input() showGizmo = true;

  @Output() positionChange = new EventEmitter<Vec3Editable>();
  @Output() rotationChange = new EventEmitter<Vec3Editable>();
  @Output() scaleChange = new EventEmitter<Vec3Editable>();
  @Output() gizmoModeChange = new EventEmitter<GizmoMode>();
  @Output() editStart = new EventEmitter<void>();
}
