/**
 * CPU twin of volumetric light→medium Beer–Lambert shadowing.
 * Shader uses homogeneous AABB chords (no FBM / no nested march).
 */

import type { Vec3 } from '../math/vec3';
import { add, length, normalize, scale, sub } from '../math/vec3';
import { plumeEnvelope } from './smoke-plume';

export interface ShadowMediaVolume {
  center: Vec3;
  halfExtents: Vec3;
  density: number;
  scatter: number;
  scatterMie: number;
  absorption: number;
  noiseThresholdLow: number;
  noiseThresholdHigh: number;
  /** 0 outdoor, 1 interior, 2 particulate — matches GPU layerKind. */
  layerKind: number;
  insulating: boolean;
  emissionRate: number;
  plumeDir: Vec3;
  coneCos: number;
  plumeLengthM: number;
}

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / Math.max(1e-8, edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/** Ray–AABB intersection; returns [tEnter, tExit] or null. */
export function intersectBox(
  ro: Vec3,
  rd: Vec3,
  center: Vec3,
  halfSize: Vec3,
): [number, number] | null {
  const boxMin: Vec3 = [center[0] - halfSize[0], center[1] - halfSize[1], center[2] - halfSize[2]];
  const boxMax: Vec3 = [center[0] + halfSize[0], center[1] + halfSize[1], center[2] + halfSize[2]];
  const inv: Vec3 = [
    Math.abs(rd[0]) > 1e-12 ? 1 / rd[0] : 1e12 * Math.sign(rd[0] || 1),
    Math.abs(rd[1]) > 1e-12 ? 1 / rd[1] : 1e12 * Math.sign(rd[1] || 1),
    Math.abs(rd[2]) > 1e-12 ? 1 / rd[2] : 1e12 * Math.sign(rd[2] || 1),
  ];
  const t0: Vec3 = [
    (boxMin[0] - ro[0]) * inv[0],
    (boxMin[1] - ro[1]) * inv[1],
    (boxMin[2] - ro[2]) * inv[2],
  ];
  const t1: Vec3 = [
    (boxMax[0] - ro[0]) * inv[0],
    (boxMax[1] - ro[1]) * inv[1],
    (boxMax[2] - ro[2]) * inv[2],
  ];
  const tEnter = Math.max(Math.min(t0[0], t1[0]), Math.min(t0[1], t1[1]), Math.min(t0[2], t1[2]));
  const tExit = Math.min(Math.max(t0[0], t1[0]), Math.max(t0[1], t1[1]), Math.max(t0[2], t1[2]));
  if (tExit <= Math.max(tEnter, 0)) return null;
  return [tEnter, tExit];
}

function chordOpticalDepth(
  p: Vec3,
  dir: Vec3,
  dist: number,
  vol: ShadowMediaVolume,
): number {
  const hit = intersectBox(p, dir, vol.center, vol.halfExtents);
  if (!hit) return 0;
  const t0 = Math.max(hit[0], 0);
  const t1 = Math.min(hit[1], dist);
  if (t1 <= t0) return 0;

  const mid = add(p, scale(dir, 0.5 * (t0 + t1)));
  const local = sub(mid, vol.center);
  const plume = plumeEnvelope(local, vol.plumeDir, vol.coneCos, vol.plumeLengthM, vol.emissionRate);
  const low = Math.min(vol.noiseThresholdLow, vol.noiseThresholdHigh - 0.001);
  const high = Math.max(vol.noiseThresholdHigh, low + 0.001);
  const occ = smoothstep(low, high, 0.5);
  const d = Math.max(0, vol.density) * plume * occ;
  const sigma =
    (Math.max(0, vol.scatter) + Math.max(0, vol.scatterMie) + Math.max(0, vol.absorption)) * d;
  return sigma * (t1 - t0);
}

/**
 * Optical depth along segment p → p+dir*dist through layered media (GPU twin).
 */
export function mediaOpticalDepthAlongSegment(
  p: Vec3,
  dir: Vec3,
  dist: number,
  volumes: readonly ShadowMediaVolume[],
): number {
  let hasInterior = false;
  let bestVol = Number.POSITIVE_INFINITY;
  let intTau = 0;
  let tau = 0;

  for (const vol of volumes) {
    if (!vol.insulating) continue;
    const hit = intersectBox(p, dir, vol.center, vol.halfExtents);
    if (!hit) continue;
    const t0 = Math.max(hit[0], 0);
    const t1 = Math.min(hit[1], dist);
    if (t1 <= t0) continue;
    const v = vol.halfExtents[0] * vol.halfExtents[1] * vol.halfExtents[2];
    if (v < bestVol) {
      bestVol = v;
      hasInterior = true;
      intTau = chordOpticalDepth(p, dir, dist, vol);
    }
  }

  for (const vol of volumes) {
    const kind = vol.layerKind;
    if (kind > 1.5) {
      tau += chordOpticalDepth(p, dir, dist, vol);
    } else if (kind < 0.5 && !vol.insulating && !hasInterior) {
      tau += chordOpticalDepth(p, dir, dist, vol);
    }
  }

  if (hasInterior) tau += intTau;
  return tau;
}

/** Beer–Lambert transmittance from sample → light through media. */
export function lightMediaTransmittance(
  p: Vec3,
  lightOrigin: Vec3,
  volumes: readonly ShadowMediaVolume[],
): number {
  const delta = sub(lightOrigin, p);
  const dist = length(delta);
  if (dist < 1e-4) return 1;
  const dir = normalize(delta);
  return Math.exp(-mediaOpticalDepthAlongSegment(p, dir, dist, volumes));
}

/** Soft sun transmittance along a fixed path length. */
export function sunMediaTransmittance(
  p: Vec3,
  sunDir: Vec3,
  volumes: readonly ShadowMediaVolume[],
  pathLen = 12,
): number {
  const dir = normalize(sunDir);
  return Math.exp(-mediaOpticalDepthAlongSegment(p, dir, pathLen, volumes));
}
