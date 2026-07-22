import { fromEulerYXZ } from '../math/quat';
import { vec3 } from '../math/vec3';
import { World } from '../ecs/world';
import { createQuality } from '../ecs/resources';
import { createSceneEntity } from '../hierarchy/entity-factory';
import { defaultLightEmitter, defaultSunLightEmitter } from '../ecs/components';
import { defaultMediaVolumeForKind } from '../optics/media-optical-presets';
import { defaultGroundSurfaceMaterial } from '../optics/surface-material';
import { refreshSceneSunBinding } from '../optics/scene-sun';

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
    ...defaultMediaVolumeForKind('fog'),
    halfExtents: vec3(6, 3, 6),
  });

  const sun = createSceneEntity(world, {
    id: 'sun_1',
    name: 'Sun',
    parentId: root,
  });
  world.set(sun, 'Transform', {
    position: vec3(0, 8, 0),
    // Aim roughly along educational env sun (−0.4, −1, −0.3).
    rotation: fromEulerYXZ(0.35, -0.55, 0),
    scale: vec3(1, 1, 1),
  });
  world.add(sun, 'LightEmitter', defaultSunLightEmitter());

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
      laser: {
        w0M: 0.01,
        m2: 1.45,
        probeDistanceM: 5,
        ellipticRatio: 1,
        waistOffsetM: 0,
        topHatMix: 0,
        sphericalAberration: 0,
        coma: 0,
        astigmatism: 0,
      },
    },
    spill: {
      strayPowerFraction: 0.18,
    },
  });

  refreshSceneSunBinding(world);

  world.resources.EditorSelection = { entityId: laser, entityIds: [laser] };
  const sel = world.get(laser, 'Selectable');
  if (sel) sel.selected = true;

  return world;
}
