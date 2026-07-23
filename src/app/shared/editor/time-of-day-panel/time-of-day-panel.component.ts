import { Component, inject } from '@angular/core';
import {
  ATMOSPHERE_SEASON_PRESETS,
  ATMOSPHERE_TIME_PRESETS,
  atmosphereHourOfDay,
  type AtmosphereSeasonPresetId,
  type AtmosphereTimePresetId,
} from '@engine';
import { EditorFacade } from '../../../core/services/editor-facade.service';
import { LocalizationService } from '../../../core/services/localization.service';
import type { LocaleKey } from '../../../i18n/messages';

@Component({
  selector: 'app-time-of-day-panel',
  standalone: true,
  templateUrl: './time-of-day-panel.component.html',
  styleUrl: './time-of-day-panel.component.scss',
})
export class TimeOfDayPanelComponent {
  readonly editor = inject(EditorFacade);
  readonly l10n = inject(LocalizationService);

  readonly timePresetIds = Object.keys(ATMOSPHERE_TIME_PRESETS) as AtmosphereTimePresetId[];
  readonly seasonPresetIds = Object.keys(
    ATMOSPHERE_SEASON_PRESETS,
  ) as AtmosphereSeasonPresetId[];

  hourOfDay(): number {
    return atmosphereHourOfDay(this.editor.atmosphere());
  }

  timeLabel(): string {
    const h = Math.floor(this.hourOfDay());
    const m = Math.round((this.hourOfDay() - h) * 60) % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  dateLabel(): string {
    const a = this.editor.atmosphere();
    return `${a.year}-${String(a.month).padStart(2, '0')}-${String(a.day).padStart(2, '0')}`;
  }

  onTimeSlider(raw: string): void {
    const n = Number(raw);
    if (!Number.isFinite(n)) return;
    this.editor.setAtmosphereTimeOfDay(n);
  }

  onYear(raw: string): void {
    const n = Number(raw);
    if (!Number.isFinite(n)) return;
    this.editor.patchAtmosphere({ year: n });
  }

  onMonth(raw: string): void {
    const n = Number(raw);
    if (!Number.isFinite(n)) return;
    this.editor.patchAtmosphere({ month: n });
  }

  onDay(raw: string): void {
    const n = Number(raw);
    if (!Number.isFinite(n)) return;
    this.editor.patchAtmosphere({ day: n });
  }

  onLatitude(raw: string): void {
    const n = Number(raw);
    if (!Number.isFinite(n)) return;
    this.editor.patchAtmosphere({ latitudeDeg: n });
  }

  onLongitude(raw: string): void {
    const n = Number(raw);
    if (!Number.isFinite(n)) return;
    this.editor.patchAtmosphere({ longitudeDeg: n });
  }

  onTimezone(raw: string): void {
    const n = Number(raw);
    if (!Number.isFinite(n)) return;
    this.editor.patchAtmosphere({ timezoneOffsetHours: n });
  }

  onSpeed(raw: string): void {
    const n = Number(raw);
    if (!Number.isFinite(n)) return;
    this.editor.patchAtmosphere({ timeSpeedHoursPerSecond: n });
  }

  togglePlay(): void {
    const a = this.editor.atmosphere();
    this.editor.setAtmosphereTimeAnimating(!a.timeAnimating);
  }

  applyTimePreset(id: AtmosphereTimePresetId): void {
    this.editor.setAtmosphereTimePreset(id);
  }

  applySeasonPreset(id: AtmosphereSeasonPresetId): void {
    this.editor.setAtmosphereSeasonPreset(id);
  }

  timePresetLabel(id: AtmosphereTimePresetId): string {
    return this.l10n.t(`timePreset_${id}` as LocaleKey);
  }

  seasonPresetLabel(id: AtmosphereSeasonPresetId): string {
    return this.l10n.t(`seasonPreset_${id}` as LocaleKey);
  }
}
