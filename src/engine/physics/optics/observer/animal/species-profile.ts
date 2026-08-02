/**
 * Species profile for AnimalObserver.
 * New species: define a profile + optional RGB map, then `registerAnimalObserver`.
 */
export type ConeTypeId = 'L' | 'M' | 'S' | 'UV' | 'IR-pit' | 'ML';

export interface SpeciesProfile {
  id: string;
  nameKey: string;
  coneTypes: readonly ConeTypeId[];
  supportsAfterimage: boolean;
  blurbKey: string;
  approximationTag: 'approximated';
  /** Optional citation blurb for science HUD. */
  citation?: string;
}

/** Domestic dog dichromat — Neitz / Jacobs peaks (see animal/data). */
export const DOG_SPECIES: SpeciesProfile = {
  id: 'dog',
  nameKey: 'observerAnimalDog',
  coneTypes: ['ML', 'S'],
  supportsAfterimage: true,
  blurbKey: 'hintObserverAnimalDog',
  approximationTag: 'approximated',
  citation: 'Neitz, Geist & Jacobs (1989): peaks ≈ 429 nm & 555 nm',
};
