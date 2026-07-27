/**
 * Shared fluid/fog grid quality helpers (resolution + Jacobi ladder).
 * Smoke optics: physics/fog/presets. Water optics: physics/fluid/water-presets.
 */

export type FluidGridRes = 32 | 48 | 64 | 96;
export const FLUID_GRID_RESOLUTIONS = [32, 48, 64, 96] as const;

export type FluidBoundaryMode = 'closed' | 'openTop';
export const FLUID_BOUNDARY_MODES = ['closed', 'openTop'] as const;

export function isFluidGridRes(v: unknown): v is FluidGridRes {
  return v === 32 || v === 48 || v === 64 || v === 96;
}
export function isFluidBoundaryMode(v: unknown): v is FluidBoundaryMode {
  return v === 'closed' || v === 'openTop';
}

export function jacobiIterationsForLadder(
  ladder: 'low' | 'medium' | 'high' | 'ultra' | 'custom',
): number {
  switch (ladder) {
    case 'low':
      return 12;
    case 'medium':
      return 18;
    case 'high':
      return 24;
    case 'ultra':
      return 32;
    default:
      return 24;
  }
}

export function fluidGridResForLadder(
  ladder: 'low' | 'medium' | 'high' | 'ultra' | 'custom',
): FluidGridRes {
  switch (ladder) {
    case 'low':
      return 32;
    case 'medium':
      return 48;
    case 'high':
      return 64;
    case 'ultra':
      return 96;
    default:
      return 64;
  }
}
