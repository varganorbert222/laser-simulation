/** Light emission mode parameters (domain types — no science readout dependency). */

export type LightMode = 'omni_lamp' | 'spotlight' | 'parallel' | 'laser';

export interface OmniParams {
  softRadiusM: number;
  falloff: number;
}

export interface SpotParams {
  innerConeDeg: number;
  outerConeDeg: number;
  apertureSharpness: number;
}

export interface ParallelParams {
  beamRadiusM: number;
  residualMrad: number;
}

export interface LaserParams {
  w0M: number;
  parallelness: number;
  /** Optional probe distance for w(z) readout (m). */
  probeDistanceM: number;
}

export type ModeParams =
  | { mode: 'omni_lamp'; omni: OmniParams }
  | { mode: 'spotlight'; spot: SpotParams }
  | { mode: 'parallel'; parallel: ParallelParams }
  | { mode: 'laser'; laser: LaserParams };
