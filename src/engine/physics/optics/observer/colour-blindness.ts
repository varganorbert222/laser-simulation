/**
 * Colour-blindness simulation matrices on the same RadianceBuffer (LMS/RGB).
 * Optional human-variant perceptors — register via main registry.
 */
import { defineObserver } from './define-observer';
import { linearRgbToLmsApprox, lmsToLinearRgbApprox } from './lms';
import type { ObserverId, ObserverLayer } from './types';

export type ColourBlindId = 'protanopia' | 'deuteranopia' | 'tritanopia';

/** Brettel-inspired educational LMS projection (*approximated*). */
function projectColourBlindLms(
  id: ColourBlindId,
  L: number,
  M: number,
  S: number,
): [number, number, number] {
  switch (id) {
    case 'protanopia':
      return [1.05118294 * M - 0.05116099 * S, M, S];
    case 'deuteranopia':
      return [L, 0.9513092 * L + 0.04866992 * S, S];
    case 'tritanopia':
      return [L, M, -0.86744736 * L + 1.86727089 * M];
    default:
      return [L, M, S];
  }
}

export function simulateColourBlindRgb(
  id: ColourBlindId,
  r: number,
  g: number,
  b: number,
): [number, number, number] {
  const lms = linearRgbToLmsApprox(r, g, b);
  const [L, M, S] = projectColourBlindLms(id, lms.L, lms.M, lms.S);
  return lmsToLinearRgbApprox({ L, M, S });
}

function makeColourBlindObserver(id: ColourBlindId, label: string, labelKey: string): ObserverLayer {
  return defineObserver({
    id,
    label,
    labelKey,
    category: 'colour-blind',
    status: 'ready',
    approximationTag: 'approximated',
  });
}

export const PROTANOPIA_OBSERVER = makeColourBlindObserver(
  'protanopia',
  'Protanopia',
  'observerProtanopia',
);
export const DEUTERANOPIA_OBSERVER = makeColourBlindObserver(
  'deuteranopia',
  'Deuteranopia',
  'observerDeuteranopia',
);
export const TRITANOPIA_OBSERVER = makeColourBlindObserver(
  'tritanopia',
  'Tritanopia',
  'observerTritanopia',
);

export function isColourBlindId(id: ObserverId): id is ColourBlindId {
  return id === 'protanopia' || id === 'deuteranopia' || id === 'tritanopia';
}
