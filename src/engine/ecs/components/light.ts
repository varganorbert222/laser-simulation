import { clampRange, clampUnit } from '../../math/clamp';
import type { ModeParams } from '../../physics/optics/modes';
import {
  defaultModeParams,
  normalizeModeParamsPublic,
} from '../../physics/optics/modes';
import {
  apertureCouplingFromLegacyMaterial,
  type LegacyFixtureSurfaceMaterial,
} from '../../physics/optics/surface-material';
import {
  defaultOpticsSpill,
  normalizeOpticsSpill,
  type OpticsSpillParams,
} from '../../physics/optics/optics-spill';
import { clampPowerW } from '../../physics/optics/power';
import {
  defaultHdrAppearance,
  estimateIntensityLmFromSpectral,
  normalizeHdrAppearance,
} from '../../physics/optics/light-appearance';
import { wavelengthToRgb } from '../../physics/optics/wavelength';

export type { OpticsSpillParams } from '../../physics/optics/optics-spill';

export interface LightEmitter {
  wavelengthNm: number;
  powerW: number;
  enabled: boolean;
  params: ModeParams;
  /**
   * HDR lamp filter (0–1). Used when mode ≠ laser; lasers ignore this.
   * Unity Light.color analogue.
   */
  colorRgb: [number, number, number];
  /**
   * Photometric intensity in lumens (Unity-like Intensity). Non-laser only.
   */
  intensityLm: number;
  /** When true, chromaticity comes from colorTemperatureK (Unity useColorTemperature). */
  useColorTemperature: boolean;
  /** Correlated color temperature in kelvin (typically 1000–20000). */
  colorTemperatureK: number;
  /**
   * Presentation-only multipliers (theatrical glow / bloom). Ignored on the
   * scientific radiance path when theatricalGlow is off; surfaceGain is unused
   * (always treated as 1 for physical surface irradiance).
   */
  surfaceGain: number;
  glowGain: number;
  bloomGain: number;
  /**
   * Exit-pupil → housing coupling for theatrical housing glow only (0–1).
   */
  apertureCoupling: number;
  /**
   * Residual optical power fraction outside the designed beam (energy-conserving).
   * Core × (1 − f); wide residual lobe gets fraction f.
   */
  spill: OpticsSpillParams;
  /**
   * Screen-space lens flare (camera optical model: ghosts / streaks / halo).
   * Gated globally by Quality.lensFlare; per-light opt-in.
   */
  lensFlareEnabled: boolean;
  /** Flare strength multiplier (0–8). Default 1. */
  lensFlareIntensity: number;
}

export function defaultLightEmitter(): LightEmitter {
  const hdr = defaultHdrAppearance('laser');
  return {
    wavelengthNm: 532,
    powerW: 1,
    enabled: true,
    params: defaultModeParams('laser'),
    colorRgb: hdr.colorRgb,
    intensityLm: hdr.intensityLm,
    useColorTemperature: hdr.useColorTemperature,
    colorTemperatureK: hdr.colorTemperatureK,
    surfaceGain: 1,
    glowGain: 1,
    bloomGain: 1,
    apertureCoupling: 0.4,
    spill: defaultOpticsSpill(),
    lensFlareEnabled: true,
    lensFlareIntensity: 1,
  };
}

export function defaultSunLightEmitter(): LightEmitter {
  const hdr = defaultHdrAppearance('sun');
  return {
    wavelengthNm: 560,
    powerW: 100,
    enabled: true,
    params: defaultModeParams('sun'),
    colorRgb: hdr.colorRgb,
    intensityLm: hdr.intensityLm,
    useColorTemperature: hdr.useColorTemperature,
    colorTemperatureK: hdr.colorTemperatureK,
    surfaceGain: 1,
    glowGain: 0.2,
    bloomGain: 0.4,
    apertureCoupling: 1,
    spill: defaultOpticsSpill(),
    lensFlareEnabled: true,
    lensFlareIntensity: 1.25,
  };
}

export function defaultLightEmitterForMode(
  mode: import('../../physics/optics/modes').LightMode,
): LightEmitter {
  if (mode === 'sun') return defaultSunLightEmitter();
  const base = defaultLightEmitter();
  if (mode === 'laser') {
    return { ...base, params: defaultModeParams('laser') };
  }
  const hdr = defaultHdrAppearance(mode);
  return {
    ...base,
    params: defaultModeParams(mode),
    colorRgb: hdr.colorRgb,
    intensityLm: hdr.intensityLm,
    useColorTemperature: hdr.useColorTemperature,
    colorTemperatureK: hdr.colorTemperatureK,
  };
}

function clampGain(v: number, fallback: number): number {
  return clampRange(v, 0, 8, fallback);
}

function normalizeModeParams(
  raw: ModeParams | undefined,
  fallback: ModeParams,
): ModeParams {
  return normalizeModeParamsPublic(raw, fallback);
}

/** Fill missing fields when loading older saves. */
export function normalizeLightEmitter(
  raw: Partial<LightEmitter> & Record<string, unknown>,
): LightEmitter {
  const d = defaultLightEmitter();
  const legacyMat = raw['surfaceMaterial'] as LegacyFixtureSurfaceMaterial | undefined;
  const apertureCoupling =
    typeof raw.apertureCoupling === 'number'
      ? clampUnit(raw.apertureCoupling, d.apertureCoupling)
      : apertureCouplingFromLegacyMaterial(legacyMat, d.apertureCoupling);

  const surfaceGain = clampGain(
    typeof raw.surfaceGain === 'number'
      ? raw.surfaceGain
      : typeof raw['surfaceIntensity'] === 'number'
        ? (raw['surfaceIntensity'] as number)
        : d.surfaceGain,
    d.surfaceGain,
  );
  const glowGain = clampGain(
    typeof raw.glowGain === 'number'
      ? raw.glowGain
      : typeof raw['glowIntensity'] === 'number'
        ? (raw['glowIntensity'] as number)
        : d.glowGain,
    d.glowGain,
  );
  const bloomGain = clampGain(
    typeof raw.bloomGain === 'number'
      ? raw.bloomGain
      : typeof raw['bloomIntensity'] === 'number'
        ? (raw['bloomIntensity'] as number)
        : d.bloomGain,
    d.bloomGain,
  );

  const params = normalizeModeParams(raw.params as ModeParams | undefined, d.params);
  const wavelengthNm =
    typeof raw.wavelengthNm === 'number' ? raw.wavelengthNm : d.wavelengthNm;
  const powerW = clampPowerW(typeof raw.powerW === 'number' ? raw.powerW : d.powerW);
  const modeFallback = defaultHdrAppearance(params.mode);
  const migratedHdr =
    typeof raw.intensityLm === 'number' || Array.isArray(raw.colorRgb)
      ? normalizeHdrAppearance(
          {
            colorRgb: raw.colorRgb as [number, number, number] | undefined,
            intensityLm: raw.intensityLm as number | undefined,
            useColorTemperature: raw.useColorTemperature as boolean | undefined,
            colorTemperatureK: raw.colorTemperatureK as number | undefined,
          },
          modeFallback,
        )
      : normalizeHdrAppearance(
          {
            colorRgb: wavelengthToRgb(wavelengthNm) as [number, number, number],
            intensityLm: estimateIntensityLmFromSpectral(powerW, wavelengthNm),
            useColorTemperature: false,
            colorTemperatureK: modeFallback.colorTemperatureK,
          },
          modeFallback,
        );

  return {
    wavelengthNm,
    powerW,
    enabled: typeof raw.enabled === 'boolean' ? raw.enabled : d.enabled,
    params,
    colorRgb: migratedHdr.colorRgb,
    intensityLm: migratedHdr.intensityLm,
    useColorTemperature: migratedHdr.useColorTemperature,
    colorTemperatureK: migratedHdr.colorTemperatureK,
    surfaceGain,
    glowGain,
    bloomGain,
    apertureCoupling,
    spill: normalizeOpticsSpill(
      raw.spill as Partial<OpticsSpillParams> | null | undefined,
    ),
    lensFlareEnabled:
      typeof raw.lensFlareEnabled === 'boolean' ? raw.lensFlareEnabled : d.lensFlareEnabled,
    lensFlareIntensity: clampGain(
      typeof raw.lensFlareIntensity === 'number' ? raw.lensFlareIntensity : d.lensFlareIntensity,
      d.lensFlareIntensity,
    ),
  };
}
