/**
 * Unified beam / radiance field model.
 *
 * Light is light: the emitter only chooses the radiation profile
 * (omni soft / cone lamp / parallel tube / Gaussian laser).
 * Volumetric Li and surface BRDF both evaluate the same field.
 */

import type { LightEmitter } from '../../../ecs/components';
import { clamp01, clampRange } from '../../../math/clamp';
import { smoothstep } from '../../../math/smoothstep';
import {
  aberrationRadiusScale,
  propagateLaserWaists,
  topHatMixProfile,
} from './beam-optics';
import {
  DISPLAY_RADIANCE_SCALE,
  clampM2,
  gaussianTem00Density,
  gaussianTem00DensityElliptic,
} from './laser';
import { normalizeLaserParams, type LaserParams } from './modes';
import type { OpticsSpillParams } from './optics-spill';
import {
  clampSpill01,
  normalizeOpticsSpill,
  spillToGpuWeights,
} from './optics-spill';
import { evalResidualDensity } from './optics-residual';
import type { SurfaceMaterial } from '../surface/surface-material';

export type BeamKind = 'omni' | 'cone' | 'tube' | 'gaussian';

export type BeamModel =
  | {
      kind: 'omni';
      softRadiusM: number;
      falloff: number;
      spill: OpticsSpillParams;
    }
  | {
      kind: 'cone';
      innerRad: number;
      outerRad: number;
      sharpness: number;
      spill: OpticsSpillParams;
    }
  | {
      kind: 'tube';
      radiusM: number;
      residualRad: number;
      spill: OpticsSpillParams;
    }
  | {
      kind: 'gaussian';
      laser: LaserParams;
      lambdaM: number;
      spill: OpticsSpillParams;
    };

export function beamModelFromEmitter(emitter: LightEmitter): BeamModel {
  const spill = normalizeOpticsSpill(emitter.spill);
  const p = emitter.params;
  switch (p.mode) {
    case 'omni_lamp':
      return {
        kind: 'omni',
        softRadiusM: Math.max(p.omni.softRadiusM, 0.01),
        falloff: Math.max(p.omni.falloff, 0.5),
        spill,
      };
    case 'spotlight':
    case 'flashlight':
      return {
        kind: 'cone',
        innerRad: Math.max((p.spot.innerConeDeg * Math.PI) / 180, 0.01),
        outerRad: Math.max((p.spot.outerConeDeg * Math.PI) / 180, 0.02),
        sharpness: Math.max(p.spot.apertureSharpness, 1),
        spill,
      };
    case 'parallel':
      return {
        kind: 'tube',
        radiusM: Math.max(p.parallel.beamRadiusM, 0.001),
        residualRad: Math.max(p.parallel.residualMrad * 1e-3, 0),
        spill,
      };
    case 'sun': {
      // Wide parallel tube so volumetric/surface paths treat sun as directional key.
      const halfRad = Math.max((p.sun.angularDiameterDeg * 0.5 * Math.PI) / 180, 1e-4);
      return {
        kind: 'tube',
        radiusM: Math.max(Math.tan(halfRad) * 50, 5),
        residualRad: halfRad,
        spill,
      };
    }
    case 'laser':
      return {
        kind: 'gaussian',
        laser: normalizeLaserParams(p.laser),
        lambdaM: Math.max(emitter.wavelengthNm, 1) * 1e-9,
        spill,
      };
  }
}

/**
 * Pack BeamModel into GPU p0–p5 + spill slots.
 * gaussian: p0=w0, p1=m2, p2=lambda, p3=ellipticRatio, p4=waistOffset,
 *           p5=packUnitPair(topHat, sph), spill.y=packUnitPair(coma, astig).
 * Pair packing stays ≤9999 so float32 cannot collapse aberration digits.
 */
export function beamModelToGpuParams(model: BeamModel): {
  mode: number;
  p0: number;
  p1: number;
  p2: number;
  p3: number;
  p4: number;
  p5: number;
  spill: [number, number, number];
} {
  const spillBase: [number, number, number] = spillToGpuWeights(model.spill);
  switch (model.kind) {
    case 'omni':
      return { mode: 0, p0: model.softRadiusM, p1: model.falloff, p2: 0, p3: 0, p4: 0, p5: 0, spill: spillBase };
    case 'cone':
      return {
        mode: 1,
        p0: model.innerRad,
        p1: Math.max(model.outerRad, model.innerRad + 0.001),
        p2: model.sharpness,
        p3: 0,
        p4: 0,
        p5: 0,
        spill: spillBase,
      };
    case 'tube':
      return { mode: 2, p0: model.radiusM, p1: model.residualRad, p2: 0, p3: 0, p4: 0, p5: 0, spill: spillBase };
    case 'gaussian': {
      const L = model.laser;
      return {
        mode: 3,
        p0: L.w0M,
        p1: clampM2(L.m2),
        p2: model.lambdaM,
        p3: L.ellipticRatio,
        p4: L.waistOffsetM,
        p5: packUnitPair(L.topHatMix, L.sphericalAberration),
        spill: [spillBase[0], packUnitPair(L.coma, L.astigmatism), 0],
      };
    }
  }
}

/** Quantize two [0,1] values into one float32-safe integer 0…9999. */
export function packUnitPair(a: number, b: number): number {
  const qa = Math.floor(clamp01(a) * 99 + 1e-8);
  const qb = Math.floor(clamp01(b) * 99 + 1e-8);
  return qa * 100 + qb;
}

export function unpackUnitPair(packed: number): [number, number] {
  const v = Math.max(0, Math.floor(packed + 1e-6));
  const hi = Math.min(99, Math.floor(v / 100));
  const lo = Math.min(99, v % 100);
  return [hi / 99, lo / 99];
}

/** Unpack laser profile packs (p5 + spill.y). */
export function unpackLaserProfilePack(
  p5: number,
  spillY: number,
): {
  topHatMix: number;
  sphericalAberration: number;
  coma: number;
  astigmatism: number;
} {
  const [topHatMix, sphericalAberration] = unpackUnitPair(p5);
  const [coma, astigmatism] = unpackUnitPair(spillY);
  return { topHatMix, sphericalAberration, coma, astigmatism };
}

export interface RadianceSample {
  origin: [number, number, number];
  /** Emitter forward (unused for omni). */
  direction: [number, number, number];
  point: [number, number, number];
}

export interface RadianceFieldResult {
  core: number;
  spill: number;
  /** core + spill */
  total: number;
}

function sub3(
  a: [number, number, number],
  b: [number, number, number],
): [number, number, number] {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function len3(v: [number, number, number]): number {
  return Math.hypot(v[0], v[1], v[2]);
}

function norm3(v: [number, number, number]): [number, number, number] {
  const L = len3(v) || 1;
  return [v[0] / L, v[1] / L, v[2] / L];
}

function dot3(a: [number, number, number], b: [number, number, number]): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross3(
  a: [number, number, number],
  b: [number, number, number],
): [number, number, number] {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

/** Orthonormal basis (u,v) perpendicular to beam direction d. */
function beamBasis(d: [number, number, number]): {
  u: [number, number, number];
  v: [number, number, number];
} {
  const ax: [number, number, number] = Math.abs(d[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const u = norm3(cross3(d, ax));
  const v = cross3(d, u);
  return { u, v };
}

function evalGaussianCore(laser: LaserParams, lambdaM: number, sample: RadianceSample): number {
  const d = norm3(sample.direction);
  const op = sub3(sample.point, sample.origin);
  const t = dot3(op, d);
  if (t < 0) return 0;

  const closest: [number, number, number] = [
    sample.origin[0] + d[0] * t,
    sample.origin[1] + d[1] * t,
    sample.origin[2] + d[2] * t,
  ];
  const off = sub3(sample.point, closest);
  const { u, v } = beamBasis(d);
  let x = dot3(off, u);
  let y = dot3(off, v);

  // Coma: asymmetric shift (comet-like spot) along local u.
  if (laser.coma > 1e-4) {
    const r0 = Math.hypot(x, y);
    x += laser.coma * 0.28 * r0 * Math.sign(x || 1);
  }

  const waists = propagateLaserWaists(laser, lambdaM, t);
  const r = Math.hypot(x, y);
  const rNorm = r / Math.max(Math.sqrt(waists.wx * waists.wy), 1e-6);
  const scale = aberrationRadiusScale(
    rNorm,
    laser.sphericalAberration,
    laser.coma,
    x / (Math.abs(x) + Math.abs(y) + 1e-6),
  );
  const xs = x * scale;
  const ys = y * scale;

  let dens = gaussianTem00DensityElliptic(xs, ys, waists.wx, waists.wy);
  // Spherical aberration: soft outer skirt (educational 1/(1+k rT-)).
  if (laser.sphericalAberration > 1e-4) {
    const soft = 1 / (1 + laser.sphericalAberration * 2.2 * rNorm * rNorm);
    dens *= soft;
  }
  dens = topHatMixProfile(dens, rNorm, laser.topHatMix, waists.wx, waists.wy);
  return dens * DISPLAY_RADIANCE_SCALE;
}

function evalCore(model: BeamModel, sample: RadianceSample): number {
  const op = sub3(sample.point, sample.origin);
  const d = norm3(sample.direction);

  if (model.kind === 'omni') {
    // Lambertian-like soft source: inverse-square with soft aperture.
    const dist = Math.max(len3(op), 1e-4);
    const cosTerm = 1; // isotropic soft lamp (direction unused)
    const fall = Math.pow(dist / model.softRadiusM, model.falloff);
    return (cosTerm * DISPLAY_RADIANCE_SCALE) / (dist * dist * (1 + fall));
  }

  const t = dot3(op, d);
  if (t < 0) return 0;
  const closest: [number, number, number] = [
    sample.origin[0] + d[0] * t,
    sample.origin[1] + d[1] * t,
    sample.origin[2] + d[2] * t,
  ];
  const r = len3(sub3(sample.point, closest));

  if (model.kind === 'cone') {
    // IES-like sharp cone + soft rim (Lambert-weighted).
    const v = norm3(op);
    const cosTheta = Math.max(dot3(v, d), 0);
    const angle = Math.acos(cosTheta);
    const inner = model.innerRad;
    const outer = Math.max(model.outerRad, inner + 0.001);
    const cone = 1 - smoothstep(inner, outer, angle);
    if (cone <= 1e-5) return 0;
    const sharpness = Math.max(model.sharpness, 1);
    const core = Math.pow(cosTheta, sharpness) * (angle <= inner ? 1 : cone);
    const rim = cone * smoothstep(inner, outer, angle) * 0.25;
    const invR2 = 1 / Math.max(t * t, 0.01);
    return (core + rim) * invR2 * DISPLAY_RADIANCE_SCALE * 4;
  }

  if (model.kind === 'tube') {
    const br = model.radiusM + model.residualRad * t;
    return gaussianTem00Density(r, br) * DISPLAY_RADIANCE_SCALE;
  }

  return evalGaussianCore(model.laser, model.lambdaM, sample);
}

function evalSpillOnly(model: BeamModel, sample: RadianceSample, _core: number): number {
  const f = clampSpill01(model.spill.strayPowerFraction);
  if (f < 1e-5) return 0;

  const op = sub3(sample.point, sample.origin);
  const scale = DISPLAY_RADIANCE_SCALE;

  if (model.kind === 'omni') {
    const dist = len3(op);
    const softR = model.softRadiusM * (1.8 + f);
    return (f * scale) / (dist * dist * (1 + Math.pow(dist / softR, 2)));
  }

  const d = norm3(sample.direction);
  const t = dot3(op, d);
  if (t < 0) {
    const rb = len3(op);
    // Backward aperture / housing leakage
    return f * 0.35 * Math.exp(-(rb * rb) / 0.04) * scale;
  }
  const closest: [number, number, number] = [
    sample.origin[0] + d[0] * t,
    sample.origin[1] + d[1] * t,
    sample.origin[2] + d[2] * t,
  ];
  const off = sub3(sample.point, closest);
  const { u, v } = beamBasis(d);
  const x = dot3(off, u);
  const y = dot3(off, v);

  let brCore = 0.02;
  if (model.kind === 'gaussian') {
    const w = propagateLaserWaists(model.laser, model.lambdaM, t);
    brCore = Math.sqrt(Math.max(w.wx * w.wy, 1e-10));
  } else if (model.kind === 'tube') {
    brCore = Math.max(model.radiusM + model.residualRad * t, 0.01);
  } else {
    brCore = Math.max(Math.tan(model.outerRad) * t * 0.35, 0.08);
  }

  // Ghosts + halo + edge + flare streak (optics-train residual).
  return f * evalResidualDensity(x, y, brCore, t) * scale;
}


/** Physically plausible radiance density at a world/camera-relative sample point. */
export function evalRadianceField(model: BeamModel, sample: RadianceSample): RadianceFieldResult {
  const f = clampSpill01(model.spill.strayPowerFraction);
  const coreRaw = evalCore(model, sample);
  // Energy conservation: residual fraction leaves the designed core.
  const core = coreRaw * (1 - f);
  const spill = evalSpillOnly(model, sample, coreRaw);
  return { core, spill, total: core + spill };
}

export interface SurfaceBrdfWeights {
  albedo: number;
  metalness: number;
  roughness: number;
  reflectivity: number;
  absorption: number;
  /** @deprecated Prefer roughness — kept for UI migration. */
  shininess: number;
  diffuseWeight: number;
  specularWeight: number;
}

/** Material mapping for mesh StandardMaterial + surface radiance plugin (GGX). */
export function surfaceBrdfWeights(sm: SurfaceMaterial): SurfaceBrdfWeights {
  const albedo = clamp01(sm.albedo);
  const metal = clamp01(sm.metalness);
  const rough = clamp01(sm.roughness);
  const reflectivity = clamp01(albedo * (1 - metal) * 0.85 + metal * (0.55 + albedo * 0.4));
  const absorption = clamp01(1 - albedo * (0.55 + metal * 0.35));
  const gloss = Math.pow(1 - rough, 1.5);
  const shininess = clampRange(8 + gloss * 56, 8, 64);
  const diffuseWeight = Math.max(0, albedo * (1 - metal));
  const specularWeight = clamp01(0.04 * (1 - metal) + albedo * metal);
  return {
    albedo,
    metalness: metal,
    roughness: rough,
    reflectivity,
    absorption,
    shininess,
    diffuseWeight,
    specularWeight,
  };
}
