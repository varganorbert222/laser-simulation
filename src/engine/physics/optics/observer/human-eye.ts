/**
 * HumanEyeObserver — CIE-backed educational eye (CPU / contract apply).
 * GPU path lives in adapters/babylon/postfx.
 */
import { adaptFromSceneLuminanceY, type EyeAdaptationState } from './adaptation';
import { cmfXyzAtWavelength, linearSrgbToXyzApprox, xyzToLinearSrgbApprox } from './cmf';
import { lmsAtWavelength, linearRgbToLmsApprox } from './lms';
import { effectiveVLambda, MESOPIC_V_M08, PHOTOPIC_V, SCOTOPIC_V } from './v-lambda';
import type {
  ConeFatigueSettings,
  ObserverContext,
  ObserverLayer,
  PerceptualBuffer,
  RadianceBuffer,
} from './types';
import { DEFAULT_CONE_FATIGUE } from './types';
import {
  afterimageRgbFromFatigue,
  createConeFatigueState,
  excitationFromLms,
  updateConeFatigue,
  type ConeFatigueState,
} from './human-eye/cone-fatigue';

export interface HumanEyeObserver extends ObserverLayer {
  readonly photopic: typeof PHOTOPIC_V;
  readonly mesopic: typeof MESOPIC_V_M08;
  readonly scotopic: typeof SCOTOPIC_V;
  adaptation: EyeAdaptationState;
  coneFatigue: ConeFatigueState;
  fatigueEnabled: boolean;
  fatigueRate: number;
  recoveryRate: number;
}

export function createHumanEyeObserver(
  fatigue: ConeFatigueSettings = DEFAULT_CONE_FATIGUE,
): HumanEyeObserver {
  const state: HumanEyeObserver = {
    id: 'human-eye',
    label: 'Human eye (CIE)',
    labelKey: 'observerHumanEye',
    category: 'human',
    selectable: true,
    status: 'ready',
    approximationTag: null,
    photopic: PHOTOPIC_V,
    mesopic: MESOPIC_V_M08,
    scotopic: SCOTOPIC_V,
    adaptation: adaptFromSceneLuminanceY(1),
    coneFatigue: createConeFatigueState(),
    fatigueEnabled: fatigue.enabled,
    fatigueRate: fatigue.fatigueRate,
    recoveryRate: fatigue.recoveryRate,
    apply(radiance: RadianceBuffer, ctx: ObserverContext): PerceptualBuffer {
      return applyHumanEye(state, radiance, ctx);
    },
  };
  return state;
}

function applyHumanEye(
  eye: HumanEyeObserver,
  radiance: RadianceBuffer,
  ctx: ObserverContext,
): PerceptualBuffer {
  // 1. Meter → adaptation (correct polarity)
  eye.adaptation = adaptFromSceneLuminanceY(ctx.sceneLuminanceY);

  // Contract marker — GPU path replaces this with fullscreen RT apply.
  // Narrowband λ-meta path for educational HUD / tests:
  if (radiance.peakWavelengthNm != null) {
    const λ = radiance.peakWavelengthNm;
    void cmfXyzAtWavelength(λ, 1);
    void effectiveVLambda(
      λ,
      eye.adaptation.scotopicWeight,
      eye.adaptation.mesopicFactor,
    );
    void lmsAtWavelength(λ, 1);
  }

  // 2–3. RGB→XYZ→RGB identity passthrough for v1 contract (GPU will own RT)
  // Fatigue uses view-averaged LMS when enabled.
  if (eye.fatigueEnabled && (ctx.deltaTime ?? 0) > 0) {
    // Placeholder average excitation from mid-grey until GPU meters LMS
    const avg = linearRgbToLmsApprox(0.5, 0.5, 0.5);
    eye.coneFatigue = updateConeFatigue(
      eye.coneFatigue,
      excitationFromLms(avg),
      {
        enabled: true,
        fatigueRate: eye.fatigueRate,
        recoveryRate: eye.recoveryRate,
      },
      ctx.deltaTime ?? 0,
    );
    void afterimageRgbFromFatigue([1, 1, 1], eye.coneFatigue);
    void xyzToLinearSrgbApprox(linearSrgbToXyzApprox(1, 1, 1));
  } else if (!eye.fatigueEnabled) {
    eye.coneFatigue = createConeFatigueState();
  }

  return {
    encoding: 'linear-rgb-perceptual',
    observerId: 'human-eye',
    approximationTag: null,
  };
}

export function humanEyeFatigueSettings(eye: HumanEyeObserver): ConeFatigueSettings {
  return {
    enabled: eye.fatigueEnabled,
    fatigueRate: eye.fatigueRate,
    recoveryRate: eye.recoveryRate,
  };
}
