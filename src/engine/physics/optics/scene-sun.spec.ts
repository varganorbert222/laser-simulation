import { describe, expect, it } from 'vitest';
import { defaultSunLightEmitter } from '../../ecs/components';
import { World } from '../../ecs/world';
import { createSceneEntity } from '../../hierarchy/entity-factory';
import {
  refreshSceneSunBinding,
  resolveSceneSunBinding,
  wouldSuppressAdditionalSun,
} from './scene-sun';

describe('scene sun binding', () => {
  it('discovers a single sun as primary', () => {
    const world = new World();
    const id = createSceneEntity(world, { name: 'Sun', parentId: null });
    world.add(id, 'LightEmitter', defaultSunLightEmitter());
    const binding = resolveSceneSunBinding(world);
    expect(binding.primaryId).toBe(id);
    expect(binding.suppressedIds).toEqual([]);
  });

  it('suppresses extra suns; first enabled wins', () => {
    const world = new World();
    const a = createSceneEntity(world, { name: 'Sun', parentId: null });
    const b = createSceneEntity(world, { name: 'Sun 2', parentId: null });
    world.add(a, 'LightEmitter', defaultSunLightEmitter());
    world.add(b, 'LightEmitter', defaultSunLightEmitter());
    const binding = refreshSceneSunBinding(world);
    expect(binding.primaryId).toBe(a);
    expect(binding.suppressedIds).toEqual([b]);
    expect(wouldSuppressAdditionalSun(world)).toBe(true);
    expect(wouldSuppressAdditionalSun(world, a)).toBe(false);
  });

  it('prefers enabled sun over earlier disabled sun', () => {
    const world = new World();
    const a = createSceneEntity(world, { name: 'Sun', parentId: null });
    const b = createSceneEntity(world, { name: 'Sun 2', parentId: null });
    world.add(a, 'LightEmitter', { ...defaultSunLightEmitter(), enabled: false });
    world.add(b, 'LightEmitter', defaultSunLightEmitter());
    const binding = resolveSceneSunBinding(world);
    expect(binding.primaryId).toBe(b);
    expect(binding.suppressedIds).toEqual([a]);
  });
});
