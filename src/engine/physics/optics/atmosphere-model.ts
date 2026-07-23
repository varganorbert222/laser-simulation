/**
 * Planetary atmosphere parameters (Hillaire / Bruneton-compatible scales).
 * Used by CPU env irradiance twins and GPU LUT bake shaders.
 *
 * Distinct from media-volume climate Rayleigh/Mie (AABB fog) — this is Earth-radius air.
 */

export interface AtmosphereModel {
  /** Planet (ground) radius in meters. */
  planetRadius: number;
  /** Atmosphere top radius in meters. */
  atmosphereRadius: number;
  /** Rayleigh scattering coefficients (RGB, 1/m at sea level). */
  rayleighScattering: readonly [number, number, number];
  /** Rayleigh exponential scale height (m). */
  rayleighScaleHeight: number;
  /** Mie scattering coefficient (RGB, 1/m at sea level) — often grey. */
  mieScattering: readonly [number, number, number];
  /** Mie absorption (RGB, 1/m). */
  mieAbsorption: readonly [number, number, number];
  /** Mie exponential scale height (m). */
  mieScaleHeight: number;
  /** Henyey–Greenstein anisotropy g ∈ (−1, 1). */
  mieG: number;
  /** Ozone absorption (RGB, 1/m) — simplified mid-atmosphere band. */
  ozoneAbsorption: readonly [number, number, number];
  /** Ozone layer center height above ground (m). */
  ozoneCenterHeight: number;
  /** Ozone layer half-width (m). */
  ozoneWidth: number;
  /** Ground albedo RGB for cheap multi-scatter fill. */
  groundAlbedo: readonly [number, number, number];
  /** Extraterrestrial solar irradiance RGB (linear display units). */
  solarIrradiance: readonly [number, number, number];
}

/** Earth-like defaults (Bruneton 2017 / Hillaire UE5-ish scales, display-tuned). */
export function createDefaultAtmosphereModel(): AtmosphereModel {
  return {
    planetRadius: 6_360_000,
    atmosphereRadius: 6_360_000 + 100_000,
    // λ⁻⁴ Rayleigh at ~sea level (scaled for HDR skybox display).
    rayleighScattering: [5.802e-6, 13.558e-6, 33.1e-6],
    rayleighScaleHeight: 8000,
    mieScattering: [3.996e-6, 3.996e-6, 3.996e-6],
    mieAbsorption: [0.444e-6, 0.444e-6, 0.444e-6],
    mieScaleHeight: 1200,
    mieG: 0.8,
    ozoneAbsorption: [0.650e-6, 1.881e-6, 0.085e-6],
    ozoneCenterHeight: 25_000,
    ozoneWidth: 15_000,
    groundAlbedo: [0.3, 0.3, 0.3],
    solarIrradiance: [1.0, 0.98, 0.92],
  };
}

export function normalizeAtmosphereModel(
  raw: Partial<AtmosphereModel> | null | undefined,
): AtmosphereModel {
  const base = createDefaultAtmosphereModel();
  if (!raw || typeof raw !== 'object') return base;
  const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  const vec3 = (
    v: unknown,
    d: readonly [number, number, number],
  ): [number, number, number] => {
    if (!Array.isArray(v) || v.length < 3) return [d[0], d[1], d[2]];
    return [num(v[0], d[0]), num(v[1], d[1]), num(v[2], d[2])];
  };
  const planet = Math.max(1, num(raw.planetRadius, base.planetRadius));
  const atmo = Math.max(planet + 1, num(raw.atmosphereRadius, base.atmosphereRadius));
  return {
    planetRadius: planet,
    atmosphereRadius: atmo,
    rayleighScattering: vec3(raw.rayleighScattering, base.rayleighScattering),
    rayleighScaleHeight: Math.max(1, num(raw.rayleighScaleHeight, base.rayleighScaleHeight)),
    mieScattering: vec3(raw.mieScattering, base.mieScattering),
    mieAbsorption: vec3(raw.mieAbsorption, base.mieAbsorption),
    mieScaleHeight: Math.max(1, num(raw.mieScaleHeight, base.mieScaleHeight)),
    mieG: Math.max(-0.999, Math.min(0.999, num(raw.mieG, base.mieG))),
    ozoneAbsorption: vec3(raw.ozoneAbsorption, base.ozoneAbsorption),
    ozoneCenterHeight: Math.max(0, num(raw.ozoneCenterHeight, base.ozoneCenterHeight)),
    ozoneWidth: Math.max(1, num(raw.ozoneWidth, base.ozoneWidth)),
    groundAlbedo: vec3(raw.groundAlbedo, base.groundAlbedo),
    solarIrradiance: vec3(raw.solarIrradiance, base.solarIrradiance),
  };
}

function densityRayleigh(h: number, Hr: number): number {
  return Math.exp(-Math.max(0, h) / Hr);
}

function densityMie(h: number, Hm: number): number {
  return Math.exp(-Math.max(0, h) / Hm);
}

function densityOzone(h: number, center: number, width: number): number {
  return Math.max(0, 1 - Math.abs(h - center) / width);
}

/** Phase Rayleigh 3/(16π)(1+μ²). */
export function atmospherePhaseRayleigh(mu: number): number {
  const m = Math.max(-1, Math.min(1, mu));
  return 0.0596831036 * (1 + m * m);
}

/** Henyey–Greenstein phase. */
export function atmospherePhaseHG(mu: number, g: number): number {
  const g2 = g * g;
  const denom = Math.pow(Math.max(1e-6, 1 - 2 * g * mu + g2), 1.5);
  return ((1 - g2) / denom) * 0.0795774715;
}

/**
 * Ray–sphere intersection (tEnter, tExit). Returns null if no hit.
 * Sphere centered at origin; ray from `origin` along unit `dir`.
 */
export function intersectAtmosphereSphere(
  origin: readonly [number, number, number],
  dir: readonly [number, number, number],
  radius: number,
): { tEnter: number; tExit: number } | null {
  const a = dir[0] * dir[0] + dir[1] * dir[1] + dir[2] * dir[2];
  const b = 2 * (origin[0] * dir[0] + origin[1] * dir[1] + origin[2] * dir[2]);
  const c =
    origin[0] * origin[0] +
    origin[1] * origin[1] +
    origin[2] * origin[2] -
    radius * radius;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const s = Math.sqrt(disc);
  const t0 = (-b - s) / (2 * a);
  const t1 = (-b + s) / (2 * a);
  return { tEnter: Math.min(t0, t1), tExit: Math.max(t0, t1) };
}

/**
 * Optical depth / transmittance along a ray through the atmosphere (CPU twin of LUT).
 * `origin` and `dir` in planet-centric meters; `dir` unit.
 */
export function atmosphereTransmittance(
  model: AtmosphereModel,
  origin: readonly [number, number, number],
  dir: readonly [number, number, number],
  steps = 32,
): [number, number, number] {
  const hit = intersectAtmosphereSphere(origin, dir, model.atmosphereRadius);
  if (!hit || hit.tExit <= 0) return [1, 1, 1];

  // Clip against planet: stop if we hit ground.
  const ground = intersectAtmosphereSphere(origin, dir, model.planetRadius);
  let t0 = Math.max(0, hit.tEnter);
  let t1 = hit.tExit;
  if (ground && ground.tEnter > 0) {
    t1 = Math.min(t1, ground.tEnter);
  }
  if (t1 <= t0) return [0, 0, 0];

  const ds = (t1 - t0) / steps;
  let odR = 0;
  let odM = 0;
  let odO = 0;
  for (let i = 0; i < steps; i++) {
    const t = t0 + (i + 0.5) * ds;
    const x = origin[0] + dir[0] * t;
    const y = origin[1] + dir[1] * t;
    const z = origin[2] + dir[2] * t;
    const r = Math.hypot(x, y, z);
    const h = r - model.planetRadius;
    odR += densityRayleigh(h, model.rayleighScaleHeight) * ds;
    odM += densityMie(h, model.mieScaleHeight) * ds;
    odO += densityOzone(h, model.ozoneCenterHeight, model.ozoneWidth) * ds;
  }

  const T: [number, number, number] = [1, 1, 1];
  for (let c = 0; c < 3; c++) {
    const ext =
      model.rayleighScattering[c] * odR +
      (model.mieScattering[c] + model.mieAbsorption[c]) * odM +
      model.ozoneAbsorption[c] * odO;
    T[c] = Math.exp(-ext);
  }
  return T;
}

/**
 * Sun transmittance from a surface viewer (planetRadius + eyeHeight) toward −lightDir.
 * Returns RGB in [0,1] (Beer–Lambert through atmosphere).
 */
export function sunTransmittanceRgb(
  model: AtmosphereModel,
  lightDirWorld: readonly [number, number, number],
  eyeHeightM = 1,
): [number, number, number] {
  // Toward sun = −lightDir
  const toward: [number, number, number] = [
    -lightDirWorld[0],
    -lightDirWorld[1],
    -lightDirWorld[2],
  ];
  const len = Math.hypot(toward[0], toward[1], toward[2]) || 1;
  toward[0] /= len;
  toward[1] /= len;
  toward[2] /= len;

  // If sun below horizon (toward.y < 0 in local ENU at north pole approx), still integrate —
  // use planet-centric frame with viewer on +Y.
  const origin: [number, number, number] = [0, model.planetRadius + eyeHeightM, 0];
  return atmosphereTransmittance(model, origin, toward, 48);
}

/**
 * Cheap upper-hemisphere sky irradiance estimate for volumetric hemi fill.
 * Not a full spherical integral — display-tuned from zenith + horizon transmittance.
 */
export function skyIrradianceApprox(
  model: AtmosphereModel,
  lightDirWorld: readonly [number, number, number],
  ambientLevel: number,
): [number, number, number] {
  const towardSun: [number, number, number] = [
    -lightDirWorld[0],
    -lightDirWorld[1],
    -lightDirWorld[2],
  ];
  const elev = Math.asin(Math.max(-1, Math.min(1, towardSun[1])));
  const sunUp = Math.max(0, Math.sin(elev));
  const Tsun = sunTransmittanceRgb(model, lightDirWorld);
  // Zenith / horizon sample directions in planet frame (viewer on +Y).
  const origin: [number, number, number] = [0, model.planetRadius + 1, 0];
  const Tz = atmosphereTransmittance(model, origin, [0, 1, 0], 24);
  const Th = atmosphereTransmittance(model, origin, [1, 0.02, 0], 24);

  const a = Math.max(0, Math.min(1, ambientLevel));
  const out: [number, number, number] = [0, 0, 0];
  for (let c = 0; c < 3; c++) {
    // In-scatter proxy: solar × Rayleigh bias × (1 − transmittance) along short paths.
    const scatterBias = model.rayleighScattering[c] / (model.rayleighScattering[2] || 1e-12);
    const sky =
      model.solarIrradiance[c] *
      (0.35 * (1 - Tz[c]) * scatterBias + 0.25 * (1 - Th[c]) + 0.4 * Tsun[c] * sunUp);
    out[c] = sky * (0.04 + a * 0.55);
  }
  return out;
}

/**
 * Directional sun RGB for volumetrics / DirectionalLight from atmosphere transmittance.
 */
export function sunIrradianceRgb(
  model: AtmosphereModel,
  lightDirWorld: readonly [number, number, number],
  ambientLevel: number,
): [number, number, number] {
  const T = sunTransmittanceRgb(model, lightDirWorld);
  const towardY = -lightDirWorld[1];
  const above = Math.max(0, towardY);
  const a = Math.max(0, Math.min(1, ambientLevel));
  const scale = (0.02 + a * 0.9) * (0.15 + 0.85 * above);
  return [
    model.solarIrradiance[0] * T[0] * scale,
    model.solarIrradiance[1] * T[1] * scale,
    model.solarIrradiance[2] * T[2] * scale,
  ];
}
