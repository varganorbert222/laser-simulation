/**
 * CPU → GPU uniforms for compose observer / debug view.
 * Pure engine — no Babylon.
 */
import { dichromatDogRgb } from './animal/species-spectral-curves';
import { simulateColourBlindRgb, type ColourBlindId } from './colour-blindness';
import type { DebugViewMode, ObserverId } from './types';

/** Matches shaders/src/postfx/observer_apply.glsl */
export const OBSERVER_GPU_MODE = {
  identity: 0,
  matrix: 1,
  digitalCamera: 2,
  thermal: 3,
  infrared: 4,
} as const;

export const DEBUG_VIEW_GPU_MODE: Record<DebugViewMode, number> = {
  final: 0,
  'radiance-rgb': 1,
  'radiance-luminance': 2,
  'radiance-split': 3,
  'observer-bypass': 4,
};

export interface ObserverGpuUniforms {
  observerMode: number;
  debugViewMode: number;
  /** Row-major 3×3 (identity when unused). */
  matrixRows: readonly [readonly [number, number, number], readonly [number, number, number], readonly [number, number, number]];
}

const IDENTITY_ROWS: ObserverGpuUniforms['matrixRows'] = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];

/** Fit a linear RGB→RGB matrix from a (possibly approx-linear) mapper. */
export function fitRgbMatrix3(
  map: (r: number, g: number, b: number) => readonly [number, number, number],
): ObserverGpuUniforms['matrixRows'] {
  const c0 = map(1, 0, 0);
  const c1 = map(0, 1, 0);
  const c2 = map(0, 0, 1);
  // Rows of M such that M * [r,g,b]^T ≈ mapped colour
  return [
    [c0[0], c1[0], c2[0]],
    [c0[1], c1[1], c2[1]],
    [c0[2], c1[2], c2[2]],
  ];
}

function colourBlindMatrix(id: ColourBlindId): ObserverGpuUniforms['matrixRows'] {
  return fitRgbMatrix3((r, g, b) => simulateColourBlindRgb(id, r, g, b));
}

const DOG_MATRIX = fitRgbMatrix3((r, g, b) => dichromatDogRgb(r, g, b));
const PROTAN_MATRIX = colourBlindMatrix('protanopia');
const DEUTAN_MATRIX = colourBlindMatrix('deuteranopia');
const TRITAN_MATRIX = colourBlindMatrix('tritanopia');

/**
 * Resolve GPU uniforms for the active observer + debug view.
 * Does not remount unknown ids onto human — caller passes resolved id.
 */
export function resolveObserverGpuUniforms(
  observerId: ObserverId,
  debugViewMode: DebugViewMode,
): ObserverGpuUniforms {
  const debug = DEBUG_VIEW_GPU_MODE[debugViewMode] ?? 0;

  // Bypass / radiance-rgb: shader ignores observer; still send identity.
  if (debugViewMode === 'observer-bypass' || debugViewMode === 'radiance-rgb') {
    return { observerMode: OBSERVER_GPU_MODE.identity, debugViewMode: debug, matrixRows: IDENTITY_ROWS };
  }

  switch (observerId) {
    case 'human-eye':
    case 'custom':
      return { observerMode: OBSERVER_GPU_MODE.identity, debugViewMode: debug, matrixRows: IDENTITY_ROWS };
    case 'protanopia':
      return { observerMode: OBSERVER_GPU_MODE.matrix, debugViewMode: debug, matrixRows: PROTAN_MATRIX };
    case 'deuteranopia':
      return { observerMode: OBSERVER_GPU_MODE.matrix, debugViewMode: debug, matrixRows: DEUTAN_MATRIX };
    case 'tritanopia':
      return { observerMode: OBSERVER_GPU_MODE.matrix, debugViewMode: debug, matrixRows: TRITAN_MATRIX };
    case 'digital-camera':
      return { observerMode: OBSERVER_GPU_MODE.digitalCamera, debugViewMode: debug, matrixRows: IDENTITY_ROWS };
    case 'thermal-camera':
      return { observerMode: OBSERVER_GPU_MODE.thermal, debugViewMode: debug, matrixRows: IDENTITY_ROWS };
    case 'infrared-camera':
      return { observerMode: OBSERVER_GPU_MODE.infrared, debugViewMode: debug, matrixRows: IDENTITY_ROWS };
    case 'animal:dog':
      return { observerMode: OBSERVER_GPU_MODE.matrix, debugViewMode: debug, matrixRows: DOG_MATRIX };
    default:
      if (typeof observerId === 'string' && observerId.startsWith('animal:')) {
        // Unknown animal → dog-like dichromat fallback until registered GPU mapper exists
        return { observerMode: OBSERVER_GPU_MODE.matrix, debugViewMode: debug, matrixRows: DOG_MATRIX };
      }
      return { observerMode: OBSERVER_GPU_MODE.identity, debugViewMode: debug, matrixRows: IDENTITY_ROWS };
  }
}
