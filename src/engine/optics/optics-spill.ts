/**
 * Unwanted light leaving the fixture aperture around / under the main beam:
 * stray light, internal reflections, and aperture spill/glow.
 * Educational 0–1 weights for volumetric raymarch secondary lobes.
 */

export interface OpticsSpillParams {
  /**
   * Soft field around/under the focused beam from scatter in the optics
   * (projector haze, flashlight spill under the hot spot).
   */
  strayLight: number;
  /**
   * Secondary lobe from internal reflections on lenses / collimator /
   * mirrors — faint “ground spot” or off-axis field.
   */
  internalReflection: number;
  /**
   * Glow / leakage at the aperture rim when baffling is imperfect.
   */
  apertureSpill: number;
}

export const OPTICS_SPILL_MIN = 0;
export const OPTICS_SPILL_MAX = 1;

export function clampSpill01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.min(OPTICS_SPILL_MAX, Math.max(OPTICS_SPILL_MIN, v));
}

export function defaultOpticsSpill(): OpticsSpillParams {
  return {
    strayLight: 0.22,
    internalReflection: 0.12,
    apertureSpill: 0.28,
  };
}

/** Fill missing spill fields when loading older saves. */
export function normalizeOpticsSpill(
  raw: Partial<OpticsSpillParams> | null | undefined,
): OpticsSpillParams {
  const d = defaultOpticsSpill();
  if (!raw || typeof raw !== 'object') return d;
  return {
    strayLight: clampSpill01(
      typeof raw.strayLight === 'number' ? raw.strayLight : d.strayLight,
    ),
    internalReflection: clampSpill01(
      typeof raw.internalReflection === 'number'
        ? raw.internalReflection
        : d.internalReflection,
    ),
    apertureSpill: clampSpill01(
      typeof raw.apertureSpill === 'number' ? raw.apertureSpill : d.apertureSpill,
    ),
  };
}

/** True when any spill channel contributes visibly. */
export function hasOpticsSpill(spill: OpticsSpillParams): boolean {
  return (
    spill.strayLight > 1e-4 ||
    spill.internalReflection > 1e-4 ||
    spill.apertureSpill > 1e-4
  );
}
