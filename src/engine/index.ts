/* ── Math ─────────────────────────────────────────────────────────── */
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
  rotateVec,
  forward,
  clone as cloneQuat,
  type Quat,
} from './math/quat';
export {
  fromTRS,
  getTranslation,
  transformDirection,
  type Mat4,
} from './math/mat4';
export * from './math/euler';
export * from './math/clamp';
export * from './math/smoothstep';

/* ── Editor-facing helpers ────────────────────────────────────────── */
export {
  computeViewportAxisGizmoLines,
  hitTestViewportAxis,
  type ViewportAxisGizmoLine,
} from './editor/camera-axes';
export * from './editor/vec3-editable';

/* ── Physics / optics (simulation science) ────────────────────────── */
export * from './physics/optics/constants';
export * from './physics/optics/color';
export * from './physics/optics/wavelength';
export * from './physics/optics/scatter-model';
export * from './physics/optics/atmosphere-climate';
export * from './physics/optics/media-optical-presets';
export * from './physics/optics/smoke-plume';
export * from './physics/optics/volumetric-shadow';
export * from './physics/optics/optics-spill';
export * from './physics/optics/optics-residual';
export * from './physics/optics/surface-material';
export * from './physics/optics/beam-model';
export * from './physics/optics/surface-spot';
export * from './physics/optics/light-presentation';
export * from './physics/optics/laser-brightness';
export * from './physics/optics/scotopic-efficacy';
export * from './physics/optics/display-response-curve';
export * from './physics/optics/display-vision';
export * from './physics/optics/environment-lighting';
export * from './physics/optics/atmosphere-model';
export * from './physics/optics/atmosphere-settings';
export * from './physics/astro/solar-position';
export * from './physics/optics/power';
export * from './physics/optics/laser';
export * from './physics/optics/modes';
export * from './physics/optics/scene-sun';
export * from './physics/optics/atmosphere-scene-sun';
export * from './physics/optics/beam-optics';
export * from './physics/optics/microfacet-brdf';
export * from './physics/optics/light-incident';
export * from './physics/optics/light-appearance';
export * from './physics/optics/science-readout';

/* ── Noise ────────────────────────────────────────────────────────── */
export * from './noise/volume-noise';
export * from './noise/volume-noise-io';

/* ── Render contract + pack ───────────────────────────────────────── */
export * from './render/contract';
export * from './render/pack';
export * from './render/quality';

/* ── ECS ──────────────────────────────────────────────────────────── */
export * from './ecs/components';
export * from './ecs/resources';
export * from './ecs/world';
export * from './ecs/schedule';
export * from './ecs/systems/world-transform';
export * from './ecs/systems/gather-render-pack';

/* ── Selection / hierarchy / commands ─────────────────────────────── */
export * from './selection/aggregate';
export * from './hierarchy/tree';
export * from './hierarchy/ops';
export * from './hierarchy/entity-factory';
export * from './commands/stack';
export * from './commands/edit-history';
export * from './commands/handlers';

/* ── Save / scene / runtime / assets ──────────────────────────────── */
export {
  serializeWorld,
  deserializeWorld,
  restoreWorldFromSerialized,
  migrateSave,
} from './save/serialize';
export * from './scene/demo-world';
export * from './runtime/frame-presenter';
export * from './runtime/studio-runtime';
export * from './assets';
