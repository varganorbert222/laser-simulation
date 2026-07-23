import { gatherRenderPack } from '../../render/pack';
import type { World } from '../world';

/**
 * Build GPU frame DTOs into `world.resources.RenderFrame`.
 * Present stays outside the schedule (adapter sync/render after tick).
 */
export function gatherRenderPackSystem(world: World): void {
  world.resources.RenderFrame = gatherRenderPack(world);
  world.resources.Camera.dirty = false;
}
