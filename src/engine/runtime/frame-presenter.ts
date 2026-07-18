import type { World } from '../ecs/world';
import type { GatheredFrame } from '../render/pack';

/** Framework-free camera pose for UI overlays (no Babylon types). */
export interface CameraPose {
  position: readonly [number, number, number];
  target: readonly [number, number, number];
  fovYDeg: number;
}

/**
 * View/adapter contract — engine owns the tick; presenter only syncs & draws.
 */
export interface FramePresenter {
  setWorld(world: World): void;
  sync(world: World): void;
  render(): void;
  resize(): void;
  dispose(): void;
  /** Optional: last gathered GPU pack after sync (tests / debug). */
  lastPack?: GatheredFrame | null;
  getCameraPose?(): CameraPose;
}
