/**
 * CPU twin of volumetric Light→Medium Beer–Lambert shadowing.
 * Matches shader tiers: off / local σ·d / secondary AABB extinction
 * (density × plume × height falloff — no FBM, same as GPU shadow path).
 */

import type { Vec3 } from '../math/vec3';
import { add, length, normalize, scale, sub } from '../math/vec3';
import type { ShadowQuality } from '../render/quality';
import { shadowStepsForQuality } from '../render/quality';
import { plumeEnvelope } from './smoke-plume';

export interface ShadowMediaVolume {
  center: Vec3;
  halfExtents: Vec3;
  density: number;
  scatter: number;
  scatterMie: number;
  absorption: number;
  /** 0 outdoor, 1 interior, 2 particulate */
  layerKind: number;
  insulating: boolean;
  emissionRate: number;
  plumeDir: Vec3;
  coneCos: number;
  plumeLengthM: number;
}

/** Homogeneous local approximation (shadowQuality === 'low'). */
export function lightMediaTransmittanceLocal(
  p: Vec3,
  lightOrigin: Vec3,
  sigmaTLocal: number,
): number {
  const dist = length(sub(lightOrigin, p));
  if (dist < 1e-4) return 1;
  return Math.exp(-Math.max(0, sigmaTLocal) * dist);
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / Math.max(1e-8, edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function heightFalloff(localY: number, halfY: number): number {
  const ny = localY / Math.max(halfY, 1e-3);
  return 0.55 + 0.45 * smoothstep(-0.9, 0.2, ny);
}

function extinctionFastAt(q: Vec3, volumes: readonly ShadowMediaVolume[]): number {
  let hasInterior = false;
  let bestVol = Number.POSITIVE_INFINITY;
  let intSigmaT = 0;
  let sigmaT = 0;

  for (const vol of volumes) {
    if (!vol.insulating) continue;
    const local = sub(q, vol.center);
    if (
      Math.abs(local[0]) > vol.halfExtents[0] ||
      Math.abs(local[1]) > vol.halfExtents[1] ||
      Math.abs(local[2]) > vol.halfExtents[2]
    ) {
      continue;
    }
    const plume = plumeEnvelope(local, vol.plumeDir, vol.coneCos, vol.plumeLengthM, vol.emissionRate);
    const d = Math.max(0, vol.density) * plume;
    if (d <= 1e-8) continue;
    const v = vol.halfExtents[0] * vol.halfExtents[1] * vol.halfExtents[2];
    if (v < bestVol) {
      bestVol = v;
      hasInterior = true;
      intSigmaT =
        (Math.max(0, vol.scatter) + Math.max(0, vol.scatterMie) + Math.max(0, vol.absorption)) * d;
    }
  }

  for (const vol of volumes) {
    if (vol.insulating) continue;
    const local = sub(q, vol.center);
    if (
      Math.abs(local[0]) > vol.halfExtents[0] ||
      Math.abs(local[1]) > vol.halfExtents[1] ||
      Math.abs(local[2]) > vol.halfExtents[2]
    ) {
      continue;
    }
    const plume = plumeEnvelope(local, vol.plumeDir, vol.coneCos, vol.plumeLengthM, vol.emissionRate);
    const d =
      Math.max(0, vol.density) * plume * heightFalloff(local[1], vol.halfExtents[1]);
    if (d <= 1e-8) continue;
    const sigma =
      (Math.max(0, vol.scatter) + Math.max(0, vol.scatterMie) + Math.max(0, vol.absorption)) * d;
    if (vol.layerKind > 1.5) sigmaT += sigma;
    else if (vol.layerKind < 0.5 && !hasInterior) sigmaT += sigma;
  }

  if (hasInterior) sigmaT += intSigmaT;
  return sigmaT;
}

/** Secondary march toward light (medium/high). */
export function lightMediaTransmittanceMarch(
  p: Vec3,
  lightOrigin: Vec3,
  volumes: readonly ShadowMediaVolume[],
  steps: number,
): number {
  const delta = sub(lightOrigin, p);
  const dist = length(delta);
  if (dist < 1e-4) return 1;
  const n = Math.max(2, Math.min(8, Math.round(steps)));
  const dir = normalize(delta);
  const ds = dist / n;
  let tau = 0;
  for (let s = 0; s < n; s++) {
    const t = (s + 0.5) * ds;
    tau += extinctionFastAt(add(p, scale(dir, t)), volumes) * ds;
  }
  return Math.exp(-tau);
}

export function lightMediaTransmittance(
  p: Vec3,
  lightOrigin: Vec3,
  sigmaTLocal: number,
  quality: ShadowQuality,
  volumes: readonly ShadowMediaVolume[] = [],
): number {
  if (quality === 'off') return 1;
  if (quality === 'low') return lightMediaTransmittanceLocal(p, lightOrigin, sigmaTLocal);
  return lightMediaTransmittanceMarch(p, lightOrigin, volumes, shadowStepsForQuality(quality));
}

export function sunMediaTransmittance(
  sigmaTLocal: number,
  quality: ShadowQuality,
  p: Vec3 = [0, 0, 0],
  sunDir: Vec3 = [0, 1, 0],
  volumes: readonly ShadowMediaVolume[] = [],
  pathLen = 12,
): number {
  if (quality === 'off') return 1;
  if (quality === 'low') return Math.exp(-Math.max(0, sigmaTLocal) * pathLen);
  const dir = normalize(sunDir);
  const steps = Math.max(2, Math.min(4, Math.round(shadowStepsForQuality(quality) * 0.5)));
  const ds = pathLen / steps;
  let tau = 0;
  for (let s = 0; s < steps; s++) {
    const t = (s + 0.5) * ds;
    tau += extinctionFastAt(add(p, scale(dir, t)), volumes) * ds;
  }
  return Math.exp(-tau);
}
