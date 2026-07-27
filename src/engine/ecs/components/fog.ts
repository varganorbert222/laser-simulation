/**
 * Fog / smoke GPU Navier–Stokes volume (grid atlas).
 * Independent of FluidVolume (SPH water) and decorative MediaVolume FBM.
 */
import type { Vec3 } from '../../math/vec3';
import { vec3 } from '../../math/vec3';
import { clampRange } from '../../math/clamp';
import {
  defaultFogPreset,
  isFogBoundaryMode,
  isFogGridRes,
  type FogBoundaryMode,
  type FogGridRes,
} from '../../physics/fog/presets';

export type { FogBoundaryMode, FogGridRes };

export interface FogVolume {
  halfExtents: Vec3;
  /** Simulation grid resolution per axis (32|48|64|96). Pack may prefer Quality.fluidGridRes. */
  gridRes: FogGridRes;
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
  /** Density clamp (closed-room saturation). */
  maxDensity: number;
  boundaryMode: FogBoundaryMode;
  windCoupling: number;
  inertiaCoupling: number;
  enabled: boolean;
}

export function defaultFogVolume(): FogVolume {
  const p = defaultFogPreset();
  return {
    halfExtents: vec3(1.5, 2, 1.5),
    gridRes: 32,
    viscosity: p.viscosity,
    dissipation: p.dissipation,
    buoyancy: p.buoyancy,
    vorticityStrength: p.vorticityStrength,
    temperatureAmbient: p.temperatureAmbient,
    emissionRate: p.emissionRate,
    opticalDensity: p.opticalDensity,
    color: [...p.color] as Vec3,
    scatter: p.scatter,
    absorption: p.absorption,
    boundaryPad: p.boundaryPad,
    maxDensity: p.maxDensity,
    boundaryMode: p.boundaryMode,
    windCoupling: 1,
    inertiaCoupling: 1,
    enabled: true,
  };
}

function clampHalf(v: unknown, fallback: number): number {
  return typeof v === 'number' ? clampRange(v, 0.05, 50, fallback) : fallback;
}

export function normalizeFogVolume(
  raw: Partial<FogVolume> & Record<string, unknown>,
): FogVolume {
  const d = defaultFogVolume();
  const half = Array.isArray(raw.halfExtents) ? raw.halfExtents : d.halfExtents;
  const color = Array.isArray(raw.color) ? raw.color : d.color;
  return {
    halfExtents: [
      clampHalf(half[0], d.halfExtents[0]),
      clampHalf(half[1], d.halfExtents[1]),
      clampHalf(half[2], d.halfExtents[2]),
    ] as Vec3,
    gridRes: isFogGridRes(raw.gridRes) ? raw.gridRes : d.gridRes,
    viscosity:
      typeof raw.viscosity === 'number' ? clampRange(raw.viscosity, 0, 2, d.viscosity) : d.viscosity,
    dissipation:
      typeof raw.dissipation === 'number'
        ? clampRange(raw.dissipation, 0, 1, d.dissipation)
        : d.dissipation,
    buoyancy:
      typeof raw.buoyancy === 'number' ? clampRange(raw.buoyancy, 0, 10, d.buoyancy) : d.buoyancy,
    vorticityStrength:
      typeof raw.vorticityStrength === 'number'
        ? clampRange(raw.vorticityStrength, 0, 10, d.vorticityStrength)
        : d.vorticityStrength,
    temperatureAmbient:
      typeof raw.temperatureAmbient === 'number'
        ? clampRange(raw.temperatureAmbient, -5, 5, d.temperatureAmbient)
        : d.temperatureAmbient,
    emissionRate:
      typeof raw.emissionRate === 'number'
        ? clampRange(raw.emissionRate, 0, 10, d.emissionRate)
        : d.emissionRate,
    opticalDensity:
      typeof raw.opticalDensity === 'number'
        ? clampRange(raw.opticalDensity, 0, 20, d.opticalDensity)
        : d.opticalDensity,
    color: [
      clampRange(Number(color[0]), 0, 1, d.color[0]),
      clampRange(Number(color[1]), 0, 1, d.color[1]),
      clampRange(Number(color[2]), 0, 1, d.color[2]),
    ] as Vec3,
    scatter: typeof raw.scatter === 'number' ? clampRange(raw.scatter, 0, 10, d.scatter) : d.scatter,
    absorption:
      typeof raw.absorption === 'number'
        ? clampRange(raw.absorption, 0, 10, d.absorption)
        : d.absorption,
    boundaryPad:
      typeof raw.boundaryPad === 'number'
        ? clampRange(raw.boundaryPad, 0, 4, d.boundaryPad)
        : d.boundaryPad,
    maxDensity:
      typeof raw.maxDensity === 'number'
        ? clampRange(raw.maxDensity, 0.05, 8, d.maxDensity)
        : d.maxDensity,
    boundaryMode: isFogBoundaryMode(raw.boundaryMode) ? raw.boundaryMode : d.boundaryMode,
    windCoupling:
      typeof raw.windCoupling === 'number'
        ? clampRange(raw.windCoupling, 0, 1, d.windCoupling)
        : d.windCoupling,
    inertiaCoupling:
      typeof raw.inertiaCoupling === 'number'
        ? clampRange(raw.inertiaCoupling, 0, 1, d.inertiaCoupling)
        : d.inertiaCoupling,
    enabled: typeof raw.enabled === 'boolean' ? raw.enabled : d.enabled,
  };
}

/**
 * Migrate legacy FluidVolume(kind=smoke) payloads into FogVolume.
 * Water FluidVolume is left for SPH rewrite (caller drops or keeps separately).
 */
export function fogVolumeFromLegacyFluid(
  raw: Record<string, unknown> | null | undefined,
): FogVolume | null {
  if (!raw || typeof raw !== 'object') return null;
  const kind = raw['kind'];
  if (kind === 'water') return null;
  return normalizeFogVolume(raw as Partial<FogVolume> & Record<string, unknown>);
}
