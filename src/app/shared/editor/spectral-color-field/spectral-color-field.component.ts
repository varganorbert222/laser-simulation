import { Component, EventEmitter, Input, Output } from '@angular/core';
import {
  VISIBLE_NM_MAX,
  VISIBLE_NM_MIN,
  clampRange,
  hexToRgb,
  rgbToHex,
  rgbToWavelengthNm,
  wavelengthToRgb,
} from '@engine';
import { patchRgbChannel } from '../color-channel';

/**
 * Light color: wavelength (nm) ↔ RGB ↔ hex via educational display mapping.
 * Source of truth is wavelengthNm; RGB/hex edits invert to nearest λ.
 */
@Component({
  selector: 'app-spectral-color-field',
  standalone: true,
  templateUrl: './spectral-color-field.component.html',
  styleUrl: './spectral-color-field.component.scss',
})
export class SpectralColorFieldComponent {
  @Input({ required: true }) label!: string;
  /** Native browser tooltip explaining the control. */
  @Input() tooltip = '';
  @Input({ required: true }) wavelengthNm!: number;
  @Input() readonly = false;
  @Output() wavelengthChange = new EventEmitter<number>();
  @Output() editStart = new EventEmitter<void>();

  readonly nmMin = VISIBLE_NM_MIN;
  readonly nmMax = VISIBLE_NM_MAX;

  get rgb(): readonly [number, number, number] {
    return wavelengthToRgb(this.wavelengthNm);
  }

  get hex(): string {
    return rgbToHex(this.rgb);
  }

  onNmSlider(raw: string): void {
    this.emitNm(Number(raw));
  }

  onNmNumber(raw: string): void {
    this.emitNm(Number(raw));
  }

  onPicker(hex: string): void {
    this.emitFromHex(hex);
  }

  onHexText(raw: string): void {
    this.emitFromHex(raw);
  }

  onChannel(index: 0 | 1 | 2, raw: string): void {
    const next = patchRgbChannel(this.rgb, index, raw);
    if (!next) return;
    this.emitFromRgb(next);
  }

  private emitNm(nm: number): void {
    if (!Number.isFinite(nm)) return;
    const clamped = Math.round(clampRange(nm, this.nmMin, this.nmMax, this.nmMin));
    this.editStart.emit();
    this.wavelengthChange.emit(clamped);
  }

  private emitFromHex(raw: string): void {
    const parsed = hexToRgb(raw);
    if (!parsed) return;
    this.emitFromRgb(parsed);
  }

  private emitFromRgb(rgb: [number, number, number]): void {
    this.editStart.emit();
    this.wavelengthChange.emit(rgbToWavelengthNm(rgb));
  }
}
