import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  ViewChild,
  ViewEncapsulation,
  inject,
} from '@angular/core';
import { LocalizationService } from '../../../core/services/localization.service';

type ResizeEdge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

interface PanelRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

const BASE_Z = 80;
const MIN_WIDTH = 280;
const MIN_HEIGHT = 160;

interface FloatingModalHost {
  open: boolean;
  zIndex: number;
  dismiss: EventEmitter<void>;
  bringToFront(): void;
}

/** Stack of open floating modals (topmost last) for focus + Escape. */
const openStack: FloatingModalHost[] = [];
let zCounter = BASE_Z;

/**
 * Floating, draggable, resizable modal shell.
 * Project content via default slot; footer actions via `[studioModalActions]`.
 * Default size fits content (no inner scroll) up to the viewport.
 */
@Component({
  selector: 'app-studio-modal',
  standalone: true,
  templateUrl: './studio-modal.component.html',
  styleUrl: './studio-modal.component.scss',
  encapsulation: ViewEncapsulation.None,
})
export class StudioModalComponent implements OnChanges, AfterViewInit, OnDestroy, FloatingModalHost {
  readonly l10n = inject(LocalizationService);
  private readonly cdr = inject(ChangeDetectorRef);

  @ViewChild('card') cardRef?: ElementRef<HTMLElement>;

  @Input() open = false;
  @Input() title = '';
  @Input() titleId = 'studio-modal-title';
  /** When true, a dimmed backdrop closes the panel on outside click. */
  @Input() closeOnBackdrop = false;
  /** Wider card for curve editors / charts. */
  @Input() wide = false;
  /** Extra-wide card for multi-column tools (noise editor). */
  @Input() xlarge = false;

  @Output() dismiss = new EventEmitter<void>();

  zIndex = BASE_Z;
  rect: PanelRect = { left: 0, top: 0, width: 416, height: MIN_HEIGHT };
  /** Until first fit, height follows content (`auto`). */
  heightAuto = true;
  private drag: { startX: number; startY: number; orig: PanelRect } | null = null;
  private resize: { edge: ResizeEdge; startX: number; startY: number; orig: PanelRect } | null =
    null;
  private placed = false;
  private userResized = false;
  private fitRaf = 0;
  private contentObserver: ResizeObserver | null = null;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['open']) {
      if (this.open) {
        this.onOpened();
      } else {
        this.onClosed();
      }
    }
  }

  ngAfterViewInit(): void {
    if (this.open) this.scheduleFitToContent();
  }

  ngOnDestroy(): void {
    this.teardownFit();
    this.onClosed();
  }

  bringToFront(): void {
    if (!this.open) return;
    const idx = openStack.indexOf(this);
    if (idx >= 0) openStack.splice(idx, 1);
    openStack.push(this);
    zCounter += 1;
    this.zIndex = zCounter;
  }

  onCloseClick(event: Event): void {
    event.stopPropagation();
    this.dismiss.emit();
  }

  onBackdropClick(event: MouseEvent): void {
    if (!this.closeOnBackdrop) return;
    if ((event.target as HTMLElement).classList.contains('studio-modal-backdrop')) {
      this.dismiss.emit();
    }
  }

  onHeaderPointerDown(event: PointerEvent): void {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest('button')) return;
    this.bringToFront();
    this.ensureExplicitHeight();
    this.drag = {
      startX: event.clientX,
      startY: event.clientY,
      orig: { ...this.rect },
    };
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
    event.preventDefault();
  }

  onResizePointerDown(event: PointerEvent, edge: ResizeEdge): void {
    if (event.button !== 0) return;
    this.bringToFront();
    this.ensureExplicitHeight();
    this.userResized = true;
    this.resize = {
      edge,
      startX: event.clientX,
      startY: event.clientY,
      orig: { ...this.rect },
    };
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
    event.preventDefault();
    event.stopPropagation();
  }

  @HostListener('document:pointermove', ['$event'])
  onPointerMove(event: PointerEvent): void {
    if (this.drag) {
      const dx = event.clientX - this.drag.startX;
      const dy = event.clientY - this.drag.startY;
      const next = {
        ...this.drag.orig,
        left: this.drag.orig.left + dx,
        top: this.drag.orig.top + dy,
      };
      this.rect = this.clampRect(next);
      return;
    }
    if (this.resize) {
      this.rect = this.clampRect(this.applyResize(this.resize, event.clientX, event.clientY));
    }
  }

  @HostListener('document:pointerup')
  @HostListener('document:pointercancel')
  onPointerUp(): void {
    this.drag = null;
    this.resize = null;
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (!this.open) return;
    const top = openStack[openStack.length - 1];
    if (top === this) this.dismiss.emit();
  }

  @HostListener('window:resize')
  onWindowResize(): void {
    if (!this.open) return;
    this.rect = this.clampRect(this.rect);
    if (!this.userResized) this.scheduleFitToContent();
  }

  private onOpened(): void {
    if (!openStack.includes(this)) openStack.push(this);
    this.bringToFront();
    if (!this.placed) {
      this.applyDefaultWidth();
      this.placeDefault();
      this.placed = true;
    }
    if (!this.userResized) {
      this.heightAuto = true;
      this.lastFitContentH = -1;
    }
    this.scheduleFitToContent();
  }

  private onClosed(): void {
    const idx = openStack.indexOf(this);
    if (idx >= 0) openStack.splice(idx, 1);
    this.drag = null;
    this.resize = null;
    this.teardownFit();
  }

  private applyDefaultWidth(): void {
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
    let width = 416;
    if (this.xlarge) width = Math.min(1088, vw * 0.96);
    else if (this.wide) width = Math.min(672, vw * 0.96);
    else width = Math.min(416, vw * 0.96);
    this.rect = { ...this.rect, width };
  }

  private placeDefault(): void {
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
    const openCount = Math.max(0, openStack.length - 1);
    const cascade = (openCount % 6) * 28;
    const left = Math.max(12, Math.round((vw - this.rect.width) / 2) + cascade);
    const top = Math.max(56, 72 + cascade);
    this.rect = this.clampRect({ ...this.rect, left, top, height: this.rect.height });
  }

  private lastFitContentH = -1;
  private fitting = false;

  private scheduleFitToContent(): void {
    if (this.userResized || this.fitting) return;
    cancelAnimationFrame(this.fitRaf);
    // Wait for @if view + projected content layout (canvas, etc.).
    this.fitRaf = requestAnimationFrame(() => {
      this.fitRaf = requestAnimationFrame(() => this.fitToContent());
    });
  }

  private fitToContent(): void {
    if (!this.open || this.userResized || this.fitting) return;
    const card = this.cardRef?.nativeElement;
    if (!card) {
      this.fitRaf = requestAnimationFrame(() => this.fitToContent());
      return;
    }

    const header = card.querySelector('.studio-modal-header') as HTMLElement | null;
    const body = card.querySelector('.studio-modal-body') as HTMLElement | null;
    const actions = card.querySelector('.studio-modal-actions') as HTMLElement | null;
    if (!body) return;

    this.fitting = true;
    try {
      const prevOverflow = body.style.overflow;
      const prevHeight = body.style.height;
      body.style.overflow = 'visible';
      body.style.height = 'auto';
      const contentH = Math.ceil(body.scrollHeight);
      body.style.overflow = prevOverflow;
      body.style.height = prevHeight;

      if (Math.abs(contentH - this.lastFitContentH) < 2 && !this.heightAuto) {
        return;
      }
      this.lastFitContentH = contentH;

      const chrome =
        Math.ceil(header?.getBoundingClientRect().height ?? 0) +
        Math.ceil(actions?.getBoundingClientRect().height ?? 0);
      const vh = window.innerHeight;
      const height = Math.max(MIN_HEIGHT, Math.min(contentH + chrome + 2, vh - 16));

      this.heightAuto = false;
      this.rect = this.clampRect({ ...this.rect, height });
      this.cdr.detectChanges();
      this.observeContent(body);
    } finally {
      this.fitting = false;
    }
  }

  private observeContent(body: HTMLElement): void {
    if (typeof ResizeObserver === 'undefined') return;
    this.contentObserver?.disconnect();
    this.contentObserver = new ResizeObserver(() => {
      if (this.fitting || this.userResized) return;
      this.scheduleFitToContent();
    });
    for (const child of Array.from(body.children)) {
      this.contentObserver.observe(child);
    }
  }

  private teardownFit(): void {
    cancelAnimationFrame(this.fitRaf);
    this.fitRaf = 0;
    this.contentObserver?.disconnect();
    this.contentObserver = null;
  }

  /** Lock current rendered height before drag/resize so `auto` does not fight the pointer. */
  private ensureExplicitHeight(): void {
    if (!this.heightAuto) return;
    const card = this.cardRef?.nativeElement;
    if (card) {
      this.rect = { ...this.rect, height: Math.ceil(card.getBoundingClientRect().height) };
    }
    this.heightAuto = false;
  }

  private applyResize(
    state: { edge: ResizeEdge; startX: number; startY: number; orig: PanelRect },
    clientX: number,
    clientY: number,
  ): PanelRect {
    const dx = clientX - state.startX;
    const dy = clientY - state.startY;
    const o = state.orig;
    let { left, top, width, height } = o;
    const edge = state.edge;

    if (edge.includes('e')) width = o.width + dx;
    if (edge.includes('w')) {
      width = o.width - dx;
      left = o.left + dx;
    }
    if (edge.includes('s')) height = o.height + dy;
    if (edge.includes('n')) {
      height = o.height - dy;
      top = o.top + dy;
    }

    if (width < MIN_WIDTH) {
      if (edge.includes('w')) left = o.left + o.width - MIN_WIDTH;
      width = MIN_WIDTH;
    }
    if (height < MIN_HEIGHT) {
      if (edge.includes('n')) top = o.top + o.height - MIN_HEIGHT;
      height = MIN_HEIGHT;
    }

    return { left, top, width, height };
  }

  private clampRect(rect: PanelRect): PanelRect {
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
    const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
    const width = Math.min(Math.max(MIN_WIDTH, rect.width), vw - 16);
    const height = Math.min(Math.max(MIN_HEIGHT, rect.height), vh - 16);
    const left = Math.min(Math.max(-width + 48, rect.left), vw - 48);
    const top = Math.min(Math.max(0, rect.top), vh - 48);
    return { left, top, width, height };
  }
}
