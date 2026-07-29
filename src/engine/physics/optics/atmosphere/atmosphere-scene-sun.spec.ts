import { describe, expect, it } from 'vitest';
import { World } from '../../../ecs/world';
import { createSceneEntity } from '../../../hierarchy/entity-factory';
import { lightWorldPose, worldTransformSystem } from '../../../ecs/systems/world-transform';
import { normalize } from '../../../math/vec3';
import {
  normalizeAtmosphereSettings,
  resolveAtmosphereSolarPosition,
} from './atmosphere-settings';
import {
  syncPrimarySunFromAtmosphere,
} from './atmosphere-scene-sun';
import { refreshSceneSunBinding } from '../scene/scene-sun';

describe('atmosphere-scene-sun', () => {
  it('creates a primary sun when atmosphere is enabled and none exists', () => {
    const world = new World();
    createSceneEntity(world, { name: 'Scene', isSceneRoot: true, locked: true });
    world.resources.Atmosphere = normalizeAtmosphereSettings({ enabled: true });
    expect(world.resources.SceneSun.primaryId).toBeNull();

    const created = syncPrimarySunFromAtmosphere(world);
    expect(created).toBe(true);
    refreshSceneSunBinding(world);
    expect(world.resources.SceneSun.primaryId).toBeTruthy();
    const em = world.get(world.resources.SceneSun.primaryId!, 'LightEmitter');
    expect(em?.params.mode).toBe('sun');
    expect(em?.enabled).toBe(true);
  });

  it('aims the sun light direction at SPA lightDirWorld and copies angular size', () => {
    const world = new World();
    createSceneEntity(world, { name: 'Scene', isSceneRoot: true, locked: true });
    world.resources.Atmosphere = normalizeAtmosphereSettings({
      enabled: true,
      hour: 12,
      minute: 0,
      month: 6,
      day: 21,
      latitudeDeg: 47.5,
      longitudeDeg: 19,
      timezoneOffsetHours: 2,
      sunAngularDiameterDeg: 1.25,
    });
    syncPrimarySunFromAtmosphere(world);
    worldTransformSystem(world);

    const id = world.resources.SceneSun.primaryId!;
    const pose = lightWorldPose(world, id);
    const spa = resolveAtmosphereSolarPosition(world.resources.Atmosphere);
    const want = normalize(spa.lightDirWorld);
    expect(pose.direction[0]).toBeCloseTo(want[0], 5);
    expect(pose.direction[1]).toBeCloseTo(want[1], 5);
    expect(pose.direction[2]).toBeCloseTo(want[2], 5);

    const em = world.get(id, 'LightEmitter')!;
    expect(em.params.mode).toBe('sun');
    if (em.params.mode === 'sun') {
      expect(em.params.sun.angularDiameterDeg).toBeCloseTo(1.25, 5);
    }
    expect(em.useColorTemperature).toBe(false);
  });

  it('does nothing when atmosphere is disabled', () => {
    const world = new World();
    createSceneEntity(world, { name: 'Scene', isSceneRoot: true, locked: true });
    world.resources.Atmosphere = normalizeAtmosphereSettings({ enabled: false });
    expect(syncPrimarySunFromAtmosphere(world)).toBe(false);
    expect(world.resources.SceneSun.primaryId).toBeNull();
  });

  it('reuses an existing sun instead of creating another', () => {
    const world = new World();
    createSceneEntity(world, { name: 'Scene', isSceneRoot: true, locked: true });
    world.resources.Atmosphere = normalizeAtmosphereSettings({ enabled: true });
    expect(syncPrimarySunFromAtmosphere(world)).toBe(true);
    const first = world.resources.SceneSun.primaryId;
    expect(syncPrimarySunFromAtmosphere(world)).toBe(false);
    expect(world.resources.SceneSun.primaryId).toBe(first);
  });
});
