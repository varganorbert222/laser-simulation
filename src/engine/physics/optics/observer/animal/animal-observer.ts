/**
 * AnimalObserver factory + dog builtin.
 * Further species: `registerAnimalObserver({ profile, ... })` from registry.
 */
import { defineObserver } from '../define-observer';
import type {
  ObserverContext,
  ObserverImplementationStatus,
  ObserverLayer,
  PerceptualBuffer,
  RadianceBuffer,
} from '../types';
import { DOG_SPECIES, type SpeciesProfile } from './species-profile';
import {
  radianceToSpeciesMonitorRgb,
  type SpeciesRgbMapper,
  registerSpeciesRgbMapper,
} from './species-spectral-curves';

export interface AnimalObserver extends ObserverLayer {
  readonly category: 'animal';
  readonly species: SpeciesProfile;
}

export interface RegisterAnimalObserverOptions {
  profile: SpeciesProfile;
  status?: ObserverImplementationStatus;
  selectable?: boolean;
  /** Optional custom RGB map (defaults to registered mapper / identity). */
  rgbMapper?: SpeciesRgbMapper;
  apply?: (radiance: RadianceBuffer, ctx: ObserverContext) => PerceptualBuffer;
}

export function createAnimalObserver(opts: RegisterAnimalObserverOptions): AnimalObserver {
  const { profile } = opts;
  if (opts.rgbMapper) {
    registerSpeciesRgbMapper(profile.id, opts.rgbMapper);
  }
  const id = `animal:${profile.id}` as const;
  const base = defineObserver({
    id,
    label: profile.id,
    labelKey: profile.nameKey,
    category: 'animal',
    status: opts.status ?? 'gpu-pending',
    selectable: opts.selectable !== false,
    approximationTag: profile.approximationTag,
    apply:
      opts.apply ??
      ((radiance, _ctx) => {
        void radianceToSpeciesMonitorRgb(
          profile,
          1,
          1,
          1,
          radiance.peakWavelengthNm,
        );
        return {
          encoding: 'linear-rgb-perceptual',
          observerId: id,
          approximationTag: profile.approximationTag,
        };
      }),
  });
  return { ...base, category: 'animal', species: profile };
}

/** Shipped animal: domestic dog (cited cone peaks). */
export const DOG_OBSERVER = createAnimalObserver({
  profile: DOG_SPECIES,
  status: 'ready',
});
