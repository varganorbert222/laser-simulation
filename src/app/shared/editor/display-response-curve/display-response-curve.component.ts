import {
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  AfterViewInit,
  OnChanges,
  Output,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import {
  DISPLAY_RESPONSE_HDR_MAX,
  DISPLAY_RESPONSE_POINT_MAX,
  DISPLAY_RESPONSE_POINT_MIN,
  clampCurveT,
  clampHdr,
  eyeAdaptationGainFromAmbient,
  formatPowerW,
  normalizeDisplayResponseCurve,
  powerWAtCurveT,
  type DisplayResponseCurve,
  type DisplayResponsePoint,
} from '../../../../engine';
import { I18nService } from '../../../i18n/i18n.service';

@Component({
  selector: 'app-display-response-curve',
  standalone: true,
  templateUrl: './display-response-curve.component.html',
  styleUrl: './display-response-curve.component.scss',
})
export class DisplayResponseCurveComponent implements OnChanges, AfterViewInit {
  @Input({ required: true }) curve!: DisplayResponseCurve;
  @Input() ambientLevel = 0.38;
  @Input() readonly = false;
  @Output() curveChange = new EventEmitter<DisplayResponseCurve>();
  @Output() ambientLevelChange = new EventEmitter<number>();

  @ViewChild('canvas', { static: true }) canvasRef!: ElementRef<HTMLCanvasElement>;

  readonly hdrMax = DISPLAY_RESPONSE_HDR_MAX;
  private dragIndex: number | null = null;
  private localPoints: DisplayResponsePoint[] = [];

  constructor(readonly i18n: I18nService) {}

  get exposureLabel(): string {
    return `${eyeAdaptationGainFromAmbient(this.ambientLevel).toFixed(1)}×`;
  }

  ngAfterViewInit(): void {
    this.localPoints = normalizeDisplayResponseCurve(this.curve).points.map((p) => ({ ...p }));
    requestAnimationFrame(() => this.draw());
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['curve'] && !changes['curve'].firstChange) {
      this.localPoints = normalizeDisplayResponseCurve(this.curve).points.map((p) => ({ ...p }));
      queueMicrotask(() => this.draw());
    }
  }

  onAmbientSlider(raw: string): void {
    const n = Number(raw);
    if (!Number.isFinite(n)) return;
    this.ambientLevelChange.emit(Math.min(1, Math.max(0, n)));
  }

  onPointerDown(event: PointerEvent): void {
    if (this.readonly) return;
    const canvas = this.canvasRef.nativeElement;
    canvas.setPointerCapture(event.pointerId);
    const { t, hdr } = this.eventToCurve(event);
    let idx = this.nearestPointIndex(t, hdr);
    if (idx < 0 && this.localPoints.length < DISPLAY_RESPONSE_POINT_MAX) {
      this.localPoints.push({ t, hdr });
      this.localPoints = normalizeDisplayResponseCurve({ points: this.localPoints }).points;
      idx = this.nearestPointIndex(t, hdr);
      this.emitCurve();
    }
    this.dragIndex = idx >= 0 ? idx : null;
    this.draw();
  }

  onPointerMove(event: PointerEvent): void {
    if (this.readonly || this.dragIndex === null) return;
    const { t, hdr } = this.eventToCurve(event);
    const pts = this.localPoints.map((p) => ({ ...p }));
    const i = this.dragIndex;
    // Keep endpoints roughly at ends; interior free.
    if (i === 0) {
      pts[i] = { t: Math.min(t, pts[1]?.t ?? t), hdr };
    } else if (i === pts.length - 1) {
      pts[i] = { t: Math.max(t, pts[i - 1]?.t ?? t), hdr };
    } else {
      const lo = pts[i - 1].t + 1e-4;
      const hi = pts[i + 1].t - 1e-4;
      pts[i] = { t: Math.min(hi, Math.max(lo, t)), hdr };
    }
    this.localPoints = normalizeDisplayResponseCurve({ points: pts }).points;
    this.emitCurve();
    this.draw();
  }

  onPointerUp(event: PointerEvent): void {
    if (this.dragIndex === null) return;
    try {
      this.canvasRef.nativeElement.releasePointerCapture(event.pointerId);
    } catch {
      /* ignore */
    }
    this.dragIndex = null;
    this.draw();
  }

  @HostListener('window:resize')
  onResize(): void {
    this.draw();
  }

  private emitCurve(): void {
    this.curveChange.emit({ points: this.localPoints.map((p) => ({ ...p })) });
  }

  private eventToCurve(event: PointerEvent): { t: number; hdr: number } {
    const canvas = this.canvasRef.nativeElement;
    const rect = canvas.getBoundingClientRect();
    const pad = this.pad();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const w = rect.width - pad.l - pad.r;
    const h = rect.height - pad.t - pad.b;
    const t = clampCurveT((x - pad.l) / Math.max(1, w));
    const hdr = clampHdr(DISPLAY_RESPONSE_HDR_MAX * (1 - (y - pad.t) / Math.max(1, h)));
    return { t, hdr };
  }

  private nearestPointIndex(t: number, hdr: number): number {
    const canvas = this.canvasRef.nativeElement;
    const rect = canvas.getBoundingClientRect();
    const pad = this.pad();
    const w = rect.width - pad.l - pad.r;
    const h = rect.height - pad.t - pad.b;
    const thresh = 14;
    let best = -1;
    let bestD = thresh * thresh;
    for (let i = 0; i < this.localPoints.length; i++) {
      const p = this.localPoints[i];
      const px = pad.l + p.t * w;
      const py = pad.t + (1 - p.hdr / DISPLAY_RESPONSE_HDR_MAX) * h;
      const qx = pad.l + t * w;
      const qy = pad.t + (1 - hdr / DISPLAY_RESPONSE_HDR_MAX) * h;
      const d = (px - qx) ** 2 + (py - qy) ** 2;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  }

  private pad() {
    return { l: 44, r: 12, t: 12, b: 28 };
  }

  private draw(): void {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) return;
    // Modal may open before layout; retry once when size is still zero.
    if ((canvas.clientWidth || 0) < 8) {
      requestAnimationFrame(() => {
        if ((this.canvasRef?.nativeElement?.clientWidth || 0) >= 8) this.draw();
      });
      return;
    }
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cssW = canvas.clientWidth || 320;
    const cssH = canvas.clientHeight || 180;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const pad = this.pad();
    const w = cssW - pad.l - pad.r;
    const h = cssH - pad.t - pad.b;

    ctx.clearRect(0, 0, cssW, cssH);
    ctx.fillStyle = 'rgba(8, 12, 16, 0.85)';
    ctx.fillRect(0, 0, cssW, cssH);

    // Grid
    ctx.strokeStyle = 'rgba(120, 140, 160, 0.18)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = pad.t + (h * i) / 4;
      ctx.beginPath();
      ctx.moveTo(pad.l, y);
      ctx.lineTo(pad.l + w, y);
      ctx.stroke();
    }
    const tickTs = [0, 0.25, 0.5, 0.75, 1];
    for (const tt of tickTs) {
      const x = pad.l + tt * w;
      ctx.beginPath();
      ctx.moveTo(x, pad.t);
      ctx.lineTo(x, pad.t + h);
      ctx.stroke();
    }

    // Axes labels
    ctx.fillStyle = 'rgba(180, 190, 200, 0.85)';
    ctx.font = '10px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let i = 0; i <= 4; i++) {
      const hdr = DISPLAY_RESPONSE_HDR_MAX * (1 - i / 4);
      const y = pad.t + (h * i) / 4;
      ctx.fillText(String(Math.round(hdr)), pad.l - 6, y);
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (const tt of tickTs) {
      const x = pad.l + tt * w;
      ctx.fillText(formatPowerW(powerWAtCurveT(tt)), x, pad.t + h + 4);
    }

    const pts = this.localPoints;
    if (pts.length < DISPLAY_RESPONSE_POINT_MIN) return;

    const toXY = (p: DisplayResponsePoint) => ({
      x: pad.l + p.t * w,
      y: pad.t + (1 - p.hdr / DISPLAY_RESPONSE_HDR_MAX) * h,
    });

    ctx.strokeStyle = 'rgba(120, 200, 140, 0.95)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    pts.forEach((p, i) => {
      const { x, y } = toXY(p);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    pts.forEach((p, i) => {
      const { x, y } = toXY(p);
      ctx.beginPath();
      ctx.arc(x, y, i === this.dragIndex ? 6 : 4.5, 0, Math.PI * 2);
      ctx.fillStyle =
        i === this.dragIndex ? 'rgba(240, 220, 140, 1)' : 'rgba(160, 220, 180, 1)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(20, 30, 24, 0.9)';
      ctx.lineWidth = 1;
      ctx.stroke();
    });
  }
}
