/**
 * Residual optical field leaving the designed beam (educational, energy-aware).
 *
 * `strayPowerFraction` f is the power share outside the ideal TEM00 / designed
 * core (baffling, coatings, scatter). That power is distributed across lobes
 * that approximate common lens / laser-diode artefacts:
 *
 *   ghosts   — multi-surface internal reflections (wider TEM00 rings)
 *   halo     — Tyndall / bulk scatter in glass
 *   edge     — aperture / barrel rim leakage
 *   streak   — coating / scratch flare (anisotropic)
 *
 * Aberrations that reshape the *core* (coma, astigmatism, spherical, elliptic)
 * live in BeamModel Gaussian evaluation — not here.
 *
 * Pipeline: irradiance = core×(1−f) + f×residualDensity; BRDF is applied later.
 */

import { gaussianTem00Density } from './laser';

/** Relative weights of residual lobes (sum ≈ 1). */
export const RESIDUAL_LOBE_WEIGHTS = {
  ghosts: 0.5,
  halo: 0.22,
  edge: 0.16,
  streak: 0.12,
} as const;

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0 || 1e-8)));
  return t * t * (3 - 2 * t);
}

/**
 * Density (∫≈1 scale) of the residual field in the beam transverse plane.
 * `x`,`y` are beam-basis coordinates; `r = hypot(x,y)`; `brCore` is local 1/e² radius.
 */
export function evalResidualDensity(
  x: number,
  y: number,
  brCore: number,
  axialT: number,
): number {
  const w = Math.max(brCore, 1e-5);
  const r = Math.hypot(x, y);
  const W = RESIDUAL_LOBE_WEIGHTS;

  // Ghosts: internal reflections → faint wider TEM00 rings (guide: 1.5 / 2.5 / 4× w).
  const ghosts =
    gaussianTem00Density(r, w * 1.55) * 0.55 +
    gaussianTem00Density(r, w * 2.55) * 0.3 +
    gaussianTem00Density(r, w * 4.2) * 0.15;

  // Halo: soft scatter around the beam.
  const halo = gaussianTem00Density(r, w * 8);

  // Edge leakage: ring near the geometric aperture (~w).
  const ring =
    smoothstep(0.55 * w, 0.95 * w, r) * (1 - smoothstep(1.05 * w, 1.85 * w, r));
  const edge = ring * (0.45 / Math.max(w * w, 1e-8));

  // Flare streak: elongated along local X (narrow in Y) — coating / scratch flare.
  const streak =
    Math.exp(-Math.abs(y) / Math.max(0.28 * w, 1e-5)) *
    Math.exp(-(x * x) / Math.max((4.0 * w) * (4.0 * w), 1e-6)) *
    (0.18 / Math.max(w * w, 1e-8));

  const dens =
    W.ghosts * ghosts + W.halo * halo + W.edge * edge + W.streak * streak;
  return dens * Math.exp(-0.025 * Math.max(axialT, 0));
}

/** GLSL twin injected into rfEvalRadianceField residual path. */
export function residualFieldGlsl(): string {
  return `
float rfResidualDensity(float x, float y, float brCore, float axialT) {
  float w = max(brCore, 1e-5);
  float r = length(vec2(x, y));
  float g1 = (2.0 / 3.14159265) / max((w * 1.55) * (w * 1.55), 1e-10)
    * exp(-2.0 * (r * r) / max((w * 1.55) * (w * 1.55), 1e-10));
  float g2 = (2.0 / 3.14159265) / max((w * 2.55) * (w * 2.55), 1e-10)
    * exp(-2.0 * (r * r) / max((w * 2.55) * (w * 2.55), 1e-10));
  float g3 = (2.0 / 3.14159265) / max((w * 4.2) * (w * 4.2), 1e-10)
    * exp(-2.0 * (r * r) / max((w * 4.2) * (w * 4.2), 1e-10));
  float ghosts = g1 * 0.55 + g2 * 0.30 + g3 * 0.15;
  float halo = (2.0 / 3.14159265) / max((w * 8.0) * (w * 8.0), 1e-10)
    * exp(-2.0 * (r * r) / max((w * 8.0) * (w * 8.0), 1e-10));
  float ring = smoothstep(0.55 * w, 0.95 * w, r) * (1.0 - smoothstep(1.05 * w, 1.85 * w, r));
  float edge = ring * (0.45 / max(w * w, 1e-8));
  float streak = exp(-abs(y) / max(0.28 * w, 1e-5))
    * exp(-(x * x) / max((4.0 * w) * (4.0 * w), 1e-6))
    * (0.18 / max(w * w, 1e-8));
  float dens = 0.50 * ghosts + 0.22 * halo + 0.16 * edge + 0.12 * streak;
  return dens * exp(-0.025 * max(axialT, 0.0));
}
`;
}
