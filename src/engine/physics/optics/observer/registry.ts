/**
 * Observer registry — plugin map for perceptors.
 *
 * ## Add a new perceptor
 *
 * ```ts
 * import { defineObserver, registerObserver } from '@engine';
 * // or defineCameraObserver / registerAnimalObserver
 *
 * registerObserver(defineObserver({
 *   id: 'my-sensor',
 *   label: 'My sensor',
 *   labelKey: 'observerMySensor', // add hu+en i18n keys
 *   category: 'camera', // human | colour-blind | camera | animal | custom
 *   status: 'stub',
 *   approximationTag: 'approximated',
 * }));
 * ```
 *
 * Animal with cited curves:
 * `registerAnimalObserver({ profile, rgbMapper?, status? })` then
 * `registerObserver` is called for you if you use `registerAnimalObserverAndPublish`.
 *
 * Builtins ship: human-eye, colour-blind trio, digital/thermal/IR cameras, animal:dog.
 */
import { createHumanEyeObserver, type HumanEyeObserver } from './human-eye';
import {
  DEUTERANOPIA_OBSERVER,
  PROTANOPIA_OBSERVER,
  TRITANOPIA_OBSERVER,
} from './colour-blindness';
import { DIGITAL_CAMERA_OBSERVER } from './digital-camera';
import { THERMAL_CAMERA_OBSERVER } from './thermal-camera';
import { INFRARED_CAMERA_OBSERVER } from './infrared-camera';
import {
  listAnimalObservers,
  registerAnimalObserver,
  resolveAnimalObserver,
  type RegisterAnimalObserverOptions,
} from './animal/animal-observer-registry';
import type {
  ObserverCategory,
  ObserverId,
  ObserverLayer,
} from './types';
import {
  DEFAULT_CONE_FATIGUE,
  OBSERVER_CATEGORY_ORDER,
  type ConeFatigueSettings,
} from './types';

const HUMAN = createHumanEyeObserver();

/** Mutable plugin table — builtins registered at module load. */
const REGISTRY = new Map<string, ObserverLayer>();

export function registerObserver(observer: ObserverLayer): void {
  REGISTRY.set(observer.id, observer);
}

/** Register animal species and publish onto the main picker registry. */
export function registerAnimalObserverAndPublish(
  opts: RegisterAnimalObserverOptions,
): ObserverLayer {
  const animal = registerAnimalObserver(opts);
  registerObserver(animal);
  return animal;
}

function registerBuiltins(): void {
  const builtins: ObserverLayer[] = [
    HUMAN,
    PROTANOPIA_OBSERVER,
    DEUTERANOPIA_OBSERVER,
    TRITANOPIA_OBSERVER,
    DIGITAL_CAMERA_OBSERVER,
    THERMAL_CAMERA_OBSERVER,
    INFRARED_CAMERA_OBSERVER,
    ...listAnimalObservers(),
  ];
  for (const o of builtins) registerObserver(o);
}

registerBuiltins();

export interface ResolveObserverResult {
  observer: ObserverLayer;
  /** True when requested id was missing / stubbed to HumanEye for GPU safety. */
  usedFallback: boolean;
  requestedId: ObserverId;
}

export interface ListObserversOptions {
  /** Default true — Vision picker. */
  selectableOnly?: boolean;
  category?: ObserverCategory;
}

function sortObservers(list: ObserverLayer[]): ObserverLayer[] {
  const catRank = new Map(OBSERVER_CATEGORY_ORDER.map((c, i) => [c, i]));
  return [...list].sort((a, b) => {
    const ca = catRank.get(a.category) ?? 99;
    const cb = catRank.get(b.category) ?? 99;
    if (ca !== cb) return ca - cb;
    return a.id.localeCompare(b.id);
  });
}

export function listObservers(opts?: ListObserversOptions): readonly ObserverLayer[] {
  let list = [...REGISTRY.values()];
  if (opts?.selectableOnly !== false) {
    list = list.filter((o) => o.selectable);
  }
  if (opts?.category) {
    list = list.filter((o) => o.category === opts.category);
  }
  return sortObservers(list);
}

/** Grouped for UI `<optgroup>` rendering. */
export function listObserversByCategory(
  opts?: ListObserversOptions,
): ReadonlyArray<{ category: ObserverCategory; observers: readonly ObserverLayer[] }> {
  const list = listObservers(opts);
  const groups: { category: ObserverCategory; observers: ObserverLayer[] }[] = [];
  for (const cat of OBSERVER_CATEGORY_ORDER) {
    const observers = list.filter((o) => o.category === cat);
    if (observers.length) groups.push({ category: cat, observers });
  }
  return groups;
}

export function getObserver(id: ObserverId): ObserverLayer | null {
  const direct = REGISTRY.get(id);
  if (direct) return direct;
  if (typeof id === 'string' && id.startsWith('animal:')) {
    return resolveAnimalObserver(id);
  }
  return null;
}

/**
 * Resolve for ActiveObserver. Stubs stay selectable (science HUD / future GPU);
 * `fallbackForGpu` forces HumanEye when status is stub and caller needs a safe path.
 */
export function resolveObserver(
  id: ObserverId,
  opts?: { fallbackForGpu?: boolean },
): ResolveObserverResult {
  const found = getObserver(id);
  if (!found) {
    return { observer: HUMAN, usedFallback: true, requestedId: id };
  }
  if (opts?.fallbackForGpu && (found.status === 'stub' || found.status === 'fallback')) {
    return { observer: HUMAN, usedFallback: true, requestedId: id };
  }
  return { observer: found, usedFallback: false, requestedId: id };
}

export function isKnownObserverId(id: string): id is ObserverId {
  if (REGISTRY.has(id)) return true;
  if (id.startsWith('animal:')) return resolveAnimalObserver(id as ObserverId) != null;
  return false;
}

export function createConfiguredHumanEye(
  fatigue: ConeFatigueSettings = DEFAULT_CONE_FATIGUE,
): HumanEyeObserver {
  return createHumanEyeObserver(fatigue);
}

export const DEFAULT_OBSERVER_ID: ObserverId = 'human-eye';
