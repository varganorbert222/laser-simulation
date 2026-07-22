import { Component, EventEmitter, Input, Output } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import {
  clampRgb,
  colorTemperatureToRgb,
  hexToRgb,
  rgbToHex,
  type LightHdrAppearance,
} from '../../../../engine';

/**
 * Unity-HDR-like lamp color: RGB filter + optional color temperature (Kelvin).
 * Intensity (lm) is edited separately in the light section.
 */
@Component({
  selector: 'app-hdr-color-field',
  standalone: true,
  imports: [DecimalPipe],
  templateUrl: './hdr-color-field.component.html',
  styleUrl: './hdr-color-field.component.scss',
})
export class HdrColorFieldComponent {
  @Input({ required: true }) label!: string;
  @Input() tooltip = '';
  @Input({ required: true }) colorRgb!: readonly [number, number, number];
  @Input() useColorTemperature = false;
  @Input() colorTemperatureK = 6500;
  @Input() readonly = false;
  @Output() appearanceChange = new EventEmitter<Partial<LightHdrAppearance>>();
  @Output() editStart = new EventEmitter<void>();

  get effectiveRgb(): readonly [number, number, number] {
    return this.useColorTemperature
      ? colorTemperatureToRgb(this.colorTemperatureK)
      : this.colorRgb;
  }

  get hex(): string {
    return rgbToHex(this.effectiveRgb);
  }

  onUseTemp(checked: boolean): void {
    this.editStart.emit();
    this.appearanceChange.emit({ useColorTemperature: checked });
  }

  onTempSlider(raw: string): void {
    const n = Number(raw);
    if (!Number.isFinite(n)) return;
    this.editStart.emit();
    this.appearanceChange.emit({ colorTemperatureK: n, useColorTemperature: true });
  }

  onPicker(hex: string): void {
    this.emitFromHex(hex);
  }

  onHexText(raw: string): void {
    this.emitFromHex(raw);
  }

  onChannel(index: 0 | 1 | 2, raw: string): void {
    const n = Number(raw);
    if (!Number.isFinite(n)) return;
    const next = clampRgb(this.colorRgb);
    next[index] = Math.min(1, Math.max(0, n));
    this.editStart.emit();
    this.appearanceChange.emit({
      colorRgb: next,
      useColorTemperature: false,
    });
  }

  private emitFromHex(raw: string): void {
    const parsed = hexToRgb(raw);
    if (!parsed) return;
    this.editStart.emit();
    this.appearanceChange.emit({
      colorRgb: parsed,
      useColorTemperature: false,
    });
  }
}
