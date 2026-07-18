/**
 * Euler degrees for inspector display.
 * Convention: x = roll, y = pitch, z = yaw (degrees).
 * Conversion formulas are paired inverses; vector/quat algebra uses gl-matrix elsewhere.
 */
import type { Quat } from './quat';

export interface EulerDeg {
  x: number;
  y: number;
  z: number;
}

export interface Vec3Editable {
  x: number;
  y: number;
  z: number;
}

const RAD2DEG = 180 / Math.PI;
const DEG2RAD = Math.PI / 180;

export function vec3ToEditable(v: readonly [number, number, number]): Vec3Editable {
  return { x: v[0], y: v[1], z: v[2] };
}

export function editableToVec3(v: Vec3Editable): readonly [number, number, number] {
  return [v.x, v.y, v.z];
}

export function quatToEulerDeg(q: Quat): EulerDeg {
  const [x, y, z, w] = q;
  const sinr = 2 * (w * x + y * z);
  const cosr = 1 - 2 * (x * x + y * y);
  const roll = Math.atan2(sinr, cosr);

  const sinp = 2 * (w * y - z * x);
  const pitch = Math.abs(sinp) >= 1 ? (Math.sign(sinp) * Math.PI) / 2 : Math.asin(sinp);

  const siny = 2 * (w * z + x * y);
  const cosy = 1 - 2 * (y * y + z * z);
  const yaw = Math.atan2(siny, cosy);

  return {
    x: roll * RAD2DEG,
    y: pitch * RAD2DEG,
    z: yaw * RAD2DEG,
  };
}

export function eulerDegToQuat(e: EulerDeg): Quat {
  const roll = e.x * DEG2RAD;
  const pitch = e.y * DEG2RAD;
  const yaw = e.z * DEG2RAD;
  const cr = Math.cos(roll * 0.5);
  const sr = Math.sin(roll * 0.5);
  const cp = Math.cos(pitch * 0.5);
  const sp = Math.sin(pitch * 0.5);
  const cy = Math.cos(yaw * 0.5);
  const sy = Math.sin(yaw * 0.5);
  return [
    sr * cp * cy - cr * sp * sy,
    cr * sp * cy + sr * cp * sy,
    cr * cp * sy - sr * sp * cy,
    cr * cp * cy + sr * sp * sy,
  ];
}
