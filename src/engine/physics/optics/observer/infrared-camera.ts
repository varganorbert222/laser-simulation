/**
 * Infrared camera — sensor false-colour (not a biological pit model).
 */
import { defineCameraObserver } from './define-observer';

export const INFRARED_CAMERA_OBSERVER = defineCameraObserver({
  id: 'infrared-camera',
  label: 'Infrared camera (sensor)',
  labelKey: 'observerInfraredCamera',
  status: 'ready',
});
