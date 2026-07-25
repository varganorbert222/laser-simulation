/**
 * Keep the primary Scene Sun entity aligned with the procedural atmosphere SPA sun
 * when Atmosphere.enabled. Creates a Sun if the scene has none.
 */

import { defaultSunLightEmitter } from '../../ecs/components';
import type { World } from '../../ecs/world';
import { createSceneEntity } from '../../hierarchy/entity-factory';
import { fromDirection } from '../../math/quat';
import { length, normalize, scale, vec3 } from '../../math/vec3';
import { sunIrradianceRgb } from './atmosphere-model';
import {
  resolveAtmosphereSolarPosition,
  type AtmosphereSettings,
} from './atmosphere-settings';
import { resolveSceneAmbientLevel } from './environment-lighting';
import {
  isSunEmitter,
  refreshSceneSunBinding,
} from './scene-sun';

const SUN_SKY_DISTANCE_M = 12;

function findSceneRootId(world: World): string | null {
  for (const id of world.query('EditorFlags')) {
    if (world.get(id, 'EditorFlags')?.isSceneRoot) return id;
  }
  return null;
}

/**
 * Ensure a primary Sun LightEmitter exists. Returns the entity id and whether
 * a new entity was created (caller should bump epoch for UI).
 */
export function ensurePrimarySunEntity(world: World): {
  id: string;
  created: boolean;
} {
  refreshSceneSunBinding(world);
  const existing = world.resources.SceneSun.primaryId;
  if (existing) {
    const em = world.get(existing, 'LightEmitter');
    if (isSunEmitter(em)) {
      if (em && !em.enabled) {
        world.setQuiet(existing, 'LightEmitter', { ...em, enabled: true });
      }
      return { id: existing, created: false };
    }
  }

  const parentId = findSceneRootId(world);
  const id = createSceneEntity(world, {
    name: 'Nap',
    parentId,
  });
  world.set(id, 'Transform', {
    position: vec3(0, SUN_SKY_DISTANCE_M, 0),
    rotation: fromDirection([0, -1, 0]),
    scale: vec3(1, 1, 1),
  });
  world.add(id, 'LightEmitter', defaultSunLightEmitter());
  refreshSceneSunBinding(world);
  const primary = world.resources.SceneSun.primaryId ?? id;
  return { id: primary, created: true };
}

/**
 * When atmosphere sky is enabled: ensure a Sun exists and sync its transform,
 * chroma, intensity, and angular diameter from SPA + atmosphere look settings.
 *
 * @returns true if a new Sun entity was created (UI should refresh epoch).
 */
export function syncPrimarySunFromAtmosphere(world: World): boolean {
  const atmo = world.resources.Atmosphere;
  if (!atmo?.enabled) return false;

  const { id, created } = ensurePrimarySunEntity(world);
  applyAtmosphereToSunEntity(world, id, atmo);
  return created;
}

/** Write SPA sun direction / color / size onto an existing sun entity. */
export function applyAtmosphereToSunEntity(
  world: World,
  sunId: string,
  atmo: AtmosphereSettings,
): void {
  const spa = resolveAtmosphereSolarPosition(atmo);
  const lightDir = normalize([
    spa.lightDirWorld[0],
    spa.lightDirWorld[1],
    spa.lightDirWorld[2],
  ]);
  // Place the gizmo in the sky (toward the sun), aim light travel = lightDir.
  const towardSun = scale(lightDir, -1);
  const towardLen = length(towardSun) || 1;
  const position = vec3(
    (towardSun[0] / towardLen) * SUN_SKY_DISTANCE_M,
    (towardSun[1] / towardLen) * SUN_SKY_DISTANCE_M,
    (towardSun[2] / towardLen) * SUN_SKY_DISTANCE_M,
  );

  const prevT = world.get(sunId, 'Transform');
  // Quiet writes: world.set bumps epoch → SceneMeshSync rebuilds every frame (flicker).
  world.setQuiet(sunId, 'Transform', {
    position,
    rotation: fromDirection(lightDir),
    scale: prevT?.scale ?? vec3(1, 1, 1),
  });

  const em = world.get(sunId, 'LightEmitter');
  if (!em || !isSunEmitter(em)) return;

  const ambient = resolveSceneAmbientLevel(
    world.resources.EnvironmentLighting.ambientLevel,
    atmo,
  );
  const sunRgb = sunIrradianceRgb(atmo.model, lightDir, ambient);
  const energy = Math.max(sunRgb[0], sunRgb[1], sunRgb[2], 1e-6);
  const chroma: [number, number, number] = [
    Math.min(1, sunRgb[0] / energy),
    Math.min(1, sunRgb[1] / energy),
    Math.min(1, sunRgb[2] / energy),
  ];
  // Educational lumen scale from sky energy (keeps inspector intensity meaningful).
  const intensityLm = Math.min(200_000, Math.max(8_000, energy * 90_000));

  world.setQuiet(sunId, 'LightEmitter', {
    ...em,
    enabled: true,
    colorRgb: chroma,
    useColorTemperature: false,
    intensityLm,
    params: {
      mode: 'sun',
      sun: {
        angularDiameterDeg: atmo.sunAngularDiameterDeg,
      },
    },
  });
}
