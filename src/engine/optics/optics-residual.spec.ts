import { describe, expect, it } from 'vitest';
import { evalResidualDensity, RESIDUAL_LOBE_WEIGHTS } from './optics-residual';

describe('optics residual field', () => {
  it('lobe weights sum to ~1', () => {
    const s =
      RESIDUAL_LOBE_WEIGHTS.ghosts +
      RESIDUAL_LOBE_WEIGHTS.halo +
      RESIDUAL_LOBE_WEIGHTS.edge +
      RESIDUAL_LOBE_WEIGHTS.streak;
    expect(s).toBeCloseTo(1, 5);
  });

  it('is brightest near axis (ghosts+halo) vs far field', () => {
    const w = 0.01;
    const on = evalResidualDensity(0, 0, w, 1);
    const far = evalResidualDensity(0.08, 0, w, 1);
    expect(on).toBeGreaterThan(far);
    expect(on).toBeGreaterThan(0);
  });

  it('streak is anisotropic near the axis', () => {
    const w = 0.01;
    // Within ~0.5 w the flare streak still contributes along x.
    const alongX = evalResidualDensity(0.004, 0, w, 1);
    const alongY = evalResidualDensity(0, 0.004, w, 1);
    expect(alongX).toBeGreaterThan(alongY);
  });

  it('edge lobe peaks near ~w', () => {
    const w = 0.02;
    const nearAxis = evalResidualDensity(0, 0, w, 0.5);
    const atEdge = evalResidualDensity(w, 0, w, 0.5);
    const far = evalResidualDensity(w * 4, 0, w, 0.5);
    expect(atEdge).toBeGreaterThan(far);
    expect(nearAxis).toBeGreaterThan(0);
  });
});
