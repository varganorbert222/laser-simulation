/**
 * Thin-lens / beam-shaping transforms for Gaussian lasers (plausible, not full ABCD).
 */

import { beamRadiusAt, clampM2, rayleighRange } from './laser';
import type { LaserParams } from './modes';

export interface PropagatedWaists {
  /** Distance from emitter along axis to sample, relative to waist plane(s). */
  zFromWaistX: number;
  zFromWaistY: number;
  wx: number;
  wy: number;
  zRX: number;
  zRY: number;
}

/**
 * Propagate elliptic / astigmatic beam to axial distance t from the emitter.
 * waistOffsetM shifts both waists; astigmatism splits x/y waist planes by ±Δ.
 */
export function propagateLaserWaists(
  laser: Pick<
    LaserParams,
    'w0M' | 'm2' | 'ellipticRatio' | 'waistOffsetM' | 'astigmatism'
  >,
  lambdaM: number,
  t: number,
): PropagatedWaists {
  const w0x = Math.max(laser.w0M, 1e-4);
  const w0y = Math.max(w0x * Math.max(laser.ellipticRatio, 0.2), 1e-4);
  const m2 = clampM2(laser.m2);
  const zRX = rayleighRange(w0x, Math.max(lambdaM, 1e-12), m2);
  const zRY = rayleighRange(w0y, Math.max(lambdaM, 1e-12), m2);
  const astig = Math.min(1, Math.max(0, laser.astigmatism));
  const delta = astig * 0.5 * Math.max(zRX, zRY);
  const zFromWaistX = t - laser.waistOffsetM - delta;
  const zFromWaistY = t - laser.waistOffsetM + delta;
  return {
    zFromWaistX,
    zFromWaistY,
    wx: beamRadiusAt(w0x, zRX, zFromWaistX),
    wy: beamRadiusAt(w0y, zRY, zFromWaistY),
    zRX,
    zRY,
  };
}

/**
 * Soft aperture / spherical-aberration radial stretch of the evaluation radius.
 * spherical: extra blur grows with r⁴ weight (educational Zernike-like).
 */
export function aberrationRadiusScale(
  rNorm: number,
  sphericalAberration: number,
  coma: number,
  comaAxisDot: number,
): number {
  const sph = Math.min(1, Math.max(0, sphericalAberration));
  const cm = Math.min(1, Math.max(0, coma));
  const r2 = rNorm * rNorm;
  const sphStretch = 1 + sph * 0.55 * r2 * r2;
  const comaShift = 1 + cm * 0.35 * Math.max(0, comaAxisDot) * rNorm;
  return sphStretch * comaShift;
}

/** Top-hat soft mix into density-normalized profile (matches GLSL rfGaussianCore). */
export function topHatMixProfile(
  gaussianDens: number,
  rNorm: number,
  mix: number,
  wx: number,
  wy: number,
): number {
  const m = Math.min(1, Math.max(0, mix));
  if (m < 1e-5) return gaussianDens;
  const topHatShape = rNorm < 1 ? 1 : Math.exp(-4 * (rNorm - 1) * (rNorm - 1));
  const topHatDens = (topHatShape * (2 / Math.PI)) / Math.max(wx * wy, 1e-10);
  return gaussianDens * (1 - m) + topHatDens * m;
}
