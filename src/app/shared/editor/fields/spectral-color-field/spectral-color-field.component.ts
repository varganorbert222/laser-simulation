import { Component, EventEmitter, Input, Output } from '@angular/core';
import {
  VISIBLE_NM_MAX,
  VISIBLE_NM_MIN,
  clampRange,
  hexToRgb,
  rgbToHex,
  rgbToWavelengthNm,
  wavelengthToRgb,
  wavelengthToRgb255,
} from '@engine';
import { patchRgbChannel } from '../color-channel';

/**
 * Light color: wavelength (nm) ↔ RGB ↔ hex.
 * Forward preview: Dan Bruton spectrum (Wavelength → Color) — same as colorUtils.
 * Inverse: CIE xy (D65) dominant / complementary wavelength + purity.
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

  /** Display RGB [0,1] — Bruton × γ=0.8 including edge falloff (not max-normalized). */
  get rgb(): readonly [number, number, number] {
    return wavelengthToRgb(this.wavelengthNm);
  }

  /** Native `<input type="color">` value — same 8-bit rounding as colorUtils.wavelengthToRgb. */
  get hex(): string {
    const [r, g, b] = wavelengthToRgb255(this.wavelengthNm);
    return rgbToHex([r / 255, g / 255, b / 255]);
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
