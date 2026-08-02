/**
 * Digital camera observer — sensor curves + WB/knee (*approximated*).
 */
import { defineCameraObserver } from './define-observer';

export const DIGITAL_CAMERA_OBSERVER = defineCameraObserver({
  id: 'digital-camera',
  label: 'Digital camera',
  labelKey: 'observerDigitalCamera',
  status: 'ready',
});
