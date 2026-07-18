import { Component, NgZone, inject, signal } from '@angular/core';
import {
  computeViewportAxisGizmoLines,
  hitTestViewportAxis,
} from '../../../../engine/math/camera-axes';
import type { CameraPose } from '../../../../engine';
import { EngineHostService } from '../../../core/services/engine-host.service';

const DRAG_THRESHOLD_PX = 3;

@Component({
  selector: 'app-viewport-axes',
  standalone: true,
  template: `
    <div
      class="gizmo-hit"
      role="img"
      aria-label="Camera orientation gizmo"
      (pointerdown)="onPointerDown($event)"
      (pointermove)="onPointerMove($event)"
      (pointerup)="onPointerUp($event)"
      (pointercancel)="onPointerUp($event)"
      (contextmenu)="$event.preventDefault()"
    >
      <svg class="viewport-axis-gizmo" viewBox="0 0 80 80" aria-hidden="true">
        @for (line of lines(); track line.axis) {
          <line
            x1="40"
            y1="40"
            [attr.x2]="line.x2"
            [attr.y2]="line.y2"
            [attr.stroke]="line.color"
            stroke-width="2"
            stroke-linecap="round"
          />
          <circle
            [attr.cx]="line.x2"
            [attr.cy]="line.y2"
            r="8"
            [attr.fill]="line.color"
            fill-opacity="0.4"
          />
          <text
            [attr.x]="line.labelX"
            [attr.y]="line.labelY"
            [attr.fill]="line.color"
            font-size="11"
            font-family="IBM Plex Sans, sans-serif"
          >
            {{ line.label }}
          </text>
        }
      </svg>
    </div>
  `,
  styles: `
    :host {
      position: absolute;
      top: 0.75rem;
      right: 0.75rem;
      width: 88px;
      height: 88px;
      z-index: 20;
      pointer-events: auto;
    }
    .gizmo-hit {
      width: 100%;
      height: 100%;
      box-sizing: border-box;
      padding: 4px;
      cursor: grab;
      touch-action: none;
      user-select: none;
      background: rgba(8, 10, 12, 0.55);
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 8px;
    }
    .gizmo-hit:active {
      cursor: grabbing;
    }
    .viewport-axis-gizmo {
      width: 100%;
      height: 100%;
      display: block;
      pointer-events: none;
    }
  `,
})
export class ViewportAxesComponent {
  private readonly zone = inject(NgZone);
  private readonly engine = inject(EngineHostService);
  readonly lines = signal(computeViewportAxisGizmoLines({
    position: [5, 5, 5],
    target: [0, 0, 0],
    fovYDeg: 50,
  }));

  private dragging = false;
  private didDrag = false;
  private hitAxis: 'x' | 'y' | 'z' | null = null;
  private lastX = 0;
  private lastY = 0;
  private startX = 0;
  private startY = 0;
  private activePointerId: number | null = null;

  update(pose: CameraPose): void {
    const next = computeViewportAxisGizmoLines(pose);
    this.zone.run(() => this.lines.set(next));
  }

  onPointerDown(event: PointerEvent): void {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const { x, y } = this.toLocalPoint(event);
    this.dragging = true;
    this.didDrag = false;
    this.hitAxis = hitTestViewportAxis(this.lines(), x, y);
    this.lastX = event.clientX;
    this.lastY = event.clientY;
    this.startX = event.clientX;
    this.startY = event.clientY;
    this.activePointerId = event.pointerId;
    (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
  }

  onPointerMove(event: PointerEvent): void {
    if (!this.dragging || event.pointerId !== this.activePointerId) return;
    event.preventDefault();
    event.stopPropagation();
    const dx = event.clientX - this.lastX;
    const dy = event.clientY - this.lastY;
    this.lastX = event.clientX;
    this.lastY = event.clientY;
    const total = Math.hypot(event.clientX - this.startX, event.clientY - this.startY);
    if (total >= DRAG_THRESHOLD_PX) {
      this.didDrag = true;
      this.engine.orbitViewport(dx, dy);
    }
  }

  onPointerUp(event: PointerEvent): void {
    if (!this.dragging || event.pointerId !== this.activePointerId) return;
    event.preventDefault();
    event.stopPropagation();
    (event.currentTarget as Element).releasePointerCapture?.(event.pointerId);
    if (!this.didDrag && this.hitAxis) {
      this.engine.snapViewportAxis(this.hitAxis, event.ctrlKey || event.metaKey);
    }
    this.dragging = false;
    this.didDrag = false;
    this.hitAxis = null;
    this.activePointerId = null;
  }

  /** Map to the 80×80 SVG viewBox used by hit-testing. */
  private toLocalPoint(event: PointerEvent): { x: number; y: number } {
    const el = event.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    const pad = 4;
    const innerW = Math.max(1, rect.width - pad * 2);
    const innerH = Math.max(1, rect.height - pad * 2);
    const x = ((event.clientX - rect.left - pad) / innerW) * 80;
    const y = ((event.clientY - rect.top - pad) / innerH) * 80;
    return { x, y };
  }
}
