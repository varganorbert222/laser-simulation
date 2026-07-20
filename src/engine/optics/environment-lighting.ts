/**
 * Scene fill / key ambient that drives both viewport lighting and eye exposure.
 * 0 = dark lab, 1 = bright day — no separate day/night vision modes.
 */
export interface EnvironmentLighting {
  /**
   * Relative environment brightness in [0, 1].
   * Controls hemispheric + directional fill and eyeAdaptationGain (inverse).
   */
  ambientLevel: number;
}

/** Default matches the previous fixed hemi≈0.22 / sun≈0.12 look. */
export const ENVIRONMENT_AMBIENT_DEFAULT = 0.38;

export function clampAmbientLevel(level: number): number {
  if (!Number.isFinite(level)) return ENVIRONMENT_AMBIENT_DEFAULT;
  return Math.min(1, Math.max(0, level));
}

export function createDefaultEnvironmentLighting(): EnvironmentLighting {
  return { ambientLevel: ENVIRONMENT_AMBIENT_DEFAULT };
}

export function normalizeEnvironmentLighting(
  raw: Partial<EnvironmentLighting> | null | undefined,
): EnvironmentLighting {
  const base = createDefaultEnvironmentLighting();
  if (!raw || typeof raw !== 'object') return base;
  return {
    ambientLevel: clampAmbientLevel(
      typeof raw.ambientLevel === 'number' ? raw.ambientLevel : base.ambientLevel,
    ),
  };
}

/** Hemispheric intensity from ambient level. */
export function environmentHemiIntensity(ambientLevel: number): number {
  const a = clampAmbientLevel(ambientLevel);
  return 0.02 + a * 0.53;
}

/** Key directional intensity from ambient level. */
export function environmentSunIntensity(ambientLevel: number): number {
  const a = clampAmbientLevel(ambientLevel);
  return 0.01 + a * 0.34;
}

/** Clear-color RGB from ambient level (dark lab → brighter plate). */
export function environmentClearRgb(ambientLevel: number): [number, number, number] {
  const a = clampAmbientLevel(ambientLevel);
  const night: [number, number, number] = [0.008, 0.01, 0.016];
  const day: [number, number, number] = [0.07, 0.085, 0.11];
  return [
    night[0] + (day[0] - night[0]) * a,
    night[1] + (day[1] - night[1]) * a,
    night[2] + (day[2] - night[2]) * a,
  ];
}
