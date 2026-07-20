import { describe, expect, it } from 'vitest';
import {
  PLUME_DISABLED_CONE_COS,
  coneCosFromHalfAngleDeg,
  plumeEnvelope,
} from './smoke-plume';

describe('plumeEnvelope', () => {
  const dir: [number, number, number] = [0, 0, 1];

  it('disabled coneCos returns uniform fill (1)', () => {
    expect(plumeEnvelope([0, 0, 1], dir, PLUME_DISABLED_CONE_COS, 4, 1)).toBe(1);
    expect(plumeEnvelope([10, 0, 0], dir, -1, 4, 0)).toBe(1);
  });

  it('zero emission yields empty plume', () => {
    expect(plumeEnvelope([0, 0, 1], dir, coneCosFromHalfAngleDeg(25), 4, 0)).toBe(0);
  });

  it('peaks along nozzle axis near the source', () => {
    const cos = coneCosFromHalfAngleDeg(25);
    const onAxis = plumeEnvelope([0, 0, 1], dir, cos, 4, 1);
    const offAxis = plumeEnvelope([2, 0, 1], dir, cos, 4, 1);
    const behind = plumeEnvelope([0, 0, -1], dir, cos, 4, 1);
    expect(onAxis).toBeGreaterThan(0.5);
    expect(offAxis).toBeLessThan(onAxis);
    expect(behind).toBe(0);
  });

  it('scales with emissionRate', () => {
    const cos = coneCosFromHalfAngleDeg(30);
    const a = plumeEnvelope([0, 0, 1.5], dir, cos, 5, 1);
    const b = plumeEnvelope([0, 0, 1.5], dir, cos, 5, 2);
    expect(b / a).toBeCloseTo(2, 5);
  });

  it('falls off near plumeLength', () => {
    const cos = coneCosFromHalfAngleDeg(40);
    const near = plumeEnvelope([0, 0, 1], dir, cos, 4, 1);
    const far = plumeEnvelope([0, 0, 3.9], dir, cos, 4, 1);
    expect(near).toBeGreaterThan(far);
    expect(far).toBeLessThan(0.35);
  });
});
