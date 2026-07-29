/**
 * Educational scatter regimes for volumetric media:
 * - Rayleigh: molecular ≪ λ → σ_s ∝ λ⁻⁴, phase p(μ)=(3/16π)(1+μ²)
 * - Tyndall/Mie: colloidal 10–1000 nm → weak λ dependence, Henyey–Greenstein phase
 *
 * Volumetric visibility (LaserPointerHub / educational):
 *   I_vis ≈ P × V(λ) × S_λⁿ × phase(θ) × Li(Q)
 * with V(λ) on the CPU display pack and S×phase in the march.
 */

import { clamp01, clampRange } from '../../../math/clamp';

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

/** Clamp particle size to the global educational range (0.1–1000 nm). */
export function clampParticleSizeNm(nm: number): number {
  return clampRange(nm, PARTICLE_SIZE_NM_MIN, PARTICLE_SIZE_NM_MAX, 200);
}

/** Clamp particle size to the educational range for the scatter regime. */
export function clampParticleSizeForModel(model: ScatterModel, nm: number): number {
  const size = clampParticleSizeNm(nm);
  if (model === 'rayleigh') {
    return Math.min(size, RAYLEIGH_PARTICLE_NM_MAX);
  }
  return Math.max(size, TYNDALL_PARTICLE_NM_MIN);
}

export function clampMieAnisotropy(g: number): number {
  return clampRange(g, MIE_ANISOTROPY_MIN, MIE_ANISOTROPY_MAX, 0);
}

/** Typical educational defaults when switching model — aligned with media presets. */
export function defaultParticleSizeNm(model: ScatterModel): number {
  // Rayleigh ↔ atmosphere (molecular); Tyndall ↔ fog-scale water/aerosol droplets.
  return model === 'rayleigh' ? 0.3 : 1000;
}

/**
 * Default Mie g for the scatter regime — aligned with media optical presets.
 *
 * True water-droplet Mie can reach g≈0.85–0.95, but a *single-scatter* HG at
 * those values starves side/back lobes (~10³–10⁴× weaker than looking into the
 * beam). Room-scale fog optical depth is often τ≲0.2, so multiple scattering
 * does not refill the view. Educational / theatrical haze defaults stay milder
 * so the beam remains visible from behind, side and above — matching real
 * laser-in-haze observation — while still peaking when looking into the beam.
 *
 * Rayleigh uses `phaseRayleigh` (not HG); g is unused in that regime.
 * Tyndall: ~0.25 (10 nm) → ~0.62 (fog-scale μm). Smoke/cloud presets may set 0.65–0.78
 * with volume multi-scatter filling rear views.
 */
export function defaultMieAnisotropy(model: ScatterModel, particleSizeNm?: number): number {
  if (model === 'rayleigh') return 0;
  const size = clampParticleSizeNm(particleSizeNm ?? defaultParticleSizeNm('tyndall'));
  const logMin = Math.log(TYNDALL_PARTICLE_NM_MIN);
  const logMax = Math.log(TYNDALL_PARTICLE_NM_MAX);
  const t = (Math.log(Math.max(size, TYNDALL_PARTICLE_NM_MIN)) - logMin) / (logMax - logMin);
  const u = clamp01(t);
  // ~0.25 near 10 nm → ~0.62 at 1000 nm (fog/cloud); smoke ~700 nm → ~0.55
  return clampMieAnisotropy(0.25 * (1 - u) + 0.62 * u);
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
  const u = clamp01(t);
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
 * Classical Rayleigh phase (absolute, ∫ p dΩ = 1):
 * p(μ) = (3/16π)(1 + μ²), μ = cos θ.
 * Forward = back; minimum at 90°.
 */
export function phaseRayleigh(cosTheta: number): number {
  const mu = clampRange(cosTheta, -1, 1);
  return (3 / (16 * Math.PI)) * (1 + mu * mu);
}

/**
 * Henyey–Greenstein phase function (absolute, ∫ p dΩ = 1):
 * p(θ) = (1−g²) / (4π (1+g²−2gμ)^{3/2}).
 * At g=0 → 1/(4π).
 */
export function phaseHG(cosTheta: number, g: number): number {
  const gg = clampMieAnisotropy(g);
  const mu = clampRange(cosTheta, -1, 1);
  const g2 = gg * gg;
  const denom = Math.pow(Math.max(1 - 2 * gg * mu + g2, 1e-8), 1.5);
  return ((1 - g2) / denom) / (4 * Math.PI);
}
