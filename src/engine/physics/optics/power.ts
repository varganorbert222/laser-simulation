/** Emitter optical power limits and unit helpers (internal storage is always watts). */

import { clamp01, clampRange } from '../../math/clamp';

export const POWER_W_MIN = 0;
/** 500 kW */
export const POWER_W_MAX = 500_000;

export type PowerUnit = 'mW' | 'W' | 'kW';

export const POWER_UNITS: readonly PowerUnit[] = ['mW', 'W', 'kW'];

export const POWER_PRESETS_W = [
  0.005,
  0.05,
  0.2,
  1,
  5,
  1_000,
  10_000,
  100_000,
  500_000,
] as const;

export function clampPowerW(powerW: number): number {
  return clampRange(powerW, POWER_W_MIN, POWER_W_MAX, 0);
}

export function powerToUnit(powerW: number, unit: PowerUnit): number {
  switch (unit) {
    case 'mW':
      return powerW * 1000;
    case 'kW':
      return powerW / 1000;
    default:
      return powerW;
  }
}

export function powerFromUnit(value: number, unit: PowerUnit): number {
  if (!Number.isFinite(value)) return 0;
  switch (unit) {
    case 'mW':
      return clampPowerW(value / 1000);
    case 'kW':
      return clampPowerW(value * 1000);
    default:
      return clampPowerW(value);
  }
}

/** Suggest a convenient unit for displaying / editing a watt value. */
export function suggestPowerUnit(powerW: number): PowerUnit {
  if (powerW >= 1000) return 'kW';
  if (powerW >= 1) return 'W';
  return 'mW';
}

export function formatPowerW(powerW: number): string {
  const w = clampPowerW(powerW);
  if (w >= 1000) return `${trimNum(w / 1000)} kW`;
  if (w >= 1) return `${trimNum(w)} W`;
  if (w <= 0) return '0 W';
  return `${trimNum(w * 1000)} mW`;
}

/** Log-space slider 0..1 ↔ watts (usable from ~1 mW to 500 kW). */
export function powerWFromSliderT(t: number): number {
  const u = clamp01(t);
  const minPos = 0.001;
  return clampPowerW(minPos * Math.pow(POWER_W_MAX / minPos, u));
}

export function sliderTFromPowerW(powerW: number): number {
  const w = Math.max(0.001, clampPowerW(powerW));
  const minPos = 0.001;
  return Math.log(w / minPos) / Math.log(POWER_W_MAX / minPos);
}

function trimNum(n: number): string {
  if (!Number.isFinite(n)) return '0';
  const abs = Math.abs(n);
  if (abs >= 100) return n.toFixed(0);
  if (abs >= 10) return n.toFixed(1);
  if (abs >= 1) return n.toFixed(2);
  return n.toFixed(3);
}
