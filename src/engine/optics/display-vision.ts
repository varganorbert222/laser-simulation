/**
 * Global display settings: editable power→HDR curve only.
 * Eye exposure comes from EnvironmentLighting.ambientLevel (scene fill), not a
 * separate photopic/scotopic mode switch.
 */
import {
  createDefaultDisplayResponseCurve,
  normalizeDisplayResponseCurve,
  type DisplayResponseCurve,
} from '../optics/display-response-curve';

export interface DisplayVision {
  /** Editable log-power → HDR intensity curve (scientific default). */
  responseCurve: DisplayResponseCurve;
}

export function createDefaultDisplayVision(): DisplayVision {
  return {
    responseCurve: createDefaultDisplayResponseCurve(),
  };
}

export function normalizeDisplayVision(
  raw: Partial<DisplayVision> | null | undefined,
): DisplayVision {
  const base = createDefaultDisplayVision();
  if (!raw || typeof raw !== 'object') return base;
  return {
    responseCurve: normalizeDisplayResponseCurve(raw.responseCurve ?? base.responseCurve),
  };
}
