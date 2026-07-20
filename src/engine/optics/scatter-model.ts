/**
 * Educational scatter regimes for volumetric media:
 * - Rayleigh: molecular particles ≪ λ → strong λ⁻⁴ colour dependence (blue sky)
 * - Tyndall: colloidal 10–1000 nm → weak colour dependence (white-looking beam cone)
 * - Mie anisotropy (Henyey–Greenstein g): forward vs back scatter brightness
 */

export type ScatterModel = 'tyndall' | 'rayleigh';

export const SCATTER_MODELS: readonly ScatterModel[] = ['tyndall', 'rayleigh'];

/** Molecular / Rayleigh upper bound (nm). */
export const RAYLEIGH_PARTICLE_NM_MAX = 10;
/** Colloidal / Tyndall range (nm). */
export const TYNDALL_PARTICLE_NM_MIN = 10;
export const TYNDALL_PARTICLE_NM_MAX = 1000;

export const PARTICLE_SIZE_NM_MIN = 0.1;
export const PARTICLE_SIZE_NM_MAX = TYNDALL_PARTICLE_NM_MAX;

/** Henyey–Greenstein asymmetry: −1 back … 0 isotropic … +1 forward. */
export const MIE_ANISOTROPY_MIN = -0.95;
export const MIE_ANISOTROPY_MAX = 0.95;

export function clampParticleSizeNm(nm: number): number {
  if (!Number.isFinite(nm)) return 200;
  return Math.min(PARTICLE_SIZE_NM_MAX, Math.max(PARTICLE_SIZE_NM_MIN, nm));
}

export function clampMieAnisotropy(g: number): number {
  if (!Number.isFinite(g)) return 0;
  return Math.min(MIE_ANISOTROPY_MAX, Math.max(MIE_ANISOTROPY_MIN, g));
}

/** Typical educational defaults when switching model. */
export function defaultParticleSizeNm(model: ScatterModel): number {
  return model === 'rayleigh' ? 1 : 200;
}

/**
 * Default Mie g for the scatter regime.
 * Rayleigh ≈ isotropic (g≈0); Tyndall/fog aerosols strongly forward-scatter (g≈0.85–0.95).
 */
export function defaultMieAnisotropy(model: ScatterModel, particleSizeNm?: number): number {
  if (model === 'rayleigh') return 0;
  const size = clampParticleSizeNm(particleSizeNm ?? defaultParticleSizeNm('tyndall'));
  const logMin = Math.log(TYNDALL_PARTICLE_NM_MIN);
  const logMax = Math.log(TYNDALL_PARTICLE_NM_MAX);
  const t = (Math.log(Math.max(size, TYNDALL_PARTICLE_NM_MIN)) - logMin) / (logMax - logMin);
  const u = Math.min(1, Math.max(0, t));
  // ~0.55 near 10 nm → ~0.92 at 1000 nm (fog / water droplets)
  return clampMieAnisotropy(0.55 * (1 - u) + 0.92 * u);
}

export function isScatterModel(value: unknown): value is ScatterModel {
  return value === 'tyndall' || value === 'rayleigh';
}

/**
 * Spectral exponent n in σ_s ∝ λ⁻ⁿ for the media regime.
 * Rayleigh → 4; Tyndall → near 0 (weak), slightly higher at the small-colloid end.
 */
export function mediaSpectralExponent(model: ScatterModel, particleSizeNm: number): number {
  if (model === 'rayleigh') return 4;
  const size = clampParticleSizeNm(particleSizeNm);
  const logMin = Math.log(TYNDALL_PARTICLE_NM_MIN);
  const logMax = Math.log(TYNDALL_PARTICLE_NM_MAX);
  const t = (Math.log(Math.max(size, TYNDALL_PARTICLE_NM_MIN)) - logMin) / (logMax - logMin);
  const u = Math.min(1, Math.max(0, t));
  // ~0.8 near 10 nm (still mild vs Rayleigh), ~0.05 at 1000 nm (nearly white cone)
  return 0.8 * (1 - u) + 0.05 * u;
}

/**
 * Given a precomputed Rayleigh weight w₄ = (λ_ref/λ)⁴, remap to λ⁻ⁿ:
 * (λ_ref/λ)ⁿ = w₄^(n/4).
 */
export function spectralWeightFromRayleigh(
  rayleighWeight: number,
  exponent: number,
): number {
  const w = Math.max(1e-9, rayleighWeight);
  const n = Math.max(0, exponent);
  if (Math.abs(n - 4) < 1e-6) return w;
  if (n < 1e-6) return 1;
  return Math.pow(w, n / 4);
}

/**
 * Henyey–Greenstein phase function (absolute, ∫ p dΩ = 1):
 * p(θ) = (1−g²) / (4π (1+g²−2gμ)^{3/2}).
 * At g=0 → 1/(4π).
 */
export function phaseHG(cosTheta: number, g: number): number {
  const gg = clampMieAnisotropy(g);
  const mu = Math.min(1, Math.max(-1, cosTheta));
  const g2 = gg * gg;
  const denom = Math.pow(Math.max(1 - 2 * gg * mu + g2, 1e-8), 1.5);
  return ((1 - g2) / denom) / (4 * Math.PI);
}

/** Relative HG (g=0 → 1) for UI / legacy comparisons. */
export function phaseHGRelative(cosTheta: number, g: number): number {
  return phaseHG(cosTheta, g) * 4 * Math.PI;
}
