/**
 * Shared fog grid resolution type (Quality.fluidGridRes — historical name).
 * Smoke optics: physics/fog/presets. Water optics: physics/fluid/water-presets.
 */

export type FluidGridRes = 32 | 48 | 64 | 96;

export function isFluidGridRes(v: unknown): v is FluidGridRes {
  return v === 32 || v === 48 || v === 64 || v === 96;
}
