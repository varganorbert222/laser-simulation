/**
 * Animal observer sub-registry — main registry delegates `animal:*` here.
 */
import {
  createAnimalObserver,
  DOG_OBSERVER,
  type AnimalObserver,
  type RegisterAnimalObserverOptions,
} from './animal-observer';
import type { ObserverId, ObserverLayer } from '../types';

const ANIMALS = new Map<string, AnimalObserver>([[DOG_OBSERVER.species.id, DOG_OBSERVER]]);

/** Register a new animal perceptor (e.g. cat when cited curves land). */
export function registerAnimalObserver(opts: RegisterAnimalObserverOptions): AnimalObserver {
  const observer = createAnimalObserver(opts);
  ANIMALS.set(observer.species.id, observer);
  return observer;
}

export function listAnimalObservers(): readonly AnimalObserver[] {
  return [...ANIMALS.values()];
}

export function getAnimalObserver(speciesId: string): AnimalObserver | null {
  return ANIMALS.get(speciesId) ?? null;
}

export function resolveAnimalObserver(id: ObserverId): ObserverLayer | null {
  if (typeof id !== 'string' || !id.startsWith('animal:')) return null;
  return getAnimalObserver(id.slice('animal:'.length));
}

export { DOG_OBSERVER, createAnimalObserver };
export type { AnimalObserver, RegisterAnimalObserverOptions };
export type { SpeciesProfile } from './species-profile';
export { DOG_SPECIES } from './species-profile';
