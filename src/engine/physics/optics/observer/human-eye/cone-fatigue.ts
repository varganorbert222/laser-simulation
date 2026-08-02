/**
 * Cone fatigue & afterimage (HumanEye only). Never mutates RadianceBuffer.
 * v1: view-averaged LMS wash — enough for laser afterimage demos.
 */
import type { Lms } from '../lms';
import type { ConeFatigueSettings } from '../types';
import { DEFAULT_CONE_FATIGUE } from '../types';

/** Temporal fatigue state (do not conflate with instantaneous ConeExcitation). */
export interface ConeFatigueState {
  fatigueL: number;
  fatigueM: number;
  fatigueS: number;
}

export interface ConeExcitation {
  L: number;
  M: number;
  S: number;
}

export function createConeFatigueState(): ConeFatigueState {
  return { fatigueL: 0, fatigueM: 0, fatigueS: 0 };
}

export function excitationFromLms(lms: Lms): ConeExcitation {
  return { L: lms.L, M: lms.M, S: lms.S };
}

/**
 * Update fatigue toward excitation; recover when dark.
 * Rates are educational (~0.05 / ~0.02) and dt-scaled.
 */
export function updateConeFatigue(
  state: ConeFatigueState,
  excitation: ConeExcitation,
  settings: ConeFatigueSettings,
  deltaTimeSeconds: number,
): ConeFatigueState {
  if (!settings.enabled) return createConeFatigueState();
  const dt = Math.max(0, deltaTimeSeconds);
  const f = settings.fatigueRate;
  const r = settings.recoveryRate;
  const step = (prev: number, exc: number): number => {
    const target = Math.max(0, Math.min(1, exc));
    if (target > prev) {
      return Math.min(1, prev + (target - prev) * (1 - Math.exp(-f * dt * 8)));
    }
    return Math.max(0, prev - r * dt);
  };
  return {
    fatigueL: step(state.fatigueL, excitation.L),
    fatigueM: step(state.fatigueM, excitation.M),
    fatigueS: step(state.fatigueS, excitation.S),
  };
}

/** Opponent channels from LMS. */
export function opponentFromLms(lms: Lms): { rg: number; by: number } {
  return {
    rg: lms.L - lms.M,
    by: lms.S - 0.5 * (lms.L + lms.M),
  };
}

/**
 * Fatigued residual → approximate afterimage RGB mix (*approximated*).
 * Complementary wash: reduce fatigued cones, boost residual opponent.
 */
export function afterimageRgbFromFatigue(
  linearRgb: readonly [number, number, number],
  fatigue: ConeFatigueState,
  mix = 0.35,
): [number, number, number] {
  const [r, g, b] = linearRgb;
  // Educational: L≈R+G, M≈G, S≈B weighting
  const attenR = 1 - fatigue.fatigueL * 0.55;
  const attenG = 1 - (fatigue.fatigueL * 0.25 + fatigue.fatigueM * 0.55);
  const attenB = 1 - fatigue.fatigueS * 0.7;
  const fatigued: [number, number, number] = [r * attenR, g * attenG, b * attenB];
  // Complementary residual push
  const push: [number, number, number] = [
    fatigue.fatigueM * 0.15 + fatigue.fatigueS * 0.1,
    fatigue.fatigueL * 0.1 + fatigue.fatigueS * 0.08,
    fatigue.fatigueL * 0.12 + fatigue.fatigueM * 0.1,
  ];
  const m = Math.max(0, Math.min(1, mix));
  return [
    fatigued[0] * (1 - m) + (fatigued[0] + push[0]) * m,
    fatigued[1] * (1 - m) + (fatigued[1] + push[1]) * m,
    fatigued[2] * (1 - m) + (fatigued[2] + push[2]) * m,
  ];
}

export { DEFAULT_CONE_FATIGUE };
