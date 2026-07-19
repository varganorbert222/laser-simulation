import { describe, expect, it } from 'vitest';
import {
  incidentClassFromBeamMode,
  incidentLightDirection,
} from './light-incident';

describe('incident light direction (Unity-like)', () => {
  it('classifies beam modes', () => {
    expect(incidentClassFromBeamMode(0)).toBe('point');
    expect(incidentClassFromBeamMode(1)).toBe('spot');
    expect(incidentClassFromBeamMode(2)).toBe('directional');
    expect(incidentClassFromBeamMode(3)).toBe('directional');
  });

  it('point / spot L points from surface to emitter', () => {
    const L = incidentLightDirection([1, 0, 0], [0, 0, 0], [0, 0, 1], 0);
    expect(L[0]).toBeCloseTo(-1);
    expect(L[1]).toBeCloseTo(0);
    expect(L[2]).toBeCloseTo(0);

    const spot = incidentLightDirection([0, 2, 0], [0, 0, 0], [0, 1, 0], 1);
    expect(spot[1]).toBeCloseTo(-1);
  });

  it('directional / laser L is −beamDir regardless of hit offset', () => {
    const onAxis = incidentLightDirection([0, 0, 5], [0, 0, 0], [0, 0, 1], 3);
    const offAxis = incidentLightDirection([0.2, 0, 5], [0, 0, 0], [0, 0, 1], 3);
    expect(onAxis[0]).toBeCloseTo(0);
    expect(onAxis[1]).toBeCloseTo(0);
    expect(onAxis[2]).toBeCloseTo(-1);
    expect(offAxis[0]).toBeCloseTo(0);
    expect(offAxis[1]).toBeCloseTo(0);
    expect(offAxis[2]).toBeCloseTo(-1);
  });

  it('parallel tube is directional', () => {
    const L = incidentLightDirection([1, 0, 0], [0, 0, 0], [1, 0, 0], 2);
    expect(L[0]).toBeCloseTo(-1);
  });
});
