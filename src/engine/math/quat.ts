/**
 * Serializable xyzw quaternions — ops via gl-matrix.
 */
import { quat as gquat, vec3 as gvec3 } from 'gl-matrix';
import type { Vec3 } from './vec3';
import { normalize as normalizeVec3 } from './vec3';

export type Quat = readonly [number, number, number, number];

type MutableQuat = [number, number, number, number];

function out(): MutableQuat {
  return [0, 0, 0, 1];
}

function asMut(q: Quat): MutableQuat {
  return [q[0], q[1], q[2], q[3]];
}

export function identity(): Quat {
  const o = out();
  gquat.identity(o);
  return o;
}

/** Yaw (Y), pitch (X), roll (Z) in radians. */
export function fromEulerYXZ(yaw: number, pitch: number, roll: number): Quat {
  const qy = out();
  const qx = out();
  const qz = out();
  gquat.setAxisAngle(qy, [0, 1, 0], yaw);
  gquat.setAxisAngle(qx, [1, 0, 0], pitch);
  gquat.setAxisAngle(qz, [0, 0, 1], roll);
  const o = out();
  gquat.multiply(o, qy, qx);
  gquat.multiply(o, o, qz);
  return o;
}

export function normalize(q: Quat): Quat {
  if (gquat.squaredLength(asMut(q)) < 1e-24) return identity();
  const o = out();
  gquat.normalize(o, asMut(q));
  return o;
}

export function mul(a: Quat, b: Quat): Quat {
  const o = out();
  gquat.multiply(o, asMut(a), asMut(b));
  return o;
}

export function invert(q: Quat): Quat {
  const o = out();
  gquat.invert(o, asMut(q));
  return o;
}

/**
 * Angular velocity (rad/s) from consecutive orientations.
 * Uses the shortest-arc delta quaternion.
 */
export function angularVelocity(prev: Quat, curr: Quat, dt: number): Vec3 {
  if (dt < 1e-6) return [0, 0, 0];
  const dq = mul(curr, invert(prev));
  // Ensure shortest path
  const q: MutableQuat =
    dq[3] < 0 ? [-dq[0], -dq[1], -dq[2], -dq[3]] : [dq[0], dq[1], dq[2], dq[3]];
  const w = Math.min(1, Math.max(-1, q[3]));
  const angle = 2 * Math.acos(w);
  if (angle < 1e-8) return [0, 0, 0];
  const s = Math.sin(angle * 0.5);
  if (Math.abs(s) < 1e-8) return [0, 0, 0];
  const inv = angle / (s * dt);
  return [q[0] * inv, q[1] * inv, q[2] * inv];
}

export function rotateVec(q: Quat, v: Vec3): Vec3 {
  const o: [number, number, number] = [0, 0, 0];
  gvec3.transformQuat(o, [v[0], v[1], v[2]], asMut(q));
  return o;
}

/** Local +Z forward → world direction */
export function forward(q: Quat): Vec3 {
  return normalizeVec3(rotateVec(q, [0, 0, 1]));
}

/**
 * Quaternion that maps local +Z onto `dir` (light / emitter aim convention).
 */
export function fromDirection(dir: Vec3): Quat {
  const d = normalizeVec3(dir);
  const o = out();
  gquat.rotationTo(o, [0, 0, 1], [d[0], d[1], d[2]]);
  return normalize(o);
}

export function clone(q: Quat): Quat {
  return [q[0], q[1], q[2], q[3]];
}
