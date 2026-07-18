import { Routes } from '@angular/router';
import { LightStudioComponent } from './features/light-studio/light-studio.component';

export const routes: Routes = [
  { path: '', component: LightStudioComponent },
  { path: '**', redirectTo: '' },
];
