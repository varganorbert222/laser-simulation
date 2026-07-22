import { Injectable, computed, signal } from '@angular/core';
import { locales, type LocaleId, type LocaleKey } from './messages';

/** Low-level locale dictionary backend. App code should use {@link LocalizationService}. */
@Injectable({ providedIn: 'root' })
export class I18nService {
  readonly locale = signal<LocaleId>('hu');

  readonly dict = computed(() => locales[this.locale()]);

  t(key: LocaleKey): string {
    return this.dict()[key];
  }

  setLocale(id: LocaleId): void {
    this.locale.set(id);
  }
}
