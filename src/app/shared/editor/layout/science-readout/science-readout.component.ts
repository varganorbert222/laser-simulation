import { Component, inject } from '@angular/core';
import { EditorFacade } from '../../../../core/services/editor-facade.service';
import { LocalizationService } from '../../../../core/services/localization.service';

@Component({
  selector: 'app-science-readout',
  standalone: true,
  templateUrl: './science-readout.component.html',
  styleUrl: './science-readout.component.scss',
})
export class ScienceReadoutComponent {
  readonly editor = inject(EditorFacade);
  readonly l10n = inject(LocalizationService);
}
