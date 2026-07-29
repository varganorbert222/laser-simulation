/**
 * SPH water tank (FluidVolume) — particle fluid, not grid NS fog.
 * Phase 2 of FogVolume / FluidVolume split.
 */
import type { Vec3 } from '../../math/vec3';
import { vec3 } from '../../math/vec3';
import { clampRange } from '../../math/clamp';
import { particleCountForFill } from '../../physics/fluid/sph-sim';
import {
  applyWaterPreset,
  isWaterPresetId,
  type WaterPresetId,
} from '../../physics/fluid/water-presets';
import {
  surfaceMaterialFromPreset,
  type SurfaceMaterial,
} from '../../physics/optics/surface/surface-material';

export type { WaterPresetId };

/** Bounding tank shell around the water OBB. */
export type FluidWallMode = 'none' | 'glass' | 'solid';

export const FLUID_WALL_MODES = ['none', 'glass', 'solid'] as const satisfies readonly FluidWallMode[];

export function isFluidWallMode(v: unknown): v is FluidWallMode {
  return v === 'none' || v === 'glass' || v === 'solid';
}

/** PBR SurfaceMaterial for a tank wall mode (null when no shell). */
export function surfaceMaterialForFluidWall(mode: FluidWallMode): SurfaceMaterial | null {
  if (mode === 'none') return null;
  if (mode === 'glass') return surfaceMaterialFromPreset('glass_clear');
  return {
    preset: 'custom',
    albedo: 0.42,
    metalness: 0.08,
    roughness: 0.38,
    transmission: 0,
  };
}

export interface FluidVolume {
  halfExtents: Vec3;
  /**
   * Particle radius (m). Count is derived from fillFraction × OBB volume / packing cell.
   */
  particleRadius: number;
  /** Liquid volume fraction of the OBB (0–1) used for spawn. */
  fillFraction: number;
  /**
   * Bounding tank wall: none = water only; glass = clear PBR transmission/refraction;
   * solid = opaque PBR shell.
   */
  wallMode: FluidWallMode;
  restDensity: number;
  stiffness: number;
  viscosity: number;
  /** Optical / look */
  opticalDensity: number;
  color: Vec3;
  scatter: number;
  absorption: number;
  ior: number;
  causticStrength: number;
  /**
   * Legacy Fresnel-edge hint for the water PP (not spray/foam).
   * Kept for saves/presets; no longer exposed in the main FluidVolume UI.
   */
  foamStrength: number;
  /** Named look preset; `custom` keeps free-form optics/waves. */
  presetId: WaterPresetId;
  /** Free-surface wave amplitude (m, Gerstner / multi-sine). */
  waveAmplitude: number;
  waveFrequency: number;
  waveSteepness: number;
  /**
   * Unused by WaterOpticsBinder (no SPH wind force). Kept for serialize compatibility.
   */
  windCoupling: number;
  inertiaCoupling: number;
  enabled: boolean;
}

export function defaultFluidVolume(): FluidVolume {
  const p = applyWaterPreset('aquarium');
  return {
    halfExtents: vec3(1.2, 0.9, 0.8),
    particleRadius: 0.06,
    fillFraction: p.fillFraction ?? 0.55,
    wallMode: 'none',
    restDensity: 1,
    stiffness: 3,
    viscosity: 0.08,
    opticalDensity: p.opticalDensity,
    color: vec3(p.color[0], p.color[1], p.color[2]),
    scatter: p.scatter,
    absorption: p.absorption,
    ior: p.ior,
    causticStrength: p.causticStrength,
    foamStrength: p.foamStrength,
    presetId: 'aquarium',
    waveAmplitude: p.waveAmplitude,
    waveFrequency: p.waveFrequency,
    waveSteepness: p.waveSteepness,
    windCoupling: 0.15,
    inertiaCoupling: 1,
    enabled: true,
  };
}

/** Derived particle count for UI / pack (fill × size → how many fit). */
export function fluidParticleCount(
  vol: Pick<FluidVolume, 'halfExtents' | 'fillFraction' | 'particleRadius'>,
): number {
  return particleCountForFill(vol.halfExtents, vol.fillFraction, vol.particleRadius);
}

function clampHalf(v: unknown, fallback: number): number {
  return typeof v === 'number' ? clampRange(v, 0.05, 50, fallback) : fallback;
}

function migrateParticleRadius(
  raw: Partial<FluidVolume> & Record<string, unknown>,
  half: Vec3,
  fill: number,
  d: FluidVolume,
): number {
  if (typeof raw.particleRadius === 'number') {
    return clampRange(raw.particleRadius, 0.015, 0.35, d.particleRadius);
  }
  // Legacy saves: invert count → spacing → radius.
  const legacyCount = raw['particleCount'];
  if (typeof legacyCount === 'number' && legacyCount > 0) {
    const liquidVol = 8 * half[0] * half[1] * half[2] * fill;
    const spacing = Math.cbrt(liquidVol / Math.max(legacyCount, 1));
    return clampRange(spacing * 0.5, 0.015, 0.35, d.particleRadius);
  }
  return d.particleRadius;
}

export function normalizeFluidVolume(
  raw: Partial<FluidVolume> & Record<string, unknown>,
): FluidVolume {
  const d = defaultFluidVolume();
  // Legacy kind-based FluidVolume: ignore smoke payloads (migrated to FogVolume).
  if (raw['kind'] === 'smoke') {
    return d;
  }

  const presetId = isWaterPresetId(raw.presetId) ? raw.presetId : d.presetId;
  // Named presets supply optics/waves; per-field raw values still override.
  const named = presetId === 'aquarium' || presetId === 'lake' || presetId === 'sea';
  const p = applyWaterPreset(named ? presetId : 'aquarium');
  const baseColor = named ? p.color : d.color;

  const half = Array.isArray(raw.halfExtents) ? raw.halfExtents : d.halfExtents;
  const color = Array.isArray(raw.color) ? raw.color : baseColor;
  const fillDefault = named && typeof p.fillFraction === 'number' ? p.fillFraction : d.fillFraction;
  const fill =
    typeof raw.fillFraction === 'number'
      ? raw.fillFraction
      : typeof raw['fillHeight'] === 'number'
        ? (raw['fillHeight'] as number)
        : fillDefault;
  const fillFraction = clampRange(fill, 0.05, 0.95, fillDefault);
  const halfExtents = [
    clampHalf(half[0], d.halfExtents[0]),
    clampHalf(half[1], d.halfExtents[1]),
    clampHalf(half[2], d.halfExtents[2]),
  ] as Vec3;

  const opt = named ? p : d;
  return {
    halfExtents,
    particleRadius: migrateParticleRadius(raw, halfExtents, fillFraction, d),
    fillFraction,
    wallMode: isFluidWallMode(raw.wallMode) ? raw.wallMode : d.wallMode,
    restDensity:
      typeof raw.restDensity === 'number'
        ? clampRange(raw.restDensity, 0.1, 4, d.restDensity)
        : d.restDensity,
    stiffness:
      typeof raw.stiffness === 'number' ? clampRange(raw.stiffness, 0.1, 20, d.stiffness) : d.stiffness,
    viscosity:
      typeof raw.viscosity === 'number' ? clampRange(raw.viscosity, 0, 2, d.viscosity) : d.viscosity,
    opticalDensity:
      typeof raw.opticalDensity === 'number'
        ? clampRange(raw.opticalDensity, 0, 20, opt.opticalDensity)
        : opt.opticalDensity,
    color: [
      clampRange(Number(color[0]), 0, 1, baseColor[0]),
      clampRange(Number(color[1]), 0, 1, baseColor[1]),
      clampRange(Number(color[2]), 0, 1, baseColor[2]),
    ] as Vec3,
    scatter: typeof raw.scatter === 'number' ? clampRange(raw.scatter, 0, 10, opt.scatter) : opt.scatter,
    absorption:
      typeof raw.absorption === 'number'
        ? clampRange(raw.absorption, 0, 10, opt.absorption)
        : opt.absorption,
    ior: typeof raw.ior === 'number' ? clampRange(raw.ior, 1.01, 2.5, opt.ior) : opt.ior,
    causticStrength:
      typeof raw.causticStrength === 'number'
        ? clampRange(raw.causticStrength, 0, 4, opt.causticStrength)
        : opt.causticStrength,
    foamStrength:
      typeof raw.foamStrength === 'number'
        ? clampRange(raw.foamStrength, 0, 1, opt.foamStrength)
        : opt.foamStrength,
    presetId,
    waveAmplitude:
      typeof raw.waveAmplitude === 'number'
        ? clampRange(raw.waveAmplitude, 0, 0.5, opt.waveAmplitude)
        : opt.waveAmplitude,
    waveFrequency:
      typeof raw.waveFrequency === 'number'
        ? clampRange(raw.waveFrequency, 0, 20, opt.waveFrequency)
        : opt.waveFrequency,
    waveSteepness:
      typeof raw.waveSteepness === 'number'
        ? clampRange(raw.waveSteepness, 0, 1, opt.waveSteepness)
        : opt.waveSteepness,
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
