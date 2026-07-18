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

export function transformDirection(m: Mat4, v: Vec3): Vec3 {
  return [
    m[0] * v[0] + m[4] * v[1] + m[8] * v[2],
    m[1] * v[0] + m[5] * v[1] + m[9] * v[2],
    m[2] * v[0] + m[6] * v[1] + m[10] * v[2],
  ];
}
