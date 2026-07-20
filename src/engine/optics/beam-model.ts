/**
 * Unified beam / radiance field model.
 *
 * Light is light: the emitter only chooses the radiation profile
 * (omni soft / cone lamp / parallel tube / Gaussian laser).
 * Volumetric Li and surface BRDF both evaluate the same field.
 */

import type { LightEmitter } from '../ecs/components';
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
import { defaultOpticsSpill, normalizeOpticsSpill, spillToGpuWeights } from './optics-spill';
import type { SurfaceMaterial } from './surface-material';

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

/** GPU mode code matching volumetric / surface shaders. */
export function beamModeCode(kind: BeamKind): number {
  switch (kind) {
    case 'omni':
      return 0;
    case 'cone':
      return 1;
    case 'tube':
      return 2;
    case 'gaussian':
      return 3;
  }
}

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
 * Pack BeamModel into GPU p0–p5 slots.
 * gaussian: p0=w0, p1=m2, p2=lambda, p3=ellipticRatio,
 *           p4=waistOffset, p5=pack(topHat,sph,coma,astig) as float bits via decimals.
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
  const spill: [number, number, number] = spillToGpuWeights(model.spill);
  switch (model.kind) {
    case 'omni':
      return { mode: 0, p0: model.softRadiusM, p1: model.falloff, p2: 0, p3: 0, p4: 0, p5: 0, spill };
    case 'cone':
      return {
        mode: 1,
        p0: model.innerRad,
        p1: Math.max(model.outerRad, model.innerRad + 0.001),
        p2: model.sharpness,
        p3: 0,
        p4: 0,
        p5: 0,
        spill,
      };
    case 'tube':
      return { mode: 2, p0: model.radiusM, p1: model.residualRad, p2: 0, p3: 0, p4: 0, p5: 0, spill };
    case 'gaussian': {
      const L = model.laser;
      // Pack 4× [0,1] into one float: tttt.ssssccccaaaa style via base-100 encoding.
      const p5 =
        Math.floor(L.topHatMix * 99) * 1e6 +
        Math.floor(L.sphericalAberration * 99) * 1e4 +
        Math.floor(L.coma * 99) * 1e2 +
        Math.floor(L.astigmatism * 99);
      return {
        mode: 3,
        p0: L.w0M,
        p1: clampM2(L.m2),
        p2: model.lambdaM,
        p3: L.ellipticRatio,
        p4: L.waistOffsetM,
        p5,
        spill,
      };
    }
  }
}

export function unpackLaserAberrationP5(p5: number): {
  topHatMix: number;
  sphericalAberration: number;
  coma: number;
  astigmatism: number;
} {
  const v = Math.max(0, Math.floor(p5));
  const topHatMix = Math.floor(v / 1e6) / 99;
  const sphericalAberration = (Math.floor(v / 1e4) % 100) / 99;
  const coma = (Math.floor(v / 1e2) % 100) / 99;
  const astigmatism = (v % 100) / 99;
  return {
    topHatMix: Math.min(1, topHatMix),
    sphericalAberration: Math.min(1, sphericalAberration),
    coma: Math.min(1, coma),
    astigmatism: Math.min(1, astigmatism),
  };
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

  // Coma: asymmetric shift along u
  if (laser.coma > 1e-4) {
    const r0 = Math.hypot(x, y);
    x += laser.coma * 0.15 * r0 * Math.sign(x || 1);
  }

  const waists = propagateLaserWaists(laser, lambdaM, t);
  const r = Math.hypot(x, y);
  const rNorm = r / Math.max(Math.sqrt(waists.wx * waists.wy), 1e-6);
  const scale = aberrationRadiusScale(rNorm, laser.sphericalAberration, laser.coma, x / (Math.abs(x) + Math.abs(y) + 1e-6));
  const xs = x * scale;
  const ys = y * scale;

  let dens = gaussianTem00DensityElliptic(xs, ys, waists.wx, waists.wy);
  dens = topHatMixProfile(dens, rNorm, laser.topHatMix);
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
  const f = Math.min(0.85, Math.max(0, model.spill.strayPowerFraction));
  if (f < 1e-5) return 0;

  const op = sub3(sample.point, sample.origin);
  const scale = DISPLAY_RADIANCE_SCALE;

  if (model.kind === 'omni') {
    const dist = len3(op);
    const softR = model.softRadiusM * (1.8 + f);
    // Wide isotropic residual — étendue-ish 1/r² soft falloff
    return (f * scale) / (dist * dist * (1 + Math.pow(dist / softR, 2)));
  }

  const d = norm3(sample.direction);
  const t = dot3(op, d);
  if (t < 0) {
    const rb = len3(op);
    // Backward aperture leakage
    return f * 0.35 * Math.exp(-(rb * rb) / 0.04) * scale;
  }
  const closest: [number, number, number] = [
    sample.origin[0] + d[0] * t,
    sample.origin[1] + d[1] * t,
    sample.origin[2] + d[2] * t,
  ];
  const r = len3(sub3(sample.point, closest));

  let brCore = 0.02;
  if (model.kind === 'gaussian') {
    const w = propagateLaserWaists(model.laser, model.lambdaM, t);
    brCore = Math.sqrt(Math.max(w.wx * w.wy, 1e-10));
  } else if (model.kind === 'tube') {
    brCore = Math.max(model.radiusM + model.residualRad * t, 0.01);
  } else {
    brCore = Math.max(Math.tan(model.outerRad) * t * 0.35, 0.08);
  }

  // Wide residual lobe (~3–6× core radius), density-normalized so f is meaningful power share.
  const brStray = brCore * (3.2 + 4 * f);
  const dens = gaussianTem00Density(r, brStray) * Math.exp(-0.03 * t);
  return f * dens * scale;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0 || 1e-8)));
  return t * t * (3 - 2 * t);
}

/** Physically plausible radiance density at a world/camera-relative sample point. */
export function evalRadianceField(model: BeamModel, sample: RadianceSample): RadianceFieldResult {
  const f = Math.min(0.85, Math.max(0, model.spill.strayPowerFraction));
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
  const albedo = Math.min(1, Math.max(0, sm.albedo));
  const metal = Math.min(1, Math.max(0, sm.metalness));
  const rough = Math.min(1, Math.max(0, sm.roughness));
  const reflectivity = Math.min(
    1,
    Math.max(0, albedo * (1 - metal) * 0.85 + metal * (0.55 + albedo * 0.4)),
  );
  const absorption = Math.min(1, Math.max(0, 1 - albedo * (0.55 + metal * 0.35)));
  const gloss = Math.pow(1 - rough, 1.5);
  const shininess = Math.min(64, Math.max(8, 8 + gloss * 56));
  const diffuseWeight = Math.max(0, albedo * (1 - metal));
  const specularWeight = Math.min(1, 0.04 * (1 - metal) + albedo * metal);
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

/** Empty spill for tests. */
export function zeroSpill(): OpticsSpillParams {
  return { strayPowerFraction: 0 };
}

export function defaultBeamSpill(): OpticsSpillParams {
  return defaultOpticsSpill();
}

/**
 * Shared GLSL for evalRadianceField core+spill (mode/p0–p5/spill layout).
 * Used by volumetric fragment and surface radiance plugin.
 */
export function radianceFieldGlslFunctions(): string {
  return `
const float RF_DISPLAY_SCALE = 1e-3;

float rfUnpackTopHat(float p5) { return floor(p5 / 1e6) / 99.0; }
float rfUnpackSph(float p5) { return mod(floor(p5 / 1e4), 100.0) / 99.0; }
float rfUnpackComa(float p5) { return mod(floor(p5 / 1e2), 100.0) / 99.0; }
float rfUnpackAstig(float p5) { return mod(p5, 100.0) / 99.0; }

void rfBeamBasis(vec3 d, out vec3 u, out vec3 v) {
  vec3 ax = abs(d.x) < 0.9 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
  u = normalize(cross(d, ax));
  v = cross(d, u);
}

float rfTem00Elliptic(float x, float y, float wx, float wy) {
  float ax = max(wx, 1e-6);
  float ay = max(wy, 1e-6);
  return (2.0 / 3.14159265) / (ax * ay) * exp(-2.0 * ((x * x) / (ax * ax) + (y * y) / (ay * ay)));
}

float rfGaussianCore(
  vec3 pCam, vec3 o, vec3 dIn,
  float w0, float m2, float lambdaM, float elliptic, float waistOff, float p5
) {
  vec3 d = normalize(dIn);
  vec3 op = pCam - o;
  float t = dot(op, d);
  if (t < 0.0) return 0.0;

  vec3 closest = o + d * t;
  vec3 off = pCam - closest;
  vec3 u; vec3 v;
  rfBeamBasis(d, u, v);
  float x = dot(off, u);
  float y = dot(off, v);

  float topHat = clamp(rfUnpackTopHat(p5), 0.0, 1.0);
  float sph = clamp(rfUnpackSph(p5), 0.0, 1.0);
  float coma = clamp(rfUnpackComa(p5), 0.0, 1.0);
  float astig = clamp(rfUnpackAstig(p5), 0.0, 1.0);

  if (coma > 1e-4) {
    float r0 = length(vec2(x, y));
    x += coma * 0.15 * r0 * sign(x == 0.0 ? 1.0 : x);
  }

  float w0x = max(w0, 1e-4);
  float w0y = max(w0x * max(elliptic, 0.2), 1e-4);
  float m = clamp(m2, 1.0, 50.0);
  float zRX = 3.14159265 * w0x * w0x / (m * max(lambdaM, 1e-12));
  float zRY = 3.14159265 * w0y * w0y / (m * max(lambdaM, 1e-12));
  float delta = astig * 0.5 * max(zRX, zRY);
  float zx = t - waistOff - delta;
  float zy = t - waistOff + delta;
  float wx = w0x * sqrt(1.0 + (zx / max(zRX, 1e-6)) * (zx / max(zRX, 1e-6)));
  float wy = w0y * sqrt(1.0 + (zy / max(zRY, 1e-6)) * (zy / max(zRY, 1e-6)));

  float r = length(vec2(x, y));
  float rNorm = r / max(sqrt(wx * wy), 1e-6);
  float r2 = rNorm * rNorm;
  float sphStretch = 1.0 + sph * 0.55 * r2 * r2;
  float comaAxis = x / (abs(x) + abs(y) + 1e-6);
  float comaShift = 1.0 + coma * 0.35 * max(comaAxis, 0.0) * rNorm;
  float scale = sphStretch * comaShift;
  float dens = rfTem00Elliptic(x * scale, y * scale, wx, wy);
  if (topHat > 1e-5) {
    // Avoid identifier "flat" — reserved interpolation qualifier in GLSL ES 3.
    float topHatShape = rNorm < 1.0 ? 1.0 : exp(-4.0 * (rNorm - 1.0) * (rNorm - 1.0));
    float topHatDens = topHatShape * (2.0 / 3.14159265) / max(wx * wy, 1e-10);
    dens = mix(dens, topHatDens, topHat);
  }
  return dens * RF_DISPLAY_SCALE;
}

float rfEvalCore(vec3 pCam, vec3 o, vec3 dIn, float mode, float p0, float p1, float p2, float p3, float p4, float p5) {
  vec3 d = normalize(dIn);
  vec3 op = pCam - o;

  if (mode < 0.5) {
    float softR = max(p0, 0.01);
    float dist = max(length(op), 1e-4);
    float fall = pow(dist / softR, max(p1, 0.5));
    return RF_DISPLAY_SCALE / (dist * dist * (1.0 + fall));
  }

  float t = dot(op, d);
  if (t < 0.0) return 0.0;
  float r = length(pCam - (o + d * t));

  if (mode < 1.5) {
    float inner = max(p0, 0.01);
    float outer = max(p1, inner + 0.001);
    vec3 v = normalize(op);
    float cosTheta = max(dot(v, d), 0.0);
    float angle = acos(cosTheta);
    float cone = 1.0 - smoothstep(inner, outer, angle);
    if (cone <= 1e-5) return 0.0;
    float sharpness = max(p2, 1.0);
    float core = pow(cosTheta, sharpness) * (angle <= inner ? 1.0 : cone);
    float rim = cone * smoothstep(inner, outer, angle) * 0.25;
    float invR2 = 1.0 / max(t * t, 0.01);
    return (core + rim) * invR2 * RF_DISPLAY_SCALE * 4.0;
  }

  if (mode < 2.5) {
    float br = max(p0 + p1 * t, 1e-6);
    return (2.0 / 3.14159265) / (br * br) * exp(-2.0 * (r * r) / (br * br)) * RF_DISPLAY_SCALE;
  }

  return rfGaussianCore(pCam, o, dIn, max(p0, 1e-4), max(p1, 1.0), max(p2, 1e-9), max(p3, 0.2), p4, p5);
}

float rfEvalRadianceField(
  vec3 pCam, vec3 o, vec3 dIn, float mode,
  float p0, float p1, float p2, float p3, float p4, float p5, vec3 spill
) {
  // spill.x = strayPowerFraction (energy share outside designed core).
  float f = clamp(max(spill.x, 0.0), 0.0, 0.85);
  float coreRaw = rfEvalCore(pCam, o, dIn, mode, p0, p1, p2, p3, p4, p5);
  float core = coreRaw * (1.0 - f);
  if (f < 1e-5) return core;

  if (mode < 0.5) {
    float dist = max(length(pCam - o), 1e-4);
    float softR = max(p0, 0.01) * (1.8 + f);
    float residual = f * RF_DISPLAY_SCALE / (dist * dist * (1.0 + pow(dist / softR, 2.0)));
    return core + residual;
  }

  vec3 d = normalize(dIn);
  vec3 op = pCam - o;
  float t = dot(op, d);
  if (t < 0.0) {
    float rb = length(op);
    return core + f * 0.35 * exp(-(rb * rb) / 0.04) * RF_DISPLAY_SCALE;
  }
  float r = length(pCam - (o + d * t));

  float brCore = 0.02;
  if (mode >= 2.5) {
    float dens = rfGaussianCore(pCam, o, dIn, max(p0, 1e-4), max(p1, 1.0), max(p2, 1e-9), max(p3, 0.2), p4, p5);
    float peak = dens / max(RF_DISPLAY_SCALE, 1e-12);
    brCore = sqrt(max(2.0 / (3.14159265 * max(peak, 1e-6)), 1e-8));
  } else if (mode >= 1.5) {
    brCore = max(p0 + p1 * t, 0.01);
  } else {
    float outer = max(p1, 0.05);
    brCore = max(tan(outer) * t * 0.35, 0.08);
  }

  float brStray = brCore * (3.2 + 4.0 * f);
  float dens = (2.0 / 3.14159265) / max(brStray * brStray, 1e-10)
    * exp(-2.0 * (r * r) / max(brStray * brStray, 1e-10))
    * exp(-0.03 * t);
  return core + f * dens * RF_DISPLAY_SCALE;
}
`;
}
