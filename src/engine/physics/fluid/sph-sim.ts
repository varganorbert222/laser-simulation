/**
 * CPU SPH water (Müller-style) for FluidVolume MVP — SoA particle state, spatial hash.
 * Positions / velocities are local to the tank OBB (±halfExtents).
 */

export interface SphParams {
  halfExtents: [number, number, number];
  /** World / local gravity acceleration (m/s²-ish scaled). */
  gravity: [number, number, number];
  restDensity: number;
  stiffness: number;
  viscosity: number;
  /** Particle mass (auto if ≤ 0). */
  mass: number;
  /** Smoothing radius (auto from particle radius / halfExtents if ≤ 0). */
  h: number;
  /** Container linear acceleration in local space. */
  linearAccel: [number, number, number];
  /** Container angular velocity (rad/s) in local space. */
  angularVel: [number, number, number];
  inertiaCoupling: number;
}

export interface SphState {
  count: number;
  /** xyz interleaved */
  pos: Float32Array;
  /** xyz interleaved */
  vel: Float32Array;
  density: Float32Array;
  pressure: Float32Array;
  h: number;
  mass: number;
  halfExtents: [number, number, number];
  /** Visual / packing radius used at spawn. */
  particleRadius: number;
}

export const MAX_SPH_PARTICLES = 2048;

const POLY6_COEFF = 315 / (64 * Math.PI);
const SPIKY_GRAD_COEFF = -45 / Math.PI;
const VISC_LAP_COEFF = 45 / Math.PI;

/** Lattice spacing for a given particle radius (close-packed diameter). */
export function packingSpacing(particleRadius: number): number {
  return Math.max(0.02, particleRadius * 2);
}

/** SPH smoothing length from particle radius. */
export function smoothingFromRadius(particleRadius: number): number {
  return Math.max(0.04, particleRadius * 2.2);
}

/**
 * How many particles fit in the liquid slab volume at the given packing size.
 * liquidVol = fillFraction × OBB volume; cell = spacing³.
 */
export function particleCountForFill(
  halfExtents: readonly [number, number, number],
  fillFraction: number,
  particleRadius: number,
  maxParticles = MAX_SPH_PARTICLES,
): number {
  const hx = Math.max(halfExtents[0], 0.05);
  const hy = Math.max(halfExtents[1], 0.05);
  const hz = Math.max(halfExtents[2], 0.05);
  const fill = Math.min(0.95, Math.max(0.05, fillFraction));
  const r = Math.min(0.35, Math.max(0.015, particleRadius));
  const spacing = packingSpacing(r);
  const liquidVol = 8 * hx * hy * hz * fill;
  const cell = spacing * spacing * spacing;
  const n = Math.round(liquidVol / Math.max(cell, 1e-8));
  return Math.max(1, Math.min(maxParticles, n));
}

function smoothingRadius(half: [number, number, number], h: number): number {
  if (h > 1e-6) return h;
  const m = Math.min(half[0], half[1], half[2]);
  return Math.max(0.04, 0.12 * m);
}

function defaultMass(restDensity: number, h: number, count: number, half: [number, number, number]): number {
  const vol = 8 * half[0] * half[1] * half[2];
  const m = (restDensity * vol) / Math.max(count, 1);
  const h3 = h * h * h;
  return Math.min(Math.max(m, restDensity * h3 * 0.15), restDensity * h3 * 2.5);
}

function hashKey(cx: number, cy: number, cz: number): number {
  return ((cx * 73856093) ^ (cy * 19349663) ^ (cz * 83492791)) >>> 0;
}

/**
 * Spawn particles filling the lowest `fillFraction` of the OBB along −gravityDir (local).
 * Count is derived from fill volume ÷ packing cell (particleRadius).
 */
export function spawnFill(
  halfExtents: [number, number, number],
  fillFraction: number,
  particleRadius: number,
  gravityDir: [number, number, number],
): SphState {
  const r = Math.min(0.35, Math.max(0.015, particleRadius));
  const n = particleCountForFill(halfExtents, fillFraction, r);
  const fill = Math.min(0.95, Math.max(0.05, fillFraction));
  const hx = halfExtents[0];
  const hy = halfExtents[1];
  const hz = halfExtents[2];
  let gx = gravityDir[0];
  let gy = gravityDir[1];
  let gz = gravityDir[2];
  const gLen = Math.hypot(gx, gy, gz);
  if (gLen < 1e-8) {
    gx = 0;
    gy = -1;
    gz = 0;
  } else {
    gx /= gLen;
    gy /= gLen;
    gz /= gLen;
  }
  const ux = -gx;
  const uy = -gy;
  const uz = -gz;
  const extUp = Math.abs(ux) * hx + Math.abs(uy) * hy + Math.abs(uz) * hz;
  const minH = -extUp;
  const maxLiq = minH + fill * 2 * extUp;

  const h = smoothingFromRadius(r);
  const spacing = packingSpacing(r);
  const pos = new Float32Array(n * 3);
  const vel = new Float32Array(n * 3);
  const density = new Float32Array(n);
  const pressure = new Float32Array(n);

  const sites: number[] = [];
  const nx = Math.max(1, Math.ceil((2 * hx) / spacing));
  const ny = Math.max(1, Math.ceil((2 * hy) / spacing));
  const nz = Math.max(1, Math.ceil((2 * hz) / spacing));
  for (let iz = 0; iz < nz; iz++) {
    const z = -hz + (iz + 0.5) * ((2 * hz) / nz);
    for (let iy = 0; iy < ny; iy++) {
      const y = -hy + (iy + 0.5) * ((2 * hy) / ny);
      for (let ix = 0; ix < nx; ix++) {
        const x = -hx + (ix + 0.5) * ((2 * hx) / nx);
        const height = x * ux + y * uy + z * uz;
        if (height >= minH - 1e-4 && height <= maxLiq + 1e-4) {
          if (Math.abs(x) <= hx && Math.abs(y) <= hy && Math.abs(z) <= hz) {
            sites.push(x, y, z);
          }
        }
      }
    }
  }
  if (sites.length < 3) {
    sites.length = 0;
    const yTop = -hy + fill * 2 * hy;
    for (let iz = 0; iz < nz; iz++) {
      const z = -hz + (iz + 0.5) * ((2 * hz) / nz);
      for (let iy = 0; iy < ny; iy++) {
        const y = -hy + (iy + 0.5) * ((2 * hy) / ny);
        if (y > yTop) continue;
        for (let ix = 0; ix < nx; ix++) {
          const x = -hx + (ix + 0.5) * ((2 * hx) / nx);
          sites.push(x, y, z);
        }
      }
    }
  }

  const siteCount = Math.floor(sites.length / 3);
  for (let i = 0; i < n; i++) {
    const si = siteCount > 0 ? Math.floor((i * siteCount) / n) % siteCount : 0;
    const o = si * 3;
    pos[i * 3] = sites[o] ?? 0;
    pos[i * 3 + 1] = sites[o + 1] ?? (-hy + fill * hy);
    pos[i * 3 + 2] = sites[o + 2] ?? 0;
    pos[i * 3]! += ((i * 17) % 7) * 1e-4;
    pos[i * 3 + 1]! += ((i * 31) % 5) * 1e-4;
  }

  return {
    count: n,
    pos,
    vel,
    density,
    pressure,
    h,
    mass: defaultMass(1, h, n, halfExtents),
    halfExtents: [hx, hy, hz],
    particleRadius: r,
  };
}

export function createEmptySphState(capacity = MAX_SPH_PARTICLES): SphState {
  const n = Math.min(MAX_SPH_PARTICLES, Math.max(1, capacity));
  return {
    count: 0,
    pos: new Float32Array(n * 3),
    vel: new Float32Array(n * 3),
    density: new Float32Array(n),
    pressure: new Float32Array(n),
    h: 0.1,
    mass: 1,
    halfExtents: [1, 1, 1],
    particleRadius: 0.05,
  };
}

/**
 * One SPH step in local OBB space.
 */
export function step(state: SphState, dt: number, params: SphParams): void {
  const n = state.count;
  if (n <= 0 || dt <= 1e-8) return;

  const half = params.halfExtents;
  state.halfExtents = [half[0], half[1], half[2]];
  const h = smoothingRadius(half, params.h > 0 ? params.h : state.h);
  state.h = h;
  const mass =
    params.mass > 0 ? params.mass : defaultMass(params.restDensity, h, n, half);
  state.mass = mass;

  const h2 = h * h;
  const h6 = h2 * h2 * h2;
  const h9 = h6 * h2 * h;
  const poly6 = (POLY6_COEFF / h9) * mass;
  const viscLap = (VISC_LAP_COEFF / h6) * params.viscosity * mass;

  const rest = Math.max(params.restDensity, 1e-4);
  const stiff = Math.max(params.stiffness, 0);
  const pos = state.pos;
  const vel = state.vel;
  const dens = state.density;
  const pres = state.pressure;

  // Spatial hash
  const invH = 1 / h;
  const cellLists = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const o = i * 3;
    const cx = Math.floor(pos[o]! * invH);
    const cy = Math.floor(pos[o + 1]! * invH);
    const cz = Math.floor(pos[o + 2]! * invH);
    const key = hashKey(cx, cy, cz);
    let list = cellLists.get(key);
    if (!list) {
      list = [];
      cellLists.set(key, list);
    }
    list.push(i);
  }

  const neighbors: number[][] = new Array(n);
  for (let i = 0; i < n; i++) {
    const o = i * 3;
    const cx = Math.floor(pos[o]! * invH);
    const cy = Math.floor(pos[o + 1]! * invH);
    const cz = Math.floor(pos[o + 2]! * invH);
    const nb: number[] = [];
    for (let dz = -1; dz <= 1; dz++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const list = cellLists.get(hashKey(cx + dx, cy + dy, cz + dz));
          if (!list) continue;
          for (const j of list) {
            if (j === i) continue;
            const jo = j * 3;
            const rx = pos[o]! - pos[jo]!;
            const ry = pos[o + 1]! - pos[jo + 1]!;
            const rz = pos[o + 2]! - pos[jo + 2]!;
            if (rx * rx + ry * ry + rz * rz < h2) nb.push(j);
          }
        }
      }
    }
    neighbors[i] = nb;
  }

  // Density (poly6) + pressure
  for (let i = 0; i < n; i++) {
    const o = i * 3;
    // W_poly6(0) = 315/(64π h^9) * h^6
    let rho = (POLY6_COEFF / h9) * h6 * mass;
    const nb = neighbors[i]!;
    for (const j of nb) {
      const jo = j * 3;
      const rx = pos[o]! - pos[jo]!;
      const ry = pos[o + 1]! - pos[jo + 1]!;
      const rz = pos[o + 2]! - pos[jo + 2]!;
      const r2 = rx * rx + ry * ry + rz * rz;
      const t = h2 - r2;
      rho += poly6 * t * t * t;
    }
    dens[i] = Math.max(rho, rest * 0.05);
    pres[i] = stiff * (dens[i]! - rest);
  }

  const gx = params.gravity[0];
  const gy = params.gravity[1];
  const gz = params.gravity[2];
  const coup = Math.min(1, Math.max(0, params.inertiaCoupling));
  const ax = params.linearAccel[0] * coup;
  const ay = params.linearAccel[1] * coup;
  const az = params.linearAccel[2] * coup;
  const wx = params.angularVel[0] * coup;
  const wy = params.angularVel[1] * coup;
  const wz = params.angularVel[2] * coup;

  const hSpiky = h * h * h * h * h * h; // h^6
  const spikyScale = (SPIKY_GRAD_COEFF / hSpiky) * mass;

  // Forces → integrate
  for (let i = 0; i < n; i++) {
    const o = i * 3;
    const xi = pos[o]!;
    const yi = pos[o + 1]!;
    const zi = pos[o + 2]!;
    const di = dens[i]!;
    const pi = pres[i]!;
    let fx = 0;
    let fy = 0;
    let fz = 0;
    const nb = neighbors[i]!;
    for (const j of nb) {
      const jo = j * 3;
      const rx = xi - pos[jo]!;
      const ry = yi - pos[jo + 1]!;
      const rz = zi - pos[jo + 2]!;
      const r2 = rx * rx + ry * ry + rz * rz;
      const r = Math.sqrt(r2) + 1e-8;
      if (r >= h) continue;
      const dj = dens[j]!;
      const pj = pres[j]!;
      // Spiky pressure gradient
      const t = h - r;
      const pTerm = (pi + pj) / (2 * di * dj);
      const coeff = spikyScale * pTerm * t * t;
      fx -= coeff * (rx / r);
      fy -= coeff * (ry / r);
      fz -= coeff * (rz / r);
      // Viscosity
      if (params.viscosity > 1e-8) {
        const vix = vel[o]!;
        const viy = vel[o + 1]!;
        const viz = vel[o + 2]!;
        const dvx = vel[jo]! - vix;
        const dvy = vel[jo + 1]! - viy;
        const dvz = vel[jo + 2]! - viz;
        const vCoeff = viscLap * (t / dj);
        fx += vCoeff * dvx;
        fy += vCoeff * dvy;
        fz += vCoeff * dvz;
      }
    }

    // Gravity + fictitious container forces (−a − ω×(ω×r) − α×r ≈ −a − ω×v for MVP)
    fx += gx - ax;
    fy += gy - ay;
    fz += gz - az;
    // Coriolis-ish: −2 ω × v (simple); also −ω × (ω × r) centrifugal
    const vix = vel[o]!;
    const viy = vel[o + 1]!;
    const viz = vel[o + 2]!;
    fx += -2 * (wy * viz - wz * viy) - (wy * (wy * xi - wx * yi) - wz * (wz * xi - wx * zi));
    fy += -2 * (wz * vix - wx * viz) - (wz * (wz * yi - wy * zi) - wx * (wx * yi - wy * xi));
    fz += -2 * (wx * viy - wy * vix) - (wx * (wx * zi - wz * xi) - wy * (wy * zi - wz * yi));

    vel[o] = vix + fx * dt;
    vel[o + 1] = viy + fy * dt;
    vel[o + 2] = viz + fz * dt;
  }

  // Integrate + OBB collide (local axes)
  const damp = 0.4;
  const pad = h * 0.15;
  for (let i = 0; i < n; i++) {
    const o = i * 3;
    let x = pos[o]! + vel[o]! * dt;
    let y = pos[o + 1]! + vel[o + 1]! * dt;
    let z = pos[o + 2]! + vel[o + 2]! * dt;
    let vx = vel[o]!;
    let vy = vel[o + 1]!;
    let vz = vel[o + 2]!;

    const bx = half[0] - pad;
    const by = half[1] - pad;
    const bz = half[2] - pad;
    if (x > bx) {
      x = bx;
      vx = -Math.abs(vx) * damp;
    } else if (x < -bx) {
      x = -bx;
      vx = Math.abs(vx) * damp;
    }
    if (y > by) {
      y = by;
      vy = -Math.abs(vy) * damp;
    } else if (y < -by) {
      y = -by;
      vy = Math.abs(vy) * damp;
    }
    if (z > bz) {
      z = bz;
      vz = -Math.abs(vz) * damp;
    } else if (z < -bz) {
      z = -bz;
      vz = Math.abs(vz) * damp;
    }

    pos[o] = x;
    pos[o + 1] = y;
    pos[o + 2] = z;
    vel[o] = vx;
    vel[o + 1] = vy;
    vel[o + 2] = vz;
  }
}

/** Re-export step as namespaced helpers for binder convenience. */
export const SphSim = {
  spawnFill,
  step,
  createEmptySphState,
  MAX_PARTICLES: MAX_SPH_PARTICLES,
  particleCountForFill,
};
