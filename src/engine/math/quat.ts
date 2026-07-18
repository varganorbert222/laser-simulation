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

export function rotateVec(q: Quat, v: Vec3): Vec3 {
  const o: [number, number, number] = [0, 0, 0];
  gvec3.transformQuat(o, [v[0], v[1], v[2]], asMut(q));
  return o;
}

/** Local +Z forward → world direction */
export function forward(q: Quat): Vec3 {
  return normalizeVec3(rotateVec(q, [0, 0, 1]));
}

export function clone(q: Quat): Quat {
  return [q[0], q[1], q[2], q[3]];
}
