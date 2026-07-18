/**
 * Serializable vec3 tuples — ECS / JSON stay framework-free.
 * Ops delegate to gl-matrix.
 */
import { vec3 as gvec3 } from 'gl-matrix';

export type Vec3 = readonly [number, number, number];

type MutableVec3 = [number, number, number];

function out(): MutableVec3 {
  return [0, 0, 0];
}

function asMut(v: Vec3): MutableVec3 {
  return [v[0], v[1], v[2]];
}

export function vec3(x = 0, y = 0, z = 0): Vec3 {
  return [x, y, z];
}

export function add(a: Vec3, b: Vec3): Vec3 {
  const o = out();
  gvec3.add(o, asMut(a), asMut(b));
  return o;
}

export function sub(a: Vec3, b: Vec3): Vec3 {
  const o = out();
  gvec3.sub(o, asMut(a), asMut(b));
  return o;
}

export function scale(a: Vec3, s: number): Vec3 {
  const o = out();
  gvec3.scale(o, asMut(a), s);
  return o;
}

export function dot(a: Vec3, b: Vec3): number {
  return gvec3.dot(asMut(a), asMut(b));
}

export function cross(a: Vec3, b: Vec3): Vec3 {
  const o = out();
  gvec3.cross(o, asMut(a), asMut(b));
  return o;
}

export function length(a: Vec3): number {
  return gvec3.length(asMut(a));
}

export function normalize(a: Vec3): Vec3 {
  if (gvec3.squaredLength(asMut(a)) < 1e-24) return [0, 0, 1];
  const o = out();
  gvec3.normalize(o, asMut(a));
  return o;
}

export function clone(a: Vec3): Vec3 {
  return [a[0], a[1], a[2]];
}

export function equals(a: Vec3, b: Vec3, eps = 1e-9): boolean {
  return (
    Math.abs(a[0] - b[0]) <= eps &&
    Math.abs(a[1] - b[1]) <= eps &&
    Math.abs(a[2] - b[2]) <= eps
  );
}
