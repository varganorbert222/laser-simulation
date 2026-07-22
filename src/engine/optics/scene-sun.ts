/**
 * Scene Sun entity discovery — at most one primary sun is active for rendering.
 */

import type { LightEmitter } from '../ecs/components';
import type { World } from '../ecs/world';
import { isSunMode } from './modes';

export interface SceneSunBinding {
  /** First enabled sun entity (or first disabled if none enabled). */
  primaryId: string | null;
  /** Extra sun entities — kept in hierarchy but not rendered as the key sun. */
  suppressedIds: string[];
}

export function createDefaultSceneSunBinding(): SceneSunBinding {
  return { primaryId: null, suppressedIds: [] };
}

export function isSunEmitter(emitter: LightEmitter | null | undefined): boolean {
  return !!emitter && isSunMode(emitter.params.mode);
}

/** Scan world for sun emitters; first in query order wins as primary. */
export function resolveSceneSunBinding(world: World): SceneSunBinding {
  const ids: string[] = [];
  for (const id of world.query('LightEmitter')) {
    const em = world.get(id, 'LightEmitter');
    if (isSunEmitter(em)) ids.push(id);
  }
  if (!ids.length) return createDefaultSceneSunBinding();

  // Prefer first enabled sun as primary.
  let primaryId = ids.find((id) => world.get(id, 'LightEmitter')?.enabled) ?? ids[0]!;
  const suppressedIds = ids.filter((id) => id !== primaryId);
  return { primaryId, suppressedIds };
}

/** Refresh world.resources.SceneSun from current emitters. */
export function refreshSceneSunBinding(world: World): SceneSunBinding {
  const binding = resolveSceneSunBinding(world);
  world.resources.SceneSun = binding;
  return binding;
}

/** True when this entity is a sun that is not the primary key light. */
export function isSuppressedSunEntity(world: World, entityId: string): boolean {
  return world.resources.SceneSun.suppressedIds.includes(entityId);
}

/**
 * Whether adding/switching another sun would suppress it (primary already taken
 * by a different entity).
 */
export function wouldSuppressAdditionalSun(
  world: World,
  entityId?: string | null,
): boolean {
  const binding = resolveSceneSunBinding(world);
  if (!binding.primaryId) return false;
  if (entityId && binding.primaryId === entityId) return false;
  return true;
}
