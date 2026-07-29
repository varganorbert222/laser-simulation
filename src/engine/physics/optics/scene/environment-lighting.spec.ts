import { describe, expect, it } from 'vitest';
import {
  createDefaultEnvironmentLighting,
  environmentVolumetricHemiRgb,
  environmentVolumetricSunRgb,
  normalizeEnvironmentLighting,
} from './environment-lighting';
import { World } from '../../ecs/world';
import { gatherRenderPack } from '../../render/pack';
import { defaultMediaVolume, defaultTransform } from '../../ecs/components';

describe('volumetric environment lighting', () => {
  it('brighter ambient increases hemi and sun volumetric RGB', () => {
    const dark = environmentVolumetricHemiRgb(0.1);
    const bright = environmentVolumetricHemiRgb(0.9);
    expect(bright[0] + bright[1] + bright[2]).toBeGreaterThan(
      dark[0] + dark[1] + dark[2],
    );
    const sunD = environmentVolumetricSunRgb(0.1);
    const sunB = environmentVolumetricSunRgb(0.9);
    expect(sunB[0]).toBeGreaterThan(sunD[0]);
  });

  it('preserves volumeMultiScatter on normalize', () => {
    const n = normalizeEnvironmentLighting({
      ambientLevel: 0.5,
      volumeMultiScatter: 0.7,
    });
    expect(n.volumeMultiScatter).toBeCloseTo(0.7);
    expect(createDefaultEnvironmentLighting().volumeMultiScatter).toBeGreaterThan(0);
  });

  it('packs env irradiance into the render frame', () => {
    const world = new World();
    world.resources.EnvironmentLighting = normalizeEnvironmentLighting({
      ambientLevel: 0.8,
      volumeMultiScatter: 0.5,
    });
    const id = world.createEntity();
    world.add(id, 'Name', { value: 'Fog' });
    world.add(id, 'Transform', defaultTransform());
    world.add(id, 'MediaVolume', defaultMediaVolume());
    const pack = gatherRenderPack(world);
    expect(pack.env.multiScatter).toBeCloseTo(0.5);
    expect(pack.env.hemiRgb[2]).toBeGreaterThan(0);
    expect(pack.env.sunRgb[0]).toBeGreaterThan(0);
  });
});
