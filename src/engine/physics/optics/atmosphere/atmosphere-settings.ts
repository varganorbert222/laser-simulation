/**
 * Procedural Earth-atmosphere sky resource: SPA site/time + atmosphere model +
 * sky quality / appearance + optional time-of-day animation.
 */

import {
  computeSolarPosition,
  localCivilFromUtcMs,
  utcMsFromLocalCivil,
  type SolarPosition,
} from '../../astro/solar-position';
import {
  DEFAULT_MOON_TEXTURE_ID,
  DEFAULT_NIGHT_SKY_TEXTURE_ID,
} from '../../../assets/asset-manifest';
import {
  createDefaultAtmosphereModel,
  normalizeAtmosphereModel,
  type AtmosphereModel,
} from './atmosphere-model';
import { clampRgb, type Rgb01 } from '../display/color';

/** Same ladder as volumetric {@link QualityLadder}. */
export type AtmosphereQualityPreset = 'low' | 'medium' | 'high' | 'ultra' | 'custom';

export interface AtmosphereQualityTune {
  skyViewSamples: number;
  transmittanceSamples: number;
  aerialSamples: number;
  /** ReflectionProbe face resolution. */
  envCubeSize: number;
  /** Sky View LUT resolution (higher = smoother horizon / sun limb). */
  skyViewLutWidth: number;
  skyViewLutHeight: number;
  /** Transmittance LUT resolution (Bruneton baseline 256×64). */
  transmittanceLutWidth: number;
  transmittanceLutHeight: number;
  /** Camera aerial-perspective volume (UE-style XYZ). */
  aerialLutWidth: number;
  aerialLutHeight: number;
  aerialLutDepth: number;
}

/**
 * Sky quality ladder aligned with Unity HDRP PBS / Unreal SkyAtmosphere tiers:
 * - medium ≈ Bruneton + UE default SkyView / Aerial volume
 * - high/ultra ≈ Epic / cinematic realtime (larger LUTs + denser marches)
 */
const ATMOSPHERE_QUALITY_TUNE: Record<
  Exclude<AtmosphereQualityPreset, 'custom'>,
  AtmosphereQualityTune
> = {
  low: {
    skyViewSamples: 32,
    transmittanceSamples: 40,
    aerialSamples: 12,
    envCubeSize: 128,
    skyViewLutWidth: 192,
    skyViewLutHeight: 96,
    transmittanceLutWidth: 256,
    transmittanceLutHeight: 64,
    aerialLutWidth: 24,
    aerialLutHeight: 24,
    aerialLutDepth: 16,
  },
  medium: {
    skyViewSamples: 64,
    transmittanceSamples: 64,
    aerialSamples: 20,
    envCubeSize: 256,
    skyViewLutWidth: 256,
    skyViewLutHeight: 128,
    transmittanceLutWidth: 256,
    transmittanceLutHeight: 64,
    aerialLutWidth: 32,
    aerialLutHeight: 32,
    aerialLutDepth: 16,
  },
  high: {
    skyViewSamples: 96,
    transmittanceSamples: 80,
    aerialSamples: 28,
    envCubeSize: 512,
    skyViewLutWidth: 384,
    skyViewLutHeight: 192,
    transmittanceLutWidth: 512,
    transmittanceLutHeight: 128,
    aerialLutWidth: 32,
    aerialLutHeight: 32,
    aerialLutDepth: 32,
  },
  ultra: {
    skyViewSamples: 128,
    transmittanceSamples: 96,
    aerialSamples: 40,
    envCubeSize: 512,
    skyViewLutWidth: 512,
    skyViewLutHeight: 256,
    transmittanceLutWidth: 512,
    transmittanceLutHeight: 128,
    aerialLutWidth: 48,
    aerialLutHeight: 48,
    aerialLutDepth: 32,
  },
};

export function atmosphereQualityTune(
  preset: Exclude<AtmosphereQualityPreset, 'custom'>,
): AtmosphereQualityTune {
  return ATMOSPHERE_QUALITY_TUNE[preset];
}

export function normalizeAtmosphereQualityPreset(v: unknown): AtmosphereQualityPreset {
  if (v === 'low' || v === 'medium' || v === 'high' || v === 'ultra' || v === 'custom') {
    return v;
  }
  return 'medium';
}

export function matchAtmosphereQualityPreset(s: {
  skyViewSamples: number;
  transmittanceSamples: number;
  aerialSamples: number;
  envCubeSize: number;
  skyViewLutWidth?: number;
  skyViewLutHeight?: number;
  transmittanceLutWidth?: number;
  transmittanceLutHeight?: number;
  aerialLutWidth?: number;
  aerialLutHeight?: number;
  aerialLutDepth?: number;
}): AtmosphereQualityPreset {
  for (const id of ['low', 'medium', 'high', 'ultra'] as const) {
    const t = ATMOSPHERE_QUALITY_TUNE[id];
    if (
      s.skyViewSamples === t.skyViewSamples &&
      s.transmittanceSamples === t.transmittanceSamples &&
      s.aerialSamples === t.aerialSamples &&
      s.envCubeSize === t.envCubeSize &&
      (s.skyViewLutWidth === undefined || s.skyViewLutWidth === t.skyViewLutWidth) &&
      (s.skyViewLutHeight === undefined || s.skyViewLutHeight === t.skyViewLutHeight) &&
      (s.transmittanceLutWidth === undefined ||
        s.transmittanceLutWidth === t.transmittanceLutWidth) &&
      (s.transmittanceLutHeight === undefined ||
        s.transmittanceLutHeight === t.transmittanceLutHeight) &&
      (s.aerialLutWidth === undefined || s.aerialLutWidth === t.aerialLutWidth) &&
      (s.aerialLutHeight === undefined || s.aerialLutHeight === t.aerialLutHeight) &&
      (s.aerialLutDepth === undefined || s.aerialLutDepth === t.aerialLutDepth)
    ) {
      return id;
    }
  }
  return 'custom';
}

/** Named hour-of-day shortcuts (local civil, decimal hours). */
export const ATMOSPHERE_TIME_PRESETS = {
  dawn: 5.5,
  morning: 9,
  noon: 12,
  afternoon: 15,
  goldenHour: 18.5,
  dusk: 20,
  night: 23,
} as const;

export type AtmosphereTimePresetId = keyof typeof ATMOSPHERE_TIME_PRESETS;

/** Season date anchors (month/day) for the current settings year. */
export const ATMOSPHERE_SEASON_PRESETS = {
  springEquinox: { month: 3, day: 20 },
  summerSolstice: { month: 6, day: 21 },
  autumnEquinox: { month: 9, day: 22 },
  winterSolstice: { month: 12, day: 21 },
} as const;

export type AtmosphereSeasonPresetId = keyof typeof ATMOSPHERE_SEASON_PRESETS;

export interface AtmosphereSettings {
  /** When true, SPA drives sun direction and procedural skybox replaces clear-color. */
  enabled: boolean;
  latitudeDeg: number;
  longitudeDeg: number;
  /** Hours east of UTC (e.g. CET = 1, CEST = 2). */
  timezoneOffsetHours: number;
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  /**
   * When true, civil time advances each frame by {@link timeSpeedHoursPerSecond}.
   */
  timeAnimating: boolean;
  /** Simulated hours advanced per real second (e.g. 1 = 1 h/s, 24 ≈ full day/s). */
  timeSpeedHoursPerSecond: number;
  /** Sky LUT / cubemap quality ladder (mirrors volumetric presets). */
  qualityPreset: AtmosphereQualityPreset;
  skyViewSamples: number;
  transmittanceSamples: number;
  aerialSamples: number;
  envCubeSize: number;
  skyViewLutWidth: number;
  skyViewLutHeight: number;
  transmittanceLutWidth: number;
  transmittanceLutHeight: number;
  aerialLutWidth: number;
  aerialLutHeight: number;
  aerialLutDepth: number;
  /** Apparent sun disc diameter in degrees (real ≈ 0.53). */
  sunAngularDiameterDeg: number;
  /** Sky / IBL exposure multiplier (typical engines: 0.05–8). Default ~1.35 for vivid noon. */
  exposure: number;
  /** 0 = analytical sky only, 1 = full Sky View LUT when ready. */
  lutBlend: number;
  /** StandardMaterial / environmentTexture reflection intensity. */
  reflectionLevel: number;
  /**
   * @deprecated Derived from {@link Quality.colorProfile} at render time
   * (`skyAllowsHdrColors`). Kept on saves for back-compat; do not treat as
   * an independent HDR switch — Unity/Unreal keep sky energy in the HDR
   * buffer and clamp only at the display tonemapper.
   */
  skyboxHdrColors: boolean;
  /**
   * Night starfield exposure (NightSky equirect). Default 1 ≈ previous baked look.
   */
  nightExposure: number;
  /**
   * Apparent moon disc diameter in degrees.
   * Default ≈ 3× the previous artistic size (~1.15× sun → ~3.45× sun ≈ 1.83°).
   */
  moonAngularDiameterDeg: number;
  /** Moon disc brightness multiplier. */
  moonExposure: number;
  /**
   * How strongly night textures replace the day sky after twilight (0–1).
   */
  nightBlendStrength: number;
  /**
   * Unity-style skybox Ground color (below horizon). Default near-black.
   */
  skyboxGroundColor: readonly [number, number, number];
  /**
   * Unity-style Equator / horizon band color (rim between sky and ground).
   */
  skyboxEquatorColor: readonly [number, number, number];
  /**
   * Static skybox from `data/manifest.json` skyboxes (photodome / cubemap).
   * Used when {@link enabled} is false; null = clear-color backdrop.
   */
  skyboxAssetId: string | null;
  /** Night starfield equirect texture id (`manifest.textures`). */
  nightSkyTextureId: string;
  /** Moon disc texture id (`manifest.textures`). */
  moonTextureId: string;
  model: AtmosphereModel;
}

/** Budapest-ish default site; disabled so existing lab demos keep clear-color. */
export function createDefaultAtmosphereSettings(): AtmosphereSettings {
  const qualityPreset: Exclude<AtmosphereQualityPreset, 'custom'> = 'medium';
  const tune = atmosphereQualityTune(qualityPreset);
  return {
    enabled: false,
    latitudeDeg: 47.4979,
    longitudeDeg: 19.0402,
    timezoneOffsetHours: 2,
    year: 2026,
    month: 6,
    day: 21,
    hour: 12,
    minute: 0,
    timeAnimating: false,
    timeSpeedHoursPerSecond: 1,
    qualityPreset,
    ...tune,
    sunAngularDiameterDeg: 0.53,
    exposure: 1.35,
    lutBlend: 1,
    reflectionLevel: 0.95,
    skyboxHdrColors: true,
    nightExposure: 1,
    // Previous disc was ~1.15× sun diameter; default is 3× that for visibility.
    moonAngularDiameterDeg: 0.53 * 1.15 * 3,
    moonExposure: 1,
    nightBlendStrength: 1,
    // Unity Procedural Skybox Ground — dark void under the horizon.
    skyboxGroundColor: [0.02, 0.02, 0.025],
    // Horizon / equator band — cooler cyan so noon sky stays vivid.
    skyboxEquatorColor: [0.36, 0.58, 0.88],
    skyboxAssetId: null,
    nightSkyTextureId: DEFAULT_NIGHT_SKY_TEXTURE_ID,
    moonTextureId: DEFAULT_MOON_TEXTURE_ID,
    model: createDefaultAtmosphereModel(),
  };
}

function clamp(n: number, lo: number, hi: number, d: number): number {
  if (typeof n !== 'number' || !Number.isFinite(n)) return d;
  return Math.max(lo, Math.min(hi, n));
}

function clampEnvCubeSize(n: number, d: number): number {
  const allowed = [64, 128, 256, 512];
  const v = Math.round(clamp(n, 64, 512, d));
  let best = allowed[0];
  let bestD = Math.abs(v - best);
  for (const a of allowed) {
    const dist = Math.abs(v - a);
    if (dist < bestD) {
      best = a;
      bestD = dist;
    }
  }
  return best;
}

function clampLutDim(n: number, lo: number, hi: number, d: number): number {
  return Math.round(clamp(n, lo, hi, d));
}

export function createAtmosphereSettingsForQuality(
  preset: Exclude<AtmosphereQualityPreset, 'custom'>,
  base?: AtmosphereSettings,
): AtmosphereSettings {
  const prev = base ?? createDefaultAtmosphereSettings();
  const tune = atmosphereQualityTune(preset);
  return normalizeAtmosphereSettings({
    ...prev,
    qualityPreset: preset,
    ...tune,
  });
}

export function normalizeAtmosphereSettings(
  raw: Partial<AtmosphereSettings> | null | undefined,
): AtmosphereSettings {
  const base = createDefaultAtmosphereSettings();
  if (!raw || typeof raw !== 'object') return base;
  const qualityPresetRaw = normalizeAtmosphereQualityPreset(
    raw.qualityPreset ?? base.qualityPreset,
  );
  const tunePreset: Exclude<AtmosphereQualityPreset, 'custom'> =
    qualityPresetRaw === 'custom' ? 'medium' : qualityPresetRaw;
  const tune = atmosphereQualityTune(tunePreset);
  const next: AtmosphereSettings = {
    enabled: typeof raw.enabled === 'boolean' ? raw.enabled : base.enabled,
    latitudeDeg: clamp(raw.latitudeDeg as number, -90, 90, base.latitudeDeg),
    longitudeDeg: clamp(raw.longitudeDeg as number, -180, 180, base.longitudeDeg),
    timezoneOffsetHours: clamp(
      raw.timezoneOffsetHours as number,
      -14,
      14,
      base.timezoneOffsetHours,
    ),
    year: clamp(Math.round(raw.year as number), 1900, 2100, base.year),
    month: clamp(Math.round(raw.month as number), 1, 12, base.month),
    day: clamp(Math.round(raw.day as number), 1, 31, base.day),
    hour: clamp(Math.round(raw.hour as number), 0, 23, base.hour),
    minute: clamp(Math.round(raw.minute as number), 0, 59, base.minute),
    timeAnimating:
      typeof raw.timeAnimating === 'boolean' ? raw.timeAnimating : base.timeAnimating,
    timeSpeedHoursPerSecond: clamp(
      raw.timeSpeedHoursPerSecond as number,
      0,
      168,
      base.timeSpeedHoursPerSecond,
    ),
    qualityPreset: qualityPresetRaw,
    skyViewSamples: clamp(
      Math.round((raw.skyViewSamples as number) ?? tune.skyViewSamples),
      8,
      160,
      tune.skyViewSamples,
    ),
    transmittanceSamples: clamp(
      Math.round((raw.transmittanceSamples as number) ?? tune.transmittanceSamples),
      8,
      160,
      tune.transmittanceSamples,
    ),
    aerialSamples: clamp(
      Math.round((raw.aerialSamples as number) ?? tune.aerialSamples),
      4,
      64,
      tune.aerialSamples,
    ),
    envCubeSize: clampEnvCubeSize(
      (raw.envCubeSize as number) ?? tune.envCubeSize,
      tune.envCubeSize,
    ),
    skyViewLutWidth: clampLutDim(
      Math.round((raw.skyViewLutWidth as number) ?? tune.skyViewLutWidth),
      64,
      512,
      tune.skyViewLutWidth,
    ),
    skyViewLutHeight: clampLutDim(
      Math.round((raw.skyViewLutHeight as number) ?? tune.skyViewLutHeight),
      32,
      256,
      tune.skyViewLutHeight,
    ),
    transmittanceLutWidth: clampLutDim(
      Math.round((raw.transmittanceLutWidth as number) ?? tune.transmittanceLutWidth),
      128,
      512,
      tune.transmittanceLutWidth,
    ),
    transmittanceLutHeight: clampLutDim(
      Math.round(
        (raw.transmittanceLutHeight as number) ?? tune.transmittanceLutHeight,
      ),
      32,
      128,
      tune.transmittanceLutHeight,
    ),
    aerialLutWidth: clampLutDim(
      Math.round((raw.aerialLutWidth as number) ?? tune.aerialLutWidth),
      8,
      64,
      tune.aerialLutWidth,
    ),
    aerialLutHeight: clampLutDim(
      Math.round((raw.aerialLutHeight as number) ?? tune.aerialLutHeight),
      8,
      64,
      tune.aerialLutHeight,
    ),
    aerialLutDepth: clampLutDim(
      Math.round((raw.aerialLutDepth as number) ?? tune.aerialLutDepth),
      8,
      64,
      tune.aerialLutDepth,
    ),
    sunAngularDiameterDeg: clamp(
      raw.sunAngularDiameterDeg as number,
      0.05,
      8,
      base.sunAngularDiameterDeg,
    ),
    exposure: clamp(raw.exposure as number, 0.05, 8, base.exposure),
    lutBlend: clamp(raw.lutBlend as number, 0, 1, base.lutBlend),
    reflectionLevel: clamp(raw.reflectionLevel as number, 0, 2, base.reflectionLevel),
    skyboxHdrColors:
      typeof raw.skyboxHdrColors === 'boolean'
        ? raw.skyboxHdrColors
        : base.skyboxHdrColors,
    nightExposure: clamp(raw.nightExposure as number, 0.05, 8, base.nightExposure),
    moonAngularDiameterDeg: clamp(
      raw.moonAngularDiameterDeg as number,
      0.05,
      24,
      base.moonAngularDiameterDeg,
    ),
    moonExposure: clamp(raw.moonExposure as number, 0.05, 8, base.moonExposure),
    nightBlendStrength: clamp(
      raw.nightBlendStrength as number,
      0,
      1,
      base.nightBlendStrength,
    ),
    skyboxGroundColor: normalizeSkyboxRgb(
      raw.skyboxGroundColor,
      base.skyboxGroundColor,
    ),
    skyboxEquatorColor: normalizeSkyboxRgb(
      raw.skyboxEquatorColor,
      base.skyboxEquatorColor,
    ),
    skyboxAssetId: normalizeAssetIdOrNull(raw.skyboxAssetId, base.skyboxAssetId),
    nightSkyTextureId: normalizeAssetId(
      raw.nightSkyTextureId,
      base.nightSkyTextureId,
    ),
    moonTextureId: normalizeMoonTextureId(raw.moonTextureId, base.moonTextureId),
    model: normalizeAtmosphereModel(raw.model),
  };
  // Keep qualityPreset honest vs sample counts / LUT sizes (Custom when tweaked).
  next.qualityPreset = matchAtmosphereQualityPreset(next);
  return next;
}

function normalizeAssetId(raw: unknown, fallback: string): string {
  if (typeof raw === 'string' && raw.trim()) return raw.trim();
  return fallback;
}

function normalizeSkyboxRgb(
  raw: unknown,
  fallback: Rgb01,
): [number, number, number] {
  if (!Array.isArray(raw) || raw.length < 3) return clampRgb(fallback);
  const r = Number(raw[0]);
  const g = Number(raw[1]);
  const b = Number(raw[2]);
  if (![r, g, b].every((c) => Number.isFinite(c))) return clampRgb(fallback);
  return clampRgb([r, g, b]);
}

/** Prefer Moon sprite id — never keep NightSky assigned as the moon by mistake. */
function normalizeMoonTextureId(raw: unknown, fallback: string): string {
  const id = normalizeAssetId(raw, fallback);
  if (id === DEFAULT_NIGHT_SKY_TEXTURE_ID) return DEFAULT_MOON_TEXTURE_ID;
  return id;
}

function normalizeAssetIdOrNull(raw: unknown, fallback: string | null): string | null {
  if (raw === null) return null;
  if (typeof raw === 'string') {
    const t = raw.trim();
    return t.length ? t : null;
  }
  return fallback;
}

export function atmosphereUtcMs(settings: AtmosphereSettings): number {
  return utcMsFromLocalCivil({
    year: settings.year,
    month: settings.month,
    day: settings.day,
    hour: settings.hour,
    minute: settings.minute,
    timezoneOffsetHours: settings.timezoneOffsetHours,
  });
}

export function resolveAtmosphereSolarPosition(
  settings: AtmosphereSettings,
): SolarPosition {
  return computeSolarPosition({
    utcMs: atmosphereUtcMs(settings),
    latitudeDeg: settings.latitudeDeg,
    longitudeDeg: settings.longitudeDeg,
  });
}

/** Patch civil time from a decimal hour-of-day [0, 24). */
export function atmosphereWithTimeOfDay(
  settings: AtmosphereSettings,
  hourOfDay: number,
): AtmosphereSettings {
  const h = ((hourOfDay % 24) + 24) % 24;
  const hour = Math.floor(h);
  const minute = Math.round((h - hour) * 60) % 60;
  return normalizeAtmosphereSettings({ ...settings, hour, minute });
}

/** Sync civil fields from an explicit UTC timestamp (e.g. “now”). */
export function atmosphereWithUtcMs(
  settings: AtmosphereSettings,
  utcMs: number,
): AtmosphereSettings {
  const local = localCivilFromUtcMs(utcMs, settings.timezoneOffsetHours);
  return normalizeAtmosphereSettings({
    ...settings,
    year: local.year,
    month: local.month,
    day: local.day,
    hour: local.hour,
    minute: local.minute,
  });
}

/** Apply a named time-of-day preset (keeps date). */
export function atmosphereWithTimePreset(
  settings: AtmosphereSettings,
  id: AtmosphereTimePresetId,
): AtmosphereSettings {
  return atmosphereWithTimeOfDay(settings, ATMOSPHERE_TIME_PRESETS[id]);
}

/** Apply a seasonal date preset (keeps clock time). */
export function atmosphereWithSeasonPreset(
  settings: AtmosphereSettings,
  id: AtmosphereSeasonPresetId,
): AtmosphereSettings {
  const s = ATMOSPHERE_SEASON_PRESETS[id];
  return normalizeAtmosphereSettings({
    ...settings,
    month: s.month,
    day: s.day,
  });
}

/**
 * Advance civil time by `dt` seconds when animation is enabled.
 * Wraps across midnight into the next calendar day via UTC ms.
 */
export function atmosphereAdvanceTime(
  settings: AtmosphereSettings,
  dtSeconds: number,
): AtmosphereSettings {
  if (!settings.timeAnimating || settings.timeSpeedHoursPerSecond <= 0) {
    return settings;
  }
  const dt = Number.isFinite(dtSeconds) ? Math.max(0, dtSeconds) : 0;
  if (dt <= 0) return settings;
  const deltaMs = settings.timeSpeedHoursPerSecond * dt * 3_600_000;
  return atmosphereWithUtcMs(settings, atmosphereUtcMs(settings) + deltaMs);
}

/** Decimal hour-of-day for sliders. */
export function atmosphereHourOfDay(settings: AtmosphereSettings): number {
  return settings.hour + settings.minute / 60;
}
