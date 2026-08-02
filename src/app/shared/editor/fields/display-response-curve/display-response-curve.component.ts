import {
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  AfterViewInit,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import {
  DISPLAY_RESPONSE_HDR_MAX,
  DISPLAY_RESPONSE_POINT_MAX,
  DISPLAY_RESPONSE_POINT_MIN,
  clamp01,
  clampCurveT,
  clampHdr,
  clampRange,
  createDefaultDisplayResponseCurve,
  displayLuminousToneMap,
  evaluateDisplayResponse,
  eyeAdaptationGainFromAmbient,
  formatPowerW,
  isSpectralLightMode,
  isSunEmitter,
  laserDotLuminousProduct,
  normalizeDisplayResponseCurve,
  packSideEyeAdaptationGain,
  powerWAtCurveT,
  resolveSceneAmbientLevel,
  resolveVisionBrightnessOpts,
  scientificDisplayLuminousToneMap,
  sliderTFromPowerW,
  wavelengthToRgb,
  type DisplayResponseCurve,
  type DisplayResponsePoint,
} from '@engine';
import { EngineHostService } from '../../../../core/services/engine-host.service';
import { LocalizationService } from '../../../../core/services/localization.service';

/** Live emitter sample plotted on the response curve. */
interface LiveCurveSample {
  t: number;
  hdr: number;
  /** Scientific HDR at same luminous product (for comparison). */
  hdrScientific: number;
  label: string;
  chroma: [number, number, number];
}

@Component({
  selector: 'app-display-response-curve',
  standalone: true,
  templateUrl: './display-response-curve.component.html',
  styleUrl: './display-response-curve.component.scss',
})
export class DisplayResponseCurveComponent implements OnChanges, AfterViewInit, OnDestroy {
  @Input({ required: true }) curve!: DisplayResponseCurve;
  @Input() ambientLevel = 0.38;
  @Input() readonly = false;
  /** Atmosphere / sky ON — ambient + curve locked; SPA + HDR auto-exposure. */
  @Input() autoMode = false;
  /** Optional compose auto-exposure readout when autoMode. */
  @Input() autoExposure: number | null = null;
  @Output() curveChange = new EventEmitter<DisplayResponseCurve>();
  @Output() ambientLevelChange = new EventEmitter<number>();

  @ViewChild('canvas', { static: true }) canvasRef!: ElementRef<HTMLCanvasElement>;

  readonly hdrMax = DISPLAY_RESPONSE_HDR_MAX;
  /** Live status strip under the canvas (updated ~8×/s). */
  readonly liveAmbient = signal(0.38);
  readonly livePackGain = signal('1.0×');
  readonly liveAutoExposure = signal<number | null>(null);
  readonly liveInUse = signal('');
  private dragIndex: number | null = null;
  private localPoints: DisplayResponsePoint[] = [];
  private readonly scientificPoints = createDefaultDisplayResponseCurve().points;
  private liveRaf = 0;
  private statusFrame = 0;
  private readonly engine = inject(EngineHostService);

  constructor(readonly l10n: LocalizationService) {}

  get exposureLabel(): string {
    if (this.autoMode && this.autoExposure != null && Number.isFinite(this.autoExposure)) {
      return `${this.autoExposure.toFixed(1)}×`;
    }
    return `${eyeAdaptationGainFromAmbient(this.ambientLevel).toFixed(1)}×`;
  }

  private get interactionLocked(): boolean {
    return this.readonly || this.autoMode;
  }

  ngAfterViewInit(): void {
    this.localPoints = normalizeDisplayResponseCurve(this.curve).points.map((p) => ({ ...p }));
    const tick = () => {
      this.liveRaf = requestAnimationFrame(tick);
      this.draw();
    };
    this.liveRaf = requestAnimationFrame(tick);
  }

  ngOnDestroy(): void {
    cancelAnimationFrame(this.liveRaf);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['curve'] && !changes['curve'].firstChange) {
      this.localPoints = normalizeDisplayResponseCurve(this.curve).points.map((p) => ({ ...p }));
    }
  }

  onAmbientSlider(raw: string): void {
    const n = Number(raw);
    if (!Number.isFinite(n)) return;
    this.ambientLevelChange.emit(clamp01(n));
  }

  onPointerDown(event: PointerEvent): void {
    if (this.interactionLocked) return;
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
    if (this.interactionLocked || this.dragIndex === null) return;
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
      pts[i] = { t: clampRange(t, lo, hi), hdr };
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
    return { l: 44, r: 12, t: 28, b: 28 };
  }

  /** Curve actually used by the engine this frame. */
  private activeCurvePoints(): DisplayResponsePoint[] {
    if (this.autoMode) return this.scientificPoints;
    return this.localPoints;
  }

  private collectLiveSamples(): LiveCurveSample[] {
    const world = this.engine.world();
    const atmo = world.resources.Atmosphere;
    const opts = resolveVisionBrightnessOpts(
      world.resources.EnvironmentLighting.ambientLevel,
      atmo,
      world.resources.DisplayVision.responseCurve,
    );
    const packSide = opts.packSideAdaptation !== false;
    const activeCurve = this.autoMode
      ? null
      : normalizeDisplayResponseCurve(this.localPoints.length ? { points: this.localPoints } : this.curve);

    const out: LiveCurveSample[] = [];
    for (const id of world.query('LightEmitter')) {
      const emitter = world.get(id, 'LightEmitter');
      if (!emitter?.enabled || isSunEmitter(emitter)) continue;
      const name = world.get(id, 'Name')?.value ?? id.slice(0, 6);

      let luminous = 0;
      let chroma: [number, number, number] = [1, 1, 1];
      if (isSpectralLightMode(emitter.params.mode)) {
        luminous = laserDotLuminousProduct(
          emitter.powerW,
          emitter.wavelengthNm,
          opts.ambientLevel ?? this.ambientLevel,
          packSide,
        );
        const rgb = wavelengthToRgb(emitter.wavelengthNm);
        chroma = [rgb[0], rgb[1], rgb[2]];
      } else {
        const gain = packSideEyeAdaptationGain(opts);
        luminous = Math.max(0, emitter.intensityLm) * gain;
        chroma = [
          Math.max(0, emitter.colorRgb[0]),
          Math.max(0, emitter.colorRgb[1]),
          Math.max(0, emitter.colorRgb[2]),
        ];
      }

      const hdrScientific = scientificDisplayLuminousToneMap(luminous);
      const hdr = activeCurve
        ? evaluateDisplayResponse(luminous, activeCurve)
        : displayLuminousToneMap(luminous, null);
      const powerW = Math.max(0.001, luminous / 1000);
      const t = clampCurveT(sliderTFromPowerW(powerW));
      out.push({
        t,
        hdr: clampHdr(hdr),
        hdrScientific: clampHdr(hdrScientific),
        label: name,
        chroma,
      });
      if (out.length >= 8) break;
    }
    return out;
  }

  private drawPolyline(
    ctx: CanvasRenderingContext2D,
    pts: DisplayResponsePoint[],
    toXY: (p: DisplayResponsePoint) => { x: number; y: number },
    stroke: string,
    lineWidth: number,
    dashed: boolean,
  ): void {
    if (pts.length < DISPLAY_RESPONSE_POINT_MIN) return;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.setLineDash(dashed ? [5, 4] : []);
    ctx.beginPath();
    pts.forEach((p, i) => {
      const { x, y } = toXY(p);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.setLineDash([]);
  }

  private draw(): void {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) return;

    const world = this.engine.world();
    const amb = resolveSceneAmbientLevel(
      world.resources.EnvironmentLighting.ambientLevel,
      world.resources.Atmosphere,
    );
    const ae =
      this.autoMode
        ? (this.engine.presenterAutoExposure() ?? this.autoExposure)
        : null;

    // Panel may open before layout; still refresh live readouts, retry paint later.
    if ((canvas.clientWidth || 0) < 8) {
      this.publishLiveStatus(amb, ae);
      return;
    }

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cssW = canvas.clientWidth || 320;
    const cssH = canvas.clientHeight || 220;
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

    const toXY = (p: DisplayResponsePoint) => ({
      x: pad.l + p.t * w,
      y: pad.t + (1 - p.hdr / DISPLAY_RESPONSE_HDR_MAX) * h,
    });

    // Scientific baseline — always visible.
    this.drawPolyline(
      ctx,
      this.scientificPoints,
      toXY,
      'rgba(100, 170, 220, 0.75)',
      1.75,
      true,
    );

    // Active / editable curve (in auto mode this matches scientific; still draw solid).
    const active = this.activeCurvePoints();
    const customDiffers =
      !this.autoMode &&
      this.localPoints.length >= DISPLAY_RESPONSE_POINT_MIN &&
      !curvesApproxEqual(this.localPoints, this.scientificPoints);

    if (customDiffers) {
      this.drawPolyline(ctx, this.localPoints, toXY, 'rgba(120, 200, 140, 0.95)', 2.25, false);
      this.localPoints.forEach((p, i) => {
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
    } else {
      // Emphasize scientific as the in-use curve.
      this.drawPolyline(ctx, active, toXY, 'rgba(120, 200, 140, 0.95)', 2.25, false);
    }

    // Live emitter operating points.
    const samples = this.collectLiveSamples();
    samples.forEach((s, i) => {
      const x = pad.l + s.t * w;
      const y = pad.t + (1 - s.hdr / DISPLAY_RESPONSE_HDR_MAX) * h;
      const [cr, cg, cb] = s.chroma;
      const fill = `rgba(${Math.round(cr * 255)}, ${Math.round(cg * 255)}, ${Math.round(cb * 255)}, 0.95)`;

      // Crosshair
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x - 7, y);
      ctx.lineTo(x + 7, y);
      ctx.moveTo(x, y - 7);
      ctx.lineTo(x, y + 7);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.strokeStyle = 'rgba(10, 14, 18, 0.9)';
      ctx.stroke();

      // Scientific reference tick (small hollow) when custom curve differs.
      if (customDiffers && Math.abs(s.hdr - s.hdrScientific) > 0.4) {
        const ys = pad.t + (1 - s.hdrScientific / DISPLAY_RESPONSE_HDR_MAX) * h;
        ctx.beginPath();
        ctx.arc(x, ys, 3.5, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(100, 170, 220, 0.9)';
        ctx.stroke();
      }

      ctx.fillStyle = 'rgba(230, 236, 242, 0.95)';
      ctx.font = '9px ui-sans-serif, system-ui, sans-serif';
      ctx.textAlign = i % 2 === 0 ? 'left' : 'right';
      ctx.textBaseline = 'bottom';
      const lx = i % 2 === 0 ? x + 7 : x - 7;
      const ly = Math.max(pad.t + 10, y - 6);
      ctx.fillText(`${s.label} · HDR ${s.hdr.toFixed(1)}`, lx, ly);
    });

    // Status strip (computed values in use) — always from world/presenter, not stale inputs.
    const packGain = packSideEyeAdaptationGain({
      ambientLevel: amb,
      packSideAdaptation: !this.autoMode,
    });
    const aeTxt =
      ae != null && Number.isFinite(ae) ? ` · AE ${ae.toFixed(2)}×` : '';
    const modeTxt = this.autoMode
      ? this.l10n.t('visionCurveInUseScientific')
      : customDiffers
        ? this.l10n.t('visionCurveInUseCustom')
        : this.l10n.t('visionCurveInUseScientific');

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = '10px ui-sans-serif, system-ui, sans-serif';
    ctx.fillStyle = 'rgba(200, 214, 226, 0.95)';
    ctx.fillText(
      `${modeTxt} · amb ${amb.toFixed(2)} · pack ${packGain.toFixed(1)}×${aeTxt}`,
      pad.l,
      6,
    );

    this.publishLiveStatus(amb, ae, modeTxt, packGain);
  }

  /** Push live readouts into Angular signals (throttled). */
  private publishLiveStatus(
    amb: number,
    ae: number | null,
    modeTxt?: string,
    packGain?: number,
  ): void {
    this.statusFrame++;
    if (this.statusFrame % 8 !== 0) return;
    const gain =
      packGain ??
      packSideEyeAdaptationGain({
        ambientLevel: amb,
        packSideAdaptation: !this.autoMode,
      });
    const customDiffers =
      !this.autoMode &&
      this.localPoints.length >= DISPLAY_RESPONSE_POINT_MIN &&
      !curvesApproxEqual(this.localPoints, this.scientificPoints);
    const mode =
      modeTxt ??
      (this.autoMode
        ? this.l10n.t('visionCurveInUseScientific')
        : customDiffers
          ? this.l10n.t('visionCurveInUseCustom')
          : this.l10n.t('visionCurveInUseScientific'));
    this.liveAmbient.set(amb);
    this.livePackGain.set(`${gain.toFixed(1)}×`);
    this.liveAutoExposure.set(ae != null && Number.isFinite(ae) ? ae : null);
    this.liveInUse.set(mode);
  }
}

function curvesApproxEqual(
  a: DisplayResponsePoint[],
  b: DisplayResponsePoint[],
  eps = 0.35,
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (Math.abs(a[i].t - b[i].t) > 0.02) return false;
    if (Math.abs(a[i].hdr - b[i].hdr) > eps) return false;
  }
  return true;
}
