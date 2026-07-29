/* â”€â”€ Math â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
export {
  vec3,
  add,
  sub,
  scale,
  dot,
  cross,
  length,
  equals,
  clone as cloneVec3,
  type Vec3,
} from './math/vec3';
export {
  identity as quatIdentity,
  fromEulerYXZ,
  forward,
  angularVelocity,
  invert as quatInvert,
  clone as cloneQuat,
  type Quat,
} from './math/quat';
export {
  fromTRS,
  getTranslation,
  getRotation,
  getBasis,
  transformDirection,
  type Mat4,
} from './math/mat4';
export * from './math/euler';
export * from './math/clamp';
export * from './math/smoothstep';

/* â”€â”€ Editor-facing helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
export {
  computeViewportAxisGizmoLines,
  hitTestViewportAxis,
  type ViewportAxisGizmoLine,
} from './editor/camera-axes';

/* â”€â”€ Physics / optics (simulation science) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
export * from './physics/optics/display/constants';
export * from './physics/optics/display/color';
export * from './physics/optics/display/wavelength';
export * from './physics/optics/media/scatter-model';
export * from './physics/optics/atmosphere/atmosphere-climate';
export * from './physics/optics/media/media-optical-presets';
export * from './physics/optics/media/smoke-plume';
export * from './physics/optics/media/volumetric-shadow';
export * from './physics/optics/beam/optics-spill';
export * from './physics/optics/beam/optics-residual';
export * from './physics/optics/surface/surface-material';
export * from './physics/optics/beam/beam-model';
export * from './physics/optics/surface/surface-spot';
export * from './physics/optics/surface/light-presentation';
export * from './physics/optics/display/laser-brightness';
export * from './physics/optics/display/scotopic-efficacy';
export * from './physics/optics/display/display-response-curve';
export * from './physics/optics/display/display-vision';
export * from './physics/optics/scene/environment-lighting';
export * from './physics/optics/scene/global-sun-volumetrics';
export * from './physics/optics/scene/ambient-from-solar';
export * from './physics/optics/display/auto-exposure';
export * from './physics/optics/atmosphere/atmosphere-model';
export * from './physics/optics/atmosphere/atmosphere-settings';
export * from './physics/astro/solar-position';
export * from './physics/optics/beam/power';
export * from './physics/optics/beam/laser';
export * from './physics/optics/beam/modes';
export * from './physics/optics/scene/scene-sun';
export * from './physics/optics/atmosphere/atmosphere-scene-sun';
export * from './physics/optics/beam/beam-optics';
export * from './physics/optics/surface/microfacet-brdf';
export * from './physics/optics/surface/light-incident';
export * from './physics/optics/surface/light-appearance';
export * from './physics/optics/scene/science-readout';
export * from './physics/fog/atlas';
export * from './physics/fluid/presets';
export * from './physics/fluid/water-presets';
export * from './physics/fluid/gravity-environment';
export * from './physics/fluid/wind-environment';
export * from './physics/fluid/sph-sim';
export * from './physics/fog/presets';

/* â”€â”€ Noise â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
export * from './noise/volume-noise';
export * from './noise/volume-noise-io';

/* â”€â”€ Render contract + pack â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
export * from './render/contract';
export * from './render/pack';
export * from './render/lens-flare';
export * from './render/quality';

/* â”€â”€ ECS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
export * from './ecs/components';
export * from './ecs/resources';
export * from './ecs/world';
export * from './ecs/schedule';
export * from './ecs/systems/world-transform';
export * from './ecs/systems/gather-render-pack';

/* â”€â”€ Selection / hierarchy / commands â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
export * from './selection/aggregate';
export * from './hierarchy/tree';
export * from './hierarchy/ops';
export * from './hierarchy/entity-factory';
export * from './commands/stack';
export * from './commands/edit-history';
export * from './commands/handlers';

/* â”€â”€ Save / scene / runtime / assets â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
export {
  serializeWorld,
  deserializeWorld,
  restoreWorldFromSerialized,
} from './save/serialize';
export * from './scene/demo-world';
export * from './runtime/frame-presenter';
export * from './runtime/studio-runtime';
export * from './assets';

