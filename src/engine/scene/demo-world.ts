import { fromEulerYXZ } from '../math/quat';
import { vec3 } from '../math/vec3';
import { World } from '../ecs/world';
import { createQuality } from '../ecs/resources';
import { createSceneEntity } from '../hierarchy/entity-factory';
import { defaultLightEmitter } from '../ecs/components';
import { defaultGroundSurfaceMaterial } from '../optics/surface-material';

export function createDemoWorld(): World {
  const world = new World({
    ActiveScene: { sceneId: 'room', label: 'Szoba labor' },
    Quality: createQuality('high'),
    PresentationMode: 'edit',
    EditorTooling: { gizmoMode: 'position' },
  });

  const root = createSceneEntity(world, {
    id: 'scene_root',
    name: 'Jelenet',
    parentId: null,
    locked: true,
    isSceneRoot: true,
  });

  const ground = createSceneEntity(world, {
    id: 'ground',
    name: 'Padló',
    parentId: root,
  });
  world.add(ground, 'EnvironmentPiece', { kind: 'ground' });
  world.add(ground, 'SurfaceMaterial', defaultGroundSurfaceMaterial());

  const fog = createSceneEntity(world, {
    id: 'fog_main',
    name: 'Köd térfogat',
    parentId: root,
  });
  world.set(fog, 'Transform', {
    position: vec3(0, 1.5, 0),
    rotation: fromEulerYXZ(0, 0, 0),
    scale: vec3(1, 1, 1),
  });
  world.add(fog, 'MediaVolume', {
    kind: 'fog',
    density: 0.85,
    color: [0.85, 0.92, 1],
    halfExtents: vec3(6, 3, 6),
    fbmScale: 0.45,
    fbmTimeScale: 0.15,
    noiseThresholdLow: 0.2,
    noiseThresholdHigh: 0.8,
    scatter: 0.9,
    absorption: 0.2,
    scatterModel: 'tyndall',
    particleSizeNm: 200,
    mieAnisotropy: 0.88,
  });

  const laser = createSceneEntity(world, {
    id: 'laser_1',
    name: 'Lézer',
    parentId: root,
  });
  world.set(laser, 'Transform', {
    position: vec3(-2.5, 1.2, -2.5),
    rotation: fromEulerYXZ(Math.PI / 4, 0, 0),
    scale: vec3(1, 1, 1),
  });
  world.add(laser, 'FixtureRef', { fixtureId: 'laser_pointer' });
  world.add(laser, 'LightEmitter', {
    ...defaultLightEmitter(),
    wavelengthNm: 532,
    powerW: 1,
    params: {
      mode: 'laser' as const,
      laser: { w0M: 0.01, parallelness: 0.85, probeDistanceM: 5 },
    },
    apertureCoupling: 0.4,
    spill: {
      strayLight: 0.22,
      internalReflection: 0.12,
      apertureSpill: 0.28,
    },
  });

  world.resources.EditorSelection = { entityId: laser, entityIds: [laser] };
  const sel = world.get(laser, 'Selectable');
  if (sel) sel.selected = true;

  return world;
}
