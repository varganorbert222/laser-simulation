/**
 * FogVolume solver / appearance presets (grid NS smoke).
 */
import type { Vec3 } from '../../math/vec3';
import { vec3 } from '../../math/vec3';

export type FogGridRes = 32 | 48 | 64 | 96;

export type FogBoundaryMode = 'closed' | 'openTop';

export function isFogGridRes(v: unknown): v is FogGridRes {
  return v === 32 || v === 48 || v === 64 || v === 96;
}

export function isFogBoundaryMode(v: unknown): v is FogBoundaryMode {
  return v === 'closed' || v === 'openTop';
}

export interface FogPresetFields {
  viscosity: number;
  dissipation: number;
  buoyancy: number;
  vorticityStrength: number;
  temperatureAmbient: number;
  emissionRate: number;
  opticalDensity: number;
  color: Vec3;
  scatter: number;
  absorption: number;
  boundaryPad: number;
  maxDensity: number;
  boundaryMode: FogBoundaryMode;
}

export function defaultFogPreset(): FogPresetFields {
  return {
    viscosity: 0.0005,
    dissipation: 0.015,
    buoyancy: 1.2,
    vorticityStrength: 2.5,
    temperatureAmbient: 0,
    emissionRate: 1.2,
    opticalDensity: 1.4,
    color: vec3(0.55, 0.55, 0.55),
    scatter: 0.45,
    absorption: 0.08,
    boundaryPad: 1,
    maxDensity: 1,
    boundaryMode: 'closed',
  };
}
