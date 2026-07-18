import { describe, expect, it } from 'vitest';
import { add, cross, dot, normalize, scale, sub, vec3 } from './vec3';
import { forward, fromEulerYXZ, identity, mul, rotateVec } from './quat';
import { fromTRS, getTranslation, mul as mulMat, transformDirection } from './mat4';
import { editableToVec3, eulerDegToQuat, quatToEulerDeg, vec3ToEditable } from './euler';

describe('gl-matrix-backed math', () => {
  it('vec3 ops', () => {
    expect(add(vec3(1, 2, 3), vec3(4, 5, 6))).toEqual([5, 7, 9]);
    expect(sub(vec3(4, 5, 6), vec3(1, 2, 3))).toEqual([3, 3, 3]);
    expect(scale(vec3(1, 2, 3), 2)).toEqual([2, 4, 6]);
    expect(dot(vec3(1, 0, 0), vec3(0, 1, 0))).toBe(0);
    expect(cross(vec3(1, 0, 0), vec3(0, 1, 0))).toEqual([0, 0, 1]);
    const n = normalize(vec3(0, 0, 4));
    expect(n[0]).toBeCloseTo(0);
    expect(n[1]).toBeCloseTo(0);
    expect(n[2]).toBeCloseTo(1);
  });

  it('quat yaw-pitch-roll and forward', () => {
    const q = fromEulerYXZ(0, 0, 0);
    expect(q[0]).toBeCloseTo(0);
    expect(q[1]).toBeCloseTo(0);
    expect(q[2]).toBeCloseTo(0);
    expect(q[3]).toBeCloseTo(1);
    const f = forward(fromEulerYXZ(0, 0, 0));
    expect(f[0]).toBeCloseTo(0);
    expect(f[1]).toBeCloseTo(0);
    expect(f[2]).toBeCloseTo(1);
    const rotated = rotateVec(fromEulerYXZ(Math.PI / 2, 0, 0), [0, 0, 1]);
    expect(rotated[0]).toBeCloseTo(1, 4);
    expect(rotated[2]).toBeCloseTo(0, 4);
  });

  it('mat4 TRS translation and parent multiply', () => {
    const local = fromTRS(vec3(1, 0, 0), identity(), vec3(1, 1, 1));
    const parent = fromTRS(vec3(2, 0, 0), identity(), vec3(1, 1, 1));
    const world = mulMat(parent, local);
    expect(getTranslation(world)[0]).toBeCloseTo(3);
    expect(getTranslation(world)[1]).toBeCloseTo(0);
    expect(getTranslation(world)[2]).toBeCloseTo(0);
    const dir = transformDirection(world, [0, 0, 1]);
    expect(dir[2]).toBeCloseTo(1);
  });

  it('euler inspector round-trip', () => {
    const q = eulerDegToQuat({ x: 10, y: -20, z: 35 });
    const e = quatToEulerDeg(q);
    expect(e.x).toBeCloseTo(10, 3);
    expect(e.y).toBeCloseTo(-20, 3);
    expect(e.z).toBeCloseTo(35, 3);
    expect(editableToVec3(vec3ToEditable([1, 2, 3]))).toEqual([1, 2, 3]);
  });

  it('quat multiply is associative with identity', () => {
    const q = fromEulerYXZ(0.3, -0.2, 0.1);
    const r = mul(q, identity());
    expect(r[0]).toBeCloseTo(q[0], 5);
    expect(r[1]).toBeCloseTo(q[1], 5);
    expect(r[2]).toBeCloseTo(q[2], 5);
    expect(r[3]).toBeCloseTo(q[3], 5);
  });
});
