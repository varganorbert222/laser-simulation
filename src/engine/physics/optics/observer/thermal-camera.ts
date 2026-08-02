/**
 * Thermal camera — sensor false-colour (not a biological pit model).
 */
import { defineCameraObserver } from './define-observer';

export const THERMAL_CAMERA_OBSERVER = defineCameraObserver({
  id: 'thermal-camera',
  label: 'Thermal camera (sensor)',
  labelKey: 'observerThermalCamera',
  status: 'ready',
});
