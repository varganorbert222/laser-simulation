import { fromEulerYXZ } from '../math/quat';
import { vec3 } from '../math/vec3';
import { World } from '../ecs/world';
import { createSceneEntity } from '../hierarchy/entity-factory';
import { defaultFogVolume, defaultFluidVolume, defaultLightEmitter, defaultSmokeEmitter, defaultSunLightEmitter } from '../ecs/components';
import { defaultMediaVolumeForKind } from '../physics/optics/media/media-optical-presets';
import {
  defaultGroundSurfaceMaterial,
  defaultSurfaceMaterial,
  surfaceMaterialFromPreset,
} from '../physics/optics/surface/surface-material';
import { refreshSceneSunBinding } from '../physics/optics/scene/scene-sun';
import { createQuality } from '../render/quality';

/** Minimal starter scene: scene root, floor, and one sun. */
export function createEmptyWorld(): World {
  const world = new World({
    ActiveScene: { sceneId: 'empty', label: 'Üres jelenet' },
    Quality: createQuality('high'),
    PresentationMode: 'edit',
    EditorTooling: { gizmoMode: 'position', gizmoSpace: 'world' },
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

  refreshSceneSunBinding(world);

  world.resources.EditorSelection = { entityId: sun, entityIds: [sun] };
  const sel = world.get(sun, 'Selectable');
  if (sel) sel.selected = true;

  return world;
}

export function createDemoWorld(): World {
  const world = createEmptyWorld();
  world.resources.ActiveScene = { sceneId: 'room', label: 'Szoba labor' };

  const root = 'scene_root';
  const sun = 'sun_1';
  const sunSel = world.get(sun, 'Selectable');
  if (sunSel) sunSel.selected = false;

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

  const fluidSmoke = createSceneEntity(world, {
    id: 'fog_smoke_1',
    name: 'Füstgép',
    parentId: root,
  });
  world.set(fluidSmoke, 'Transform', {
    position: vec3(2.2, 0.2, 1.5),
    rotation: fromEulerYXZ(-Math.PI / 2, 0, 0),
    scale: vec3(1, 1, 1),
  });
  world.add(fluidSmoke, 'FogVolume', {
    ...defaultFogVolume(),
    halfExtents: vec3(1.2, 2.2, 1.2),
    maxDensity: 1,
    boundaryMode: 'closed',
  });
  world.add(fluidSmoke, 'SmokeEmitter', defaultSmokeEmitter());

  const aquarium = createSceneEntity(world, {
    id: 'aquarium_1',
    name: 'Akvárium',
    parentId: root,
  });
  world.set(aquarium, 'Transform', {
    position: vec3(-2.0, 0.95, 1.8),
    rotation: fromEulerYXZ(0, 0, 0),
    scale: vec3(1, 1, 1),
  });
  world.add(aquarium, 'FluidVolume', {
    ...defaultFluidVolume(),
    halfExtents: vec3(1.1, 0.85, 0.7),
    fillFraction: 0.72,
    presetId: 'aquarium',
    wallMode: 'glass',
  });
  // Glass shell shares WorldXform with the fluid OBB (optics follow entity rotation).
  world.add(aquarium, 'EnvironmentPiece', { kind: 'prop' });
  world.add(aquarium, 'SurfaceMaterial', {
    ...surfaceMaterialFromPreset('glass_clear'),
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
