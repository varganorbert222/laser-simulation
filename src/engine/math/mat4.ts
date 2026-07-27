/**
 * Column-major 4×4 matrices as Float32Array — ops via gl-matrix.
 */
import { mat4 as gmat4 } from 'gl-matrix';
import type { Quat } from './quat';
import type { Vec3 } from './vec3';

export type Mat4 = Float32Array;

export function identity(): Mat4 {
  return gmat4.create() as Mat4;
}

export function fromTRS(t: Vec3, r: Quat, s: Vec3): Mat4 {
  const out = gmat4.create();
  gmat4.fromRotationTranslationScale(
    out,
    [r[0], r[1], r[2], r[3]],
    [t[0], t[1], t[2]],
    [s[0], s[1], s[2]],
  );
  return out as Mat4;
}

export function mul(a: Mat4, b: Mat4): Mat4 {
  const out = gmat4.create();
  gmat4.multiply(out, a, b);
  return out as Mat4;
}

export function getTranslation(m: Mat4): Vec3 {
  return [m[12], m[13], m[14]];
}

/** Extract rotation quaternion from a TRS matrix (gl-matrix). */
export function getRotation(m: Mat4): Quat {
  const o: [number, number, number, number] = [0, 0, 0, 1];
  gmat4.getRotation(o, m);
  return o;
}

export function transformDirection(m: Mat4, v: Vec3): Vec3 {
  return [
    m[0] * v[0] + m[4] * v[1] + m[8] * v[2],
    m[1] * v[0] + m[5] * v[1] + m[9] * v[2],
    m[2] * v[0] + m[6] * v[1] + m[10] * v[2],
  ];
}

/** Orthonormal world basis from a TRS matrix (columns, normalized). */
export function getBasis(m: Mat4): { x: Vec3; y: Vec3; z: Vec3 } {
  const nx = Math.hypot(m[0], m[1], m[2]) || 1;
  const ny = Math.hypot(m[4], m[5], m[6]) || 1;
  const nz = Math.hypot(m[8], m[9], m[10]) || 1;
  const x: Vec3 = [m[0] / nx, m[1] / nx, m[2] / nx];
  let y: Vec3 = [m[4] / ny, m[5] / ny, m[6] / ny];
  let z: Vec3 = [m[8] / nz, m[9] / nz, m[10] / nz];
  // Re-orthonormalize (Gram–Schmidt) and enforce a right-handed basis so
  // 180° flips / non-uniform scale do not invert OBB tests or gravity projection.
  const dx = x[0] * y[0] + x[1] * y[1] + x[2] * y[2];
  y = [y[0] - x[0] * dx, y[1] - x[1] * dx, y[2] - x[2] * dx];
  const nyn = Math.hypot(y[0], y[1], y[2]) || 1;
  y = [y[0] / nyn, y[1] / nyn, y[2] / nyn];
  z = [
    x[1] * y[2] - x[2] * y[1],
    x[2] * y[0] - x[0] * y[2],
    x[0] * y[1] - x[1] * y[0],
  ];
  return { x, y, z };
}
