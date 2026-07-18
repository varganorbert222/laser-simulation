import { Schedule } from '../ecs/schedule';
import { worldTransformSystem } from '../ecs/systems/world-transform';
import type { World } from '../ecs/world';
import { gatherRenderPack } from '../render/pack';
import type { FramePresenter } from './frame-presenter';

export function createDefaultSchedule(): Schedule {
  const schedule = new Schedule();
  schedule.add('worldTransform', (world) => {
    worldTransformSystem(world);
  });
  schedule.add('gather', (world) => {
    // Pack is computed in presenter sync for GPU; mark camera clean after sim step.
    world.resources.Camera.dirty = false;
  });
  return schedule;
}

/**
 * Owns the simulation tick. Adapters implement FramePresenter and do not call systems.
 */
export class StudioRuntime {
  private readonly schedule: Schedule;
  private presenter: FramePresenter | null = null;

  constructor(
    private world: World,
    schedule?: Schedule,
  ) {
    this.schedule = schedule ?? createDefaultSchedule();
  }

  getWorld(): World {
    return this.world;
  }

  setWorld(world: World): void {
    this.world = world;
    this.presenter?.setWorld(world);
  }

  setPresenter(presenter: FramePresenter | null): void {
    this.presenter = presenter;
    if (presenter) presenter.setWorld(this.world);
  }

  getPresenter(): FramePresenter | null {
    return this.presenter;
  }

  /** Advance ECS, then sync + render via presenter. */
  tick(dt: number): void {
    this.schedule.run(this.world, dt);
    const presenter = this.presenter;
    if (!presenter) return;
    presenter.sync(this.world);
    presenter.render();
  }

  /** Gather pack without presenting (tests / tooling). */
  gatherPack() {
    return gatherRenderPack(this.world);
  }

  resize(): void {
    this.presenter?.resize();
  }

  dispose(): void {
    this.presenter?.dispose();
    this.presenter = null;
  }
}
