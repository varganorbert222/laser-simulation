/**
 * Global display settings: editable power→HDR curve (lab / sky OFF) +
 * ActiveObserver / DebugViewMode / fatigue / legacy luminous pack flag.
 *
 * With Atmosphere enabled, mesopic V_eff uses SPA-derived ambient and compose
 * auto-exposure owns eye adaptation; the scientific tone map is used.
 *
 * Never double-adapt: pack-side eye gain + HumanEye adaptation together.
 */
import {
  createDefaultDisplayResponseCurve,
  normalizeDisplayResponseCurve,
  type DisplayResponseCurve,
} from './display-response-curve';
import type { AtmosphereSettings } from '../atmosphere/atmosphere-settings';
import { resolveSceneAmbientLevel } from '../scene/environment-lighting';
import type { VisionBrightnessOpts } from './laser-brightness';
import {
  DEFAULT_CONE_FATIGUE,
  DEFAULT_OBSERVER_ID,
  DEBUG_VIEW_MODES,
  isKnownObserverId,
  type ConeFatigueSettings,
  type DebugViewMode,
  type ObserverId,
} from '../observer';

export interface DisplayVision {
  /** Editable log-power → HDR intensity curve (scientific default). */
  responseCurve: DisplayResponseCurve;
  /** Active perception observer (ECS authoritative). */
  activeObserverId: ObserverId;
  /** Radiance / perceptual debug inspect mode. */
  debugViewMode: DebugViewMode;
  /** HumanEye cone fatigue (opt-in; never mutates RadianceBuffer). */
  coneFatigue: ConeFatigueSettings;
  /**
   * When true, pack path still bakes V_eff / eye gain into powerLinear.
   * Strip only after Phase B HumanEye parity gate.
   */
  legacyLuminousPack: boolean;
}

export function createDefaultDisplayVision(): DisplayVision {
  return {
    responseCurve: createDefaultDisplayResponseCurve(),
    activeObserverId: DEFAULT_OBSERVER_ID,
    debugViewMode: 'final',
    coneFatigue: { ...DEFAULT_CONE_FATIGUE },
    legacyLuminousPack: true,
  };
}

function normalizeObserverId(raw: unknown): ObserverId {
  if (typeof raw === 'string' && isKnownObserverId(raw)) return raw;
  return DEFAULT_OBSERVER_ID;
}

function normalizeDebugViewMode(raw: unknown): DebugViewMode {
  if (typeof raw === 'string' && (DEBUG_VIEW_MODES as readonly string[]).includes(raw)) {
    return raw as DebugViewMode;
  }
  return 'final';
}

function normalizeConeFatigue(raw: unknown): ConeFatigueSettings {
  const base = { ...DEFAULT_CONE_FATIGUE };
  if (!raw || typeof raw !== 'object') return base;
  const o = raw as Partial<ConeFatigueSettings>;
  return {
    enabled: o.enabled === true,
    fatigueRate:
      typeof o.fatigueRate === 'number' && Number.isFinite(o.fatigueRate)
        ? Math.max(0, Math.min(1, o.fatigueRate))
        : base.fatigueRate,
    recoveryRate:
      typeof o.recoveryRate === 'number' && Number.isFinite(o.recoveryRate)
        ? Math.max(0, Math.min(1, o.recoveryRate))
        : base.recoveryRate,
  };
}

export function normalizeDisplayVision(
  raw: Partial<DisplayVision> | null | undefined,
): DisplayVision {
  const base = createDefaultDisplayVision();
  if (!raw || typeof raw !== 'object') return base;
  return {
    responseCurve: normalizeDisplayResponseCurve(raw.responseCurve ?? base.responseCurve),
    activeObserverId: normalizeObserverId(raw.activeObserverId),
    debugViewMode: normalizeDebugViewMode(raw.debugViewMode),
    coneFatigue: normalizeConeFatigue(raw.coneFatigue),
    legacyLuminousPack:
      typeof raw.legacyLuminousPack === 'boolean'
        ? raw.legacyLuminousPack
        : base.legacyLuminousPack,
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
  colorProfile: 'hdr' | 'sdr' = 'hdr',
): VisionBrightnessOpts {
  const autoSky = !!atmosphere?.enabled;
  return {
    ambientLevel: resolveSceneAmbientLevel(ambientStored, atmosphere),
    responseCurve: autoSky ? null : responseCurve,
    packSideAdaptation: !autoSky,
    colorProfile: colorProfile === 'sdr' ? 'sdr' : 'hdr',
  };
}
