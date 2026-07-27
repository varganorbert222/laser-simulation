import { describe, expect, it } from 'vitest';
import { World } from './world';
import { worldTransformSystem } from './systems/world-transform';
import { identity as quatIdentity } from '../math/quat';
import { vec3 } from '../math/vec3';
import { getTranslation } from '../math/mat4';
import { serializeWorld, deserializeWorld } from '../save/serialize';
import { createDemoWorld } from '../scene/demo-world';
import { gatherRenderPack, MAX_GPU_LIGHTS, VOLUMETRIC_LIGHT_SLOTS } from '../index';
import { CommandStack } from '../commands/stack';
import { setLightEmitterCommand } from '../commands/handlers';
import { buildHierarchyTree } from '../hierarchy/tree';
import { duplicateEntitySubtree } from '../hierarchy/ops';
import { createSceneEntity } from '../hierarchy/entity-factory';
import { defaultLightEmitter } from './components';

describe('world transform', () => {
  it('composes parent and child transforms', () => {
    const world = new World();
    const parent = world.createEntity('p');
    const child = world.createEntity('c');
    world.add(parent, 'Transform', {
      position: vec3(2, 0, 0),
      rotation: quatIdentity(),
      scale: vec3(1, 1, 1),
    });
    world.add(parent, 'Parent', { entityId: null });
    world.add(child, 'Transform', {
      position: vec3(1, 0, 0),
      rotation: quatIdentity(),
      scale: vec3(1, 1, 1),
    });
    world.add(child, 'Parent', { entityId: parent });

    worldTransformSystem(world);
    const wx = world.get(child, 'WorldXform');
    expect(wx).toBeTruthy();
    expect(getTranslation(wx!.matrix)).toEqual([3, 0, 0]);
  });
});

describe('save/load', () => {
  it('round-trips demo world without WorldXform', () => {
    const world = createDemoWorld();
    worldTransformSystem(world);
    const json = serializeWorld(world);
    const parsed = JSON.parse(json);
    expect(parsed.schemaVersion).toBe(3);
    expect(parsed.resources.DisplayVision).toBeDefined();
    expect(parsed.resources.DisplayVision.responseCurve.points.length).toBeGreaterThanOrEqual(2);
    expect(parsed.resources.EnvironmentLighting.ambientLevel).toBeGreaterThan(0);
    expect(JSON.stringify(parsed)).not.toContain('WorldXform');

    const loaded = deserializeWorld(json);
    expect(loaded.query('LightEmitter')).toHaveLength(2);
    expect(loaded.get('laser_1', 'LightEmitter')?.wavelengthNm).toBe(532);
    expect(loaded.get('sun_1', 'LightEmitter')?.params.mode).toBe('sun');
    expect(loaded.resources.SceneSun.primaryId).toBe('sun_1');
  });
});

describe('render pack', () => {
  it('packs camera-relative laser light', () => {
    const world = createDemoWorld();
    worldTransformSystem(world);
    const pack = gatherRenderPack(world);
    expect(pack.lights).toHaveLength(1);
    expect(pack.media).toHaveLength(1);
    expect(pack.lights[0].mode).toBe(3);
    expect(pack.lensFlares.length).toBeGreaterThanOrEqual(1);
    expect(pack.lensFlares[0]!.intensity).toBeGreaterThan(0);
  });

  it('packs spotlight and omni into volumetric slots like lasers', () => {
    const world = createDemoWorld();
    const spot = createSceneEntity(world, { name: 'Spot', parentId: 'scene_root' });
    world.add(spot, 'LightEmitter', {
      ...defaultLightEmitter(),
      params: {
        mode: 'spotlight',
        spot: { innerConeDeg: 12, outerConeDeg: 28, apertureSharpness: 4 },
      },
    });
    const omni = createSceneEntity(world, { name: 'Omni', parentId: 'scene_root' });
    world.add(omni, 'LightEmitter', {
      ...defaultLightEmitter(),
      params: {
        mode: 'omni_lamp',
        omni: { softRadiusM: 1.5, falloff: 2 },
      },
    });
    worldTransformSystem(world);
    const pack = gatherRenderPack(world);
    const modes = pack.lights.map((l) => l.mode).sort();
    expect(modes).toContain(0); // omni
    expect(modes).toContain(1); // spotlight
    expect(modes).toContain(3); // laser
    expect(pack.lights.length).toBeGreaterThanOrEqual(3);
  });

  it('drives env sun from primary Sun entity and skips GpuLight slot', () => {
    const world = createDemoWorld();
    worldTransformSystem(world);
    const pack = gatherRenderPack(world);
    expect(world.resources.SceneSun.primaryId).toBe('sun_1');
    // Only the demo laser occupies a GpuLight slot (sun uses env path).
    expect(pack.lights).toHaveLength(1);
    expect(pack.lights[0]!.mode).toBe(3);
    expect(pack.env.sunRgb[0] + pack.env.sunRgb[1] + pack.env.sunRgb[2]).toBeGreaterThan(0);
  });

  it('packs flashlight and parallel into volumetric slots', () => {
    const world = createDemoWorld();
    const flash = createSceneEntity(world, { name: 'Flash', parentId: 'scene_root' });
    world.add(flash, 'LightEmitter', {
      ...defaultLightEmitter(),
      params: {
        mode: 'flashlight',
        spot: { innerConeDeg: 14, outerConeDeg: 42, apertureSharpness: 2 },
      },
    });
    const dir = createSceneEntity(world, { name: 'Dir', parentId: 'scene_root' });
    world.add(dir, 'LightEmitter', {
      ...defaultLightEmitter(),
      params: {
        mode: 'parallel',
        parallel: { beamRadiusM: 0.05, residualMrad: 2 },
      },
    });
    worldTransformSystem(world);
    const pack = gatherRenderPack(world);
    const modes = pack.lights.map((l) => l.mode);
    expect(modes).toContain(1); // flashlight cone
    expect(modes).toContain(2); // parallel tube
  });

  it('suppresses a second sun from the env key-light path', () => {
    const world = createDemoWorld();
    const extra = createSceneEntity(world, { name: 'Sun 2', parentId: 'scene_root' });
    world.add(extra, 'LightEmitter', {
      ...defaultLightEmitter(),
      params: { mode: 'sun', sun: { angularDiameterDeg: 0.53 } },
      powerW: 200,
    });
    worldTransformSystem(world);
    const pack = gatherRenderPack(world);
    expect(world.resources.SceneSun.primaryId).toBe('sun_1');
    expect(world.resources.SceneSun.suppressedIds).toContain(extra);
    expect(pack.lights).toHaveLength(1);
  });

  it('packs up to MAX_GPU_LIGHTS lasers for volumetric slots', () => {
    expect(VOLUMETRIC_LIGHT_SLOTS).toBe(MAX_GPU_LIGHTS);

    const world = createDemoWorld();
    for (let i = 0; i < 4; i++) {
      duplicateEntitySubtree(world, 'laser_1');
    }
    worldTransformSystem(world);
    const pack = gatherRenderPack(world);
    expect(pack.lights.length).toBe(MAX_GPU_LIGHTS);
  });
});

describe('hierarchy', () => {
  it('builds a tree under scene root', () => {
    const world = createDemoWorld();
    const tree = buildHierarchyTree(world);
    expect(tree).toHaveLength(1);
    expect(tree[0].id).toBe('scene_root');
    expect(tree[0].children.length).toBeGreaterThanOrEqual(3);
  });
});

describe('commands', () => {
  it('undoes light parameter changes', () => {
    const world = createDemoWorld();
    const stack = new CommandStack();
    const before = structuredClone(world.get('laser_1', 'LightEmitter')!);
    const after = structuredClone(before);
    after.wavelengthNm = 650;
    stack.run(setLightEmitterCommand(world, 'laser_1', before, after));
    expect(world.get('laser_1', 'LightEmitter')?.wavelengthNm).toBe(650);
    stack.undo();
    expect(world.get('laser_1', 'LightEmitter')?.wavelengthNm).toBe(532);
  });
});
