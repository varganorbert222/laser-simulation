import {
  SMOKE_CONE_ANGLE_DEG_MAX,
  SMOKE_CONE_ANGLE_DEG_MIN,
  SMOKE_EMISSION_RATE_MAX,
  SMOKE_EMISSION_RATE_MIN,
  SMOKE_PLUME_LENGTH_M_MAX,
  SMOKE_PLUME_LENGTH_M_MIN,
} from '../../physics/optics/smoke-plume';
import { clampRange } from '../../math/clamp';

/**
 * Fog machine / smoke emitter — pairs with MediaVolume (particulate) on the same entity.
 * Nozzle = local +Z (same convention as LightEmitter).
 */
export interface SmokeEmitter {
  enabled: boolean;
  /** Multiplies plume density (0 = off). Typical 0–3. */
  emissionRate: number;
  /** Spray cone half-angle in degrees. */
  coneAngleDeg: number;
  /** Soft axial falloff length (m). */
  plumeLengthM: number;
}

export function defaultSmokeEmitter(): SmokeEmitter {
  return {
    enabled: true,
    emissionRate: 1,
    coneAngleDeg: 25,
    plumeLengthM: 4,
  };
}

function clampSmokeEmissionRate(v: number): number {
  return clampRange(v, SMOKE_EMISSION_RATE_MIN, SMOKE_EMISSION_RATE_MAX, 1);
}

function clampSmokeConeAngleDeg(v: number): number {
  return clampRange(v, SMOKE_CONE_ANGLE_DEG_MIN, SMOKE_CONE_ANGLE_DEG_MAX, 25);
}

function clampSmokePlumeLengthM(v: number): number {
  return clampRange(v, SMOKE_PLUME_LENGTH_M_MIN, SMOKE_PLUME_LENGTH_M_MAX, 4);
}

export function normalizeSmokeEmitter(
  raw: Partial<SmokeEmitter> & Record<string, unknown>,
): SmokeEmitter {
  const d = defaultSmokeEmitter();
  return {
    enabled: typeof raw.enabled === 'boolean' ? raw.enabled : d.enabled,
    emissionRate:
      typeof raw.emissionRate === 'number' ? clampSmokeEmissionRate(raw.emissionRate) : d.emissionRate,
    coneAngleDeg:
      typeof raw.coneAngleDeg === 'number' ? clampSmokeConeAngleDeg(raw.coneAngleDeg) : d.coneAngleDeg,
    plumeLengthM:
      typeof raw.plumeLengthM === 'number' ? clampSmokePlumeLengthM(raw.plumeLengthM) : d.plumeLengthM,
  };
}
