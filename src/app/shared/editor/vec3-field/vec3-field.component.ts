import { Component, EventEmitter, Input, Output } from '@angular/core';
import type { Vec3Editable } from '../../../../engine';

@Component({
  selector: 'app-vec3-field',
  standalone: true,
  template: `
    <div class="vec3" [attr.title]="tooltip || null">
      <span class="title">{{ label }}</span>
      <label
        >{{ axes[0] }}
        <input
          type="number"
          [step]="step"
          [disabled]="readonly"
          [value]="format(value.x)"
          (focus)="editStart.emit()"
          (change)="onAxis('x', $any($event.target).value)"
        />
      </label>
      <label
        >{{ axes[1] }}
        <input
          type="number"
          [step]="step"
          [disabled]="readonly"
          [value]="format(value.y)"
          (focus)="editStart.emit()"
          (change)="onAxis('y', $any($event.target).value)"
        />
      </label>
      <label
        >{{ axes[2] }}
        <input
          type="number"
          [step]="step"
          [disabled]="readonly"
          [value]="format(value.z)"
          (focus)="editStart.emit()"
          (change)="onAxis('z', $any($event.target).value)"
        />
      </label>
    </div>
  `,
  styles: `
    .vec3 {
      display: grid;
      grid-template-columns: minmax(4.5rem, auto) repeat(3, 1fr);
      gap: 0.35rem;
      align-items: center;
    }
    .vec3[title] {
      cursor: help;
    }
    .title {
      font-size: 0.75rem;
      color: var(--ls-muted);
    }
    label {
      display: flex;
      flex-direction: column;
      gap: 0.15rem;
      font-size: 0.65rem;
      color: var(--ls-muted);
    }
    input {
      width: 100%;
      box-sizing: border-box;
      font: inherit;
      font-size: 0.78rem;
      color: var(--ls-text);
      background: rgba(0, 0, 0, 0.25);
      border: 1px solid var(--ls-border);
      border-radius: 3px;
      padding: 0.25rem 0.3rem;
    }
  `,
})
export class Vec3FieldComponent {
  @Input({ required: true }) label!: string;
  /** Native browser tooltip explaining the control. */
  @Input() tooltip = '';
  @Input({ required: true }) value!: Vec3Editable;
  @Input() step = 0.1;
  @Input() decimals = 3;
  @Input() axes: [string, string, string] = ['X', 'Y', 'Z'];
  @Input() readonly = false;
  @Output() valueChange = new EventEmitter<Vec3Editable>();
  @Output() editStart = new EventEmitter<void>();

  format(n: number): string {
    if (!Number.isFinite(n)) return '0';
    return String(Number(n.toFixed(this.decimals)));
  }

  onAxis(axis: 'x' | 'y' | 'z', raw: string): void {
    const n = Number(raw);
    if (!Number.isFinite(n)) return;
    this.valueChange.emit({ ...this.value, [axis]: n });
  }
}
