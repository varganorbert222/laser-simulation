/**
 * Global display settings: editable power→HDR curve only (lab / sky OFF).
 * With Atmosphere enabled, mesopic V_eff uses SPA-derived ambient and compose
 * auto-exposure owns eye adaptation; the scientific tone map is used.
 */
import {
  createDefaultDisplayResponseCurve,
  normalizeDisplayResponseCurve,
  type DisplayResponseCurve,
} from './display-response-curve';
import type { AtmosphereSettings } from '../atmosphere/atmosphere-settings';
import { resolveSceneAmbientLevel } from '../scene/environment-lighting';
import type { VisionBrightnessOpts } from './laser-brightness';

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

/**
 * Vision opts for emitters / surfaces this frame.
 * Sky ON → SPA ambient, scientific curve, no pack-side eye gain.
 */
export function resolveVisionBrightnessOpts(
  ambientStored: number,
  atmosphere: AtmosphereSettings | null | undefined,
  responseCurve: DisplayResponseCurve,
): VisionBrightnessOpts {
  const autoSky = !!atmosphere?.enabled;
  return {
    ambientLevel: resolveSceneAmbientLevel(ambientStored, atmosphere),
    responseCurve: autoSky ? null : responseCurve,
    packSideAdaptation: !autoSky,
  };
}
