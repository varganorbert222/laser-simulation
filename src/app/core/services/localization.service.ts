import { Injectable, inject } from '@angular/core';
import { I18nService } from '../../i18n/i18n.service';
import type { LocaleId, LocaleKey } from '../../i18n/messages';

export type { LocaleId, LocaleKey };

/**
 * App-facing localization API — hides the i18n backend from feature code.
 */
@Injectable({ providedIn: 'root' })
export class LocalizationService {
  private readonly i18n = inject(I18nService);

  readonly locale = this.i18n.locale;

  t(key: LocaleKey): string {
    return this.i18n.t(key);
  }

  setLocale(id: LocaleId): void {
    this.i18n.setLocale(id);
  }
}
