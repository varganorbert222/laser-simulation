import { Component, EventEmitter, Input, Output } from '@angular/core';
import {
  clampRgb,
  hexToRgb,
  rgbToHex,
  type Rgb01,
} from '../../../../engine';

/**
 * Color inspector: native picker + RGB (0–1) + hex.
 */
@Component({
  selector: 'app-color-field',
  standalone: true,
  templateUrl: './color-field.component.html',
  styleUrl: './color-field.component.scss',
})
export class ColorFieldComponent {
  @Input({ required: true }) label!: string;
  @Input({ required: true }) rgb!: Rgb01;
  @Input() readonly = false;
  @Output() rgbChange = new EventEmitter<[number, number, number]>();
  @Output() editStart = new EventEmitter<void>();

  get hex(): string {
    return rgbToHex(this.rgb);
  }

  onPicker(hex: string): void {
    this.emitHex(hex);
  }

  onHexText(raw: string): void {
    this.emitHex(raw);
  }

  onChannel(index: 0 | 1 | 2, raw: string): void {
    const n = Number(raw);
    if (!Number.isFinite(n)) return;
    this.editStart.emit();
    const next = clampRgb(this.rgb);
    next[index] = Math.min(1, Math.max(0, n));
    this.rgbChange.emit(next);
  }

  private emitHex(raw: string): void {
    const parsed = hexToRgb(raw);
    if (!parsed) return;
    this.editStart.emit();
    this.rgbChange.emit(parsed);
  }
}
