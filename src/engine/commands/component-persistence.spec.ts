import { describe, expect, it } from 'vitest';
import {
  EditHistory,
  applySelection,
  setFluidVolumeCommand,
  setMediaVolumeCommand,
  setSurfaceMaterialCommand,
  surfaceMaterialFromPreset,
  writeFluidVolume,
  writeMediaVolume,
  writeSurfaceMaterial,
} from '../index';
import { createDemoWorld } from '../scene/demo-world';
import { defaultFluidVolume } from '../ecs/components/fluid';

/**
 * Regression: discrete inspector writes must survive deselect / reselect.
 * These mirror the editor patch path (command + quiet writer + selection).
 */
describe('component value persistence across reselection', () => {
  it('keeps SurfaceMaterial finish after deselect/reselect', () => {
    const world = createDemoWorld();
    const history = new EditHistory();
    const ground = 'ground';
    const laser = 'laser_1';

    applySelection(world, ground);
    const before = world.get(ground, 'SurfaceMaterial')!;
    const after = surfaceMaterialFromPreset('matte_black');
    history.run(setSurfaceMaterialCommand(world, ground, before, after));

    expect(world.get(ground, 'SurfaceMaterial')!.preset).toBe('matte_black');
    expect(world.get(ground, 'SurfaceMaterial')!.albedo).toBe(0.06);

    applySelection(world, laser);
    applySelection(world, ground);

    expect(world.get(ground, 'SurfaceMaterial')!.preset).toBe('matte_black');
    expect(world.get(ground, 'SurfaceMaterial')!.albedo).toBe(0.06);
  });

  it('named finish snap does not keep prior albedo under new preset name', () => {
    const world = createDemoWorld();
    const ground = 'ground';
    writeSurfaceMaterial(world, ground, surfaceMaterialFromPreset('brushed_metal'));
    expect(world.get(ground, 'SurfaceMaterial')!.albedo).toBe(0.35);

    writeSurfaceMaterial(world, ground, surfaceMaterialFromPreset('matte_black'));
    const sm = world.get(ground, 'SurfaceMaterial')!;
    expect(sm.preset).toBe('matte_black');
    expect(sm.albedo).toBe(0.06);
  });

  it('keeps FluidVolume fillFraction after deselect/reselect', () => {
    const world = createDemoWorld();
    const history = new EditHistory();
    const fluid = 'aquarium_1';
    const ground = 'ground';

    applySelection(world, fluid);
    const before = world.get(fluid, 'FluidVolume')!;
    const after = {
      ...defaultFluidVolume(),
      halfExtents: [...before.halfExtents] as typeof before.halfExtents,
      enabled: before.enabled,
      fillFraction: 0.42,
    };
    history.run(setFluidVolumeCommand(world, fluid, before, after));
    expect(world.get(fluid, 'FluidVolume')!.fillFraction).toBeCloseTo(0.42);

    applySelection(world, ground);
    applySelection(world, fluid);
    expect(world.get(fluid, 'FluidVolume')!.fillFraction).toBeCloseTo(0.42);
  });

  it('keeps MediaVolume density after deselect/reselect', () => {
    const world = createDemoWorld();
    const history = new EditHistory();
    const mediaId = [...world.query('MediaVolume')][0]!;
    const ground = 'ground';

    applySelection(world, mediaId);
    const before = world.get(mediaId, 'MediaVolume')!;
    const after = { ...before, density: before.density + 0.42 };
    history.run(setMediaVolumeCommand(world, mediaId, before, after));
    expect(world.get(mediaId, 'MediaVolume')!.density).toBeCloseTo(before.density + 0.42);

    applySelection(world, ground);
    applySelection(world, mediaId);
    expect(world.get(mediaId, 'MediaVolume')!.density).toBeCloseTo(before.density + 0.42);
  });

  it('selection alone does not bump structural epoch (no mesh rebuild)', () => {
    const world = createDemoWorld();
    const epoch = world.resources.epoch;
    applySelection(world, 'ground');
    applySelection(world, 'laser_1');
    applySelection(world, 'ground');
    expect(world.resources.epoch).toBe(epoch);
  });

  it('surface / media / fluid quiet writes survive selection without epoch bump', () => {
    const world = createDemoWorld();
    const ground = 'ground';
    const mediaId = [...world.query('MediaVolume')][0]!;
    const fluid = 'aquarium_1';
    const epoch = world.resources.epoch;

    writeSurfaceMaterial(world, ground, surfaceMaterialFromPreset('chrome'));
    writeMediaVolume(world, mediaId, {
      ...world.get(mediaId, 'MediaVolume')!,
      density: 1.25,
    });
    writeFluidVolume(world, fluid, {
      ...world.get(fluid, 'FluidVolume')!,
      viscosity: 0.12,
    });

    applySelection(world, ground);
    applySelection(world, mediaId);
    applySelection(world, fluid);
    applySelection(world, ground);

    expect(world.resources.epoch).toBe(epoch);
    expect(world.get(ground, 'SurfaceMaterial')!.preset).toBe('chrome');
    expect(world.get(mediaId, 'MediaVolume')!.density).toBe(1.25);
    expect(world.get(fluid, 'FluidVolume')!.viscosity).toBe(0.12);
  });
});
