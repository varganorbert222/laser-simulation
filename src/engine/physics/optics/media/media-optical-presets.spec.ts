import { describe, expect, it } from 'vitest';
import {
  MEDIA_OPTICS_CLOUD,
  MEDIA_OPTICS_DUST,
  MEDIA_OPTICS_FOG,
  MEDIA_OPTICS_SMOKE,
  defaultMediaVolumeForKind,
  mediaOpticalDefaults,
  opticalFieldsForMediaKind,
  opticalFieldsForScatterModel,
  scatterModelForMediaKind,
} from './media-optical-presets';
import { defaultMieAnisotropy, defaultParticleSizeNm } from './scatter-model';
import { normalizeMediaVolume } from '../../../ecs/components';

describe('media optical presets (physical)', () => {
  it('uses m⁻¹-scale coefficients (not theatrical 0–1 knobs)', () => {
    expect(MEDIA_OPTICS_FOG.scatter).toBeLessThan(0.1);
    expect(MEDIA_OPTICS_FOG.scatter).toBeGreaterThan(0.005);
    expect(mediaOpticalDefaults('clearNight').scatter).toBeLessThan(0.001);
    expect(mediaOpticalDefaults('clearNight').scatter).toBeGreaterThan(1e-6);
  });

  it('fog is almost purely scattering; smoke absorbs more', () => {
    const fogW =
      MEDIA_OPTICS_FOG.scatter / (MEDIA_OPTICS_FOG.scatter + MEDIA_OPTICS_FOG.absorption);
    const smokeW =
      MEDIA_OPTICS_SMOKE.scatter /
      (MEDIA_OPTICS_SMOKE.scatter + MEDIA_OPTICS_SMOKE.absorption);
    expect(fogW).toBeGreaterThan(0.95);
    expect(smokeW).toBeLessThan(0.8);
    expect(smokeW).toBeGreaterThan(0.5);
  });

  it('clearNight is Rayleigh-labelled; fog/smoke/dust are Tyndall/Mie', () => {
    expect(mediaOpticalDefaults('clearNight').scatterModel).toBe('rayleigh');
    expect(mediaOpticalDefaults('clearNight').layer).toBe('outdoor');
    expect(mediaOpticalDefaults('clearNight').scatterMie).toBeGreaterThan(0);
    expect(MEDIA_OPTICS_FOG.scatterModel).toBe('tyndall');
    expect(MEDIA_OPTICS_FOG.layer).toBe('particulate');
    expect(MEDIA_OPTICS_SMOKE.scatterModel).toBe('tyndall');
    expect(MEDIA_OPTICS_DUST.scatterModel).toBe('tyndall');
  });

  it('aligns scatter-model helpers with media presets', () => {
    expect(defaultParticleSizeNm('rayleigh')).toBe(0.3);
    expect(defaultParticleSizeNm('tyndall')).toBe(MEDIA_OPTICS_FOG.particleSizeNm);
    expect(mediaOpticalDefaults('clearNight').particleSizeNm).toBeGreaterThan(10);
    expect(MEDIA_OPTICS_FOG.mieAnisotropy).toBeCloseTo(
      defaultMieAnisotropy('tyndall', MEDIA_OPTICS_FOG.particleSizeNm),
      5,
    );
    // Smoke/cloud override toward stronger forward Mie (cloud-like).
    expect(MEDIA_OPTICS_SMOKE.mieAnisotropy).toBe(0.65);
    expect(MEDIA_OPTICS_CLOUD.mieAnisotropy).toBe(0.78);
  });

  it('scatter-model UI stays on particulate (does not jump to climate)', () => {
    const ray = opticalFieldsForScatterModel('rayleigh', 'fog');
    expect(ray.kind).toBe('fog');
    expect(ray.layer).toBe('particulate');
    expect(ray.scatterModel).toBe('rayleigh');
    expect(ray.scatter).toBe(mediaOpticalDefaults('clearNight').scatter);

    const back = opticalFieldsForScatterModel('tyndall', 'fog');
    expect(back.kind).toBe('fog');
    expect(back.scatterModel).toBe('tyndall');
    expect(back.scatter).toBe(MEDIA_OPTICS_FOG.scatter);

    const keepSmoke = opticalFieldsForScatterModel('tyndall', 'smoke');
    expect(keepSmoke.kind).toBe('smoke');
    expect(keepSmoke.scatter).toBe(MEDIA_OPTICS_SMOKE.scatter);

    const fromAtm = opticalFieldsForScatterModel('tyndall', 'atmosphere');
    expect(fromAtm.kind).toBe('fog');
    expect(fromAtm.scatterModel).toBe('tyndall');
  });

  it('scatterModelForMediaKind matches presets', () => {
    expect(scatterModelForMediaKind('atmosphere')).toBe('rayleigh');
    expect(scatterModelForMediaKind('clearNight')).toBe('rayleigh');
    expect(scatterModelForMediaKind('fog')).toBe('tyndall');
  });

  it('switching kind replaces optical fields', () => {
    const smoke = opticalFieldsForMediaKind('smoke');
    expect(smoke.kind).toBe('smoke');
    expect(smoke.layer).toBe('particulate');
    expect(smoke.scatter).toBe(MEDIA_OPTICS_SMOKE.scatter);
    expect(smoke.absorption).toBe(MEDIA_OPTICS_SMOKE.absorption);
    expect(smoke.mieAnisotropy).toBeGreaterThanOrEqual(0.6);
  });

  it('cloud preset is particulate at sky scale', () => {
    const cloud = defaultMediaVolumeForKind('cloud');
    expect(cloud.layer).toBe('particulate');
    expect(cloud.mieAnisotropy).toBeGreaterThanOrEqual(0.7);
    expect(cloud.halfExtents[0]).toBeGreaterThan(10);
    expect(cloud.fbmScale).toBeLessThan(0.2);
  });

  it('default volumes match kind presets', () => {
    const fog = defaultMediaVolumeForKind('fog');
    expect(fog.scatter).toBe(mediaOpticalDefaults('fog').scatter);
    const atm = defaultMediaVolumeForKind('atmosphere');
    expect(atm.preset).toBe('clearNight');
    expect(atm.scatterModel).toBe('rayleigh');
    expect(atm.density).toBe(1);
  });

  it('normalizeMediaVolume migrates legacy kinds and preserves particulate Rayleigh override', () => {
    const desynced = normalizeMediaVolume({
      kind: 'fog',
      scatterModel: 'rayleigh',
      particleSizeNm: 0.3,
      mieAnisotropy: 0,
    });
    expect(desynced.kind).toBe('fog');
    expect(desynced.layer).toBe('particulate');
    expect(desynced.scatterModel).toBe('rayleigh');

    const fromModelOnly = normalizeMediaVolume({ scatterModel: 'rayleigh' });
    expect(fromModelOnly.kind).toBe('clearNight');
    expect(fromModelOnly.scatterModel).toBe('rayleigh');
    expect(fromModelOnly.scatterMie).toBeGreaterThan(0);

    const fromKindOnly = normalizeMediaVolume({ kind: 'atmosphere' });
    expect(fromKindOnly.kind).toBe('clearNight');
    expect(fromKindOnly.preset).toBe('clearNight');
    expect(fromKindOnly.layer).toBe('outdoor');
    expect(fromKindOnly.scatterModel).toBe('rayleigh');
    expect(fromKindOnly.scatterMie).toBeGreaterThan(0);

    const summer = normalizeMediaVolume({ kind: 'summer' });
    expect(summer.kind).toBe('summerHumid');
    expect(summer.layer).toBe('outdoor');
  });
});
