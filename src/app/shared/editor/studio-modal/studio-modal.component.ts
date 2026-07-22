import {
  Component,
  EventEmitter,
  HostListener,
  Input,
  Output,
  ViewEncapsulation,
} from '@angular/core';

/**
 * Lightweight modal shell (pattern from rogue-leader `app-dev-modal`).
 * Project content via default slot; footer actions via `[studioModalActions]`.
 */
@Component({
  selector: 'app-studio-modal',
  standalone: true,
  templateUrl: './studio-modal.component.html',
  styleUrl: './studio-modal.component.scss',
  encapsulation: ViewEncapsulation.None,
})
export class StudioModalComponent {
  @Input() open = false;
  @Input() title = '';
  @Input() titleId = 'studio-modal-title';
  @Input() closeOnBackdrop = true;
  /** Wider card for curve editors / charts. */
  @Input() wide = false;
  /** Extra-wide card for multi-column tools (noise editor). */
  @Input() xlarge = false;

  @Output() dismiss = new EventEmitter<void>();

  onBackdropClick(event: MouseEvent): void {
    if (!this.closeOnBackdrop) return;
    if ((event.target as HTMLElement).classList.contains('studio-modal-backdrop')) {
      this.dismiss.emit();
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.open) this.dismiss.emit();
  }
}
