import { describe, expect, it } from 'vitest';
import { buildScienceReadout, RELATIVE_BRIGHTNESS_REF_POINTER } from './science-readout';
import { relativeBeamBrightness, relativeDotBrightness } from '../display/laser-brightness';

describe('science readout relative brightness', () => {
  it('exposes Laser Beam and Dot relative ratios vs peak and 532 nm pointer', () => {
    const readout = buildScienceReadout({
      wavelengthNm: 650,
      powerW: 0.005,
      params: {
        mode: 'laser',
        laser: { w0M: 0.01, m2: 1, probeDistanceM: 5, ellipticRatio: 1, waistOffsetM: 0, topHatMix: 0, sphericalAberration: 0, coma: 0, astigmatism: 0 },
      },
      vision: { ambientLevel: 0.38 },
    });
    const ids = readout.quantities.map((q) => q.id);
    expect(ids).toContain('relDotPeak');
    expect(ids).toContain('relBeamPeak');
    expect(ids).toContain('relDotPointer');
    expect(ids).toContain('relBeamPointer');

    const self = { powerW: 0.005, wavelengthNm: 650 };
    const expectedDot = relativeDotBrightness(self, RELATIVE_BRIGHTNESS_REF_POINTER, 0.38);
    const expectedBeam = relativeBeamBrightness(self, RELATIVE_BRIGHTNESS_REF_POINTER, 0.38);
    const qDot = readout.quantities.find((q) => q.id === 'relDotPointer')!;
    const qBeam = readout.quantities.find((q) => q.id === 'relBeamPointer')!;
    expect(Number(qDot.value)).toBeCloseTo(expectedDot, 2);
    expect(Number(qBeam.value)).toBeCloseTo(expectedBeam, 2);
    // Equal power: red pointer-class is dimmer than green reference → ratio < 1
    expect(expectedDot).toBeLessThan(1);
    expect(expectedBeam).toBeLessThan(expectedDot); // longer λ scatters less
  });
});
