import { describe, expect, it } from 'vitest';
import {
  atmospherePhaseHG,
  atmospherePhaseRayleigh,
  atmosphereTransmittance,
  createDefaultAtmosphereModel,
  sunIrradianceRgb,
  sunTransmittanceRgb,
} from './atmosphere-model';

describe('atmosphere-model', () => {
  const model = createDefaultAtmosphereModel();

  it('Rayleigh phase peaks at forward/back and is positive', () => {
    expect(atmospherePhaseRayleigh(0)).toBeGreaterThan(0);
    expect(atmospherePhaseRayleigh(1)).toBeGreaterThan(atmospherePhaseRayleigh(0));
  });

  it('transmittance decreases for longer paths (zenith vs horizon)', () => {
    const origin: [number, number, number] = [0, model.planetRadius + 1, 0];
    const Tz = atmosphereTransmittance(model, origin, [0, 1, 0], 48);
    const Th = atmosphereTransmittance(model, origin, [1, 0.02, 0], 48);
    // Horizon path longer → more extinction, especially blue
    expect(Th[2]).toBeLessThan(Tz[2]);
    expect(Tz[0]).toBeGreaterThan(0.5);
  });

  it('sun transmittance is reddish near horizon vs zenith', () => {
    const overhead: [number, number, number] = [0, -1, 0];
    const low: [number, number, number] = [0.98, -0.2, 0];
    const To = sunTransmittanceRgb(model, overhead);
    const Tl = sunTransmittanceRgb(model, low);
    const ratioZenith = To[0] / Math.max(To[2], 1e-6);
    const ratioLow = Tl[0] / Math.max(Tl[2], 1e-6);
    expect(ratioLow).toBeGreaterThan(ratioZenith);
  });

  it('sun irradiance dims below horizon', () => {
    const day = sunIrradianceRgb(model, [0, -1, 0], 1);
    const night = sunIrradianceRgb(model, [0, 1, 0], 1);
    expect(day[0] + day[1] + day[2]).toBeGreaterThan(night[0] + night[1] + night[2]);
  });
});
