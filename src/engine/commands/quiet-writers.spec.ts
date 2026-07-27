import { describe, expect, it } from 'vitest';
import {
  writeFluidVolume,
  writeFogVolume,
  writeLightEmitter,
  writeMediaVolume,
  writeSmokeEmitter,
  writeSurfaceMaterial,
} from './light-media-commands';
import { writeName, writeTransform, writeViewportHidden } from './transform-commands';
import { defaultFogVolume } from '../ecs/components/fog';
import { defaultLightEmitter } from '../ecs/components/light';
import { defaultMediaVolume } from '../ecs/components/media';
import { defaultSmokeEmitter } from '../ecs/components/smoke';
import { defaultSurfaceMaterial } from '../physics/optics/surface-material';
import { createDemoWorld } from '../scene/demo-world';
import { applyHierarchyReorder } from '../hierarchy/ops';

describe('quiet component writers (no structural epoch)', () => {
  it('light / smoke / surface / name / visibility stay quiet', () => {
    const world = createDemoWorld();
    const laser = 'laser_1';
    const ground = [...world.query('EnvironmentPiece')].find((id) =>
      world.get(id, 'EnvironmentPiece')?.kind === 'ground',
    )!;
    const epoch = world.resources.epoch;

    writeLightEmitter(world, laser, {
      ...defaultLightEmitter(),
      powerW: 2,
    });
    writeSmokeEmitter(world, laser, defaultSmokeEmitter());
    writeName(world, laser, 'Quiet laser');
    writeViewportHidden(world, laser, true);
    writeSurfaceMaterial(world, ground, {
      ...defaultSurfaceMaterial(),
      albedo: 0.4,
    });

    expect(world.resources.epoch).toBe(epoch);
    expect(world.get(laser, 'LightEmitter')!.powerW).toBe(2);
    expect(world.get(laser, 'Name')!.value).toBe('Quiet laser');
    expect(world.get(laser, 'ViewportHidden')!.hidden).toBe(true);
    expect(world.get(ground, 'SurfaceMaterial')!.albedo).toBe(0.4);
  });

  it('media/fog/fluid bump only when halfExtents change', () => {
    const world = createDemoWorld();
    const mediaId = [...world.query('MediaVolume')][0]!;
    const fogId = 'fog_smoke_1';
    const fluidId = 'aquarium_1';
    let epoch = world.resources.epoch;

    const media = world.get(mediaId, 'MediaVolume')!;
    writeMediaVolume(world, mediaId, { ...media, density: media.density + 0.1 });
    expect(world.resources.epoch).toBe(epoch);

    writeMediaVolume(world, mediaId, {
      ...media,
      halfExtents: [media.halfExtents[0] + 0.5, media.halfExtents[1], media.halfExtents[2]],
    });
    expect(world.resources.epoch).toBeGreaterThan(epoch);
    epoch = world.resources.epoch;

    const fog = world.get(fogId, 'FogVolume')!;
    writeFogVolume(world, fogId, {
      ...defaultFogVolume(),
      halfExtents: [...fog.halfExtents] as typeof fog.halfExtents,
    });
    expect(world.resources.epoch).toBe(epoch);

    writeFogVolume(world, fogId, {
      ...fog,
      halfExtents: [fog.halfExtents[0] + 0.25, fog.halfExtents[1], fog.halfExtents[2]],
    });
    expect(world.resources.epoch).toBeGreaterThan(epoch);
    epoch = world.resources.epoch;

    const fluid = world.get(fluidId, 'FluidVolume')!;
    writeFluidVolume(world, fluidId, {
      ...fluid,
      opticalDensity: fluid.opticalDensity + 0.05,
    });
    expect(world.resources.epoch).toBe(epoch);

    writeFluidVolume(world, fluidId, {
      ...fluid,
      halfExtents: [fluid.halfExtents[0] + 0.25, fluid.halfExtents[1], fluid.halfExtents[2]],
    });
    expect(world.resources.epoch).toBeGreaterThan(epoch);
  });

  it('fluid wallMode change bumps structural epoch', () => {
    const world = createDemoWorld();
    const fluidId = 'aquarium_1';
    const fluid = world.get(fluidId, 'FluidVolume')!;
    const epoch = world.resources.epoch;
    writeFluidVolume(world, fluidId, { ...fluid, wallMode: 'solid' });
    expect(world.resources.epoch).toBeGreaterThan(epoch);
  });

  it('transform write and hierarchy reorder stay quiet', () => {
    const world = createDemoWorld();
    const laser = 'laser_1';
    const fog = 'fog_smoke_1';
    const t = world.get(laser, 'Transform')!;
    const epoch = world.resources.epoch;

    writeTransform(world, laser, {
      ...t,
      position: [t.position[0] + 0.1, t.position[1], t.position[2]],
    });
    expect(world.resources.epoch).toBe(epoch);

    applyHierarchyReorder(world, fog, null, 0);
    expect(world.resources.epoch).toBe(epoch);
  });
});
