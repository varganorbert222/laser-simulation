/**
 * Perception / observer module — physical RadianceBuffer → Observer → PerceptualBuffer.
 *
 * Extensibility entry points: `defineObserver`, `defineCameraObserver`,
 * `registerObserver`, `registerAnimalObserverAndPublish`.
 */
export * from './types';
export * from './define-observer';
export * from './spectral-curve';
export * from './v-lambda';
export * from './cmf';
export * from './lms';
export * from './adaptation';
export * from './registry';
export * from './gpu-uniforms';
export * from './human-eye';
export * from './colour-blindness';
export * from './digital-camera';
export * from './thermal-camera';
export * from './infrared-camera';
export {
  listAnimalObservers,
  resolveAnimalObserver,
  registerAnimalObserver,
  DOG_OBSERVER,
  DOG_SPECIES,
  createAnimalObserver,
  type AnimalObserver,
  type SpeciesProfile,
  type RegisterAnimalObserverOptions,
} from './animal/animal-observer-registry';
export {
  dichromatDogRgb,
  radianceToSpeciesMonitorRgb,
  registerSpeciesRgbMapper,
} from './animal/species-spectral-curves';
export {
  DOG_CONE_PEAKS,
  dogConeSensitivities,
} from './animal/data/dog-cone-peaks';
export {
  createConeFatigueState,
  updateConeFatigue,
  afterimageRgbFromFatigue,
  opponentFromLms,
  type ConeFatigueState,
  type ConeExcitation,
} from './human-eye/cone-fatigue';
