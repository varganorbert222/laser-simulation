import { Schedule } from '../ecs/schedule';
import { gatherRenderPackSystem } from '../ecs/systems/gather-render-pack';
import { worldTransformSystem } from '../ecs/systems/world-transform';
import type { World } from '../ecs/world';
import { atmosphereAdvanceTime } from '../physics/optics/atmosphere-settings';
import { syncPrimarySunFromAtmosphere } from '../physics/optics/atmosphere-scene-sun';
import { gatherRenderPack } from '../render/pack';
import type { FramePresenter } from './frame-presenter';

/**
 * Default sim schedule.
 * - worldTransform: hierarchical TRS → WorldXform
 * - gather: GPU RenderFrame pack cache (requires syncViewCamera first)
 * - present: intentionally NOT scheduled — StudioRuntime calls presenter.sync/render
 *   after schedule.run (adapter-owned presentation).
 * - input / adapt / render: extension points (empty by default)
 */
export function createDefaultSchedule(): Schedule {
  const schedule = new Schedule();
  schedule.add('worldTransform', (world) => {
    worldTransformSystem(world);
  });
  schedule.add('gather', (world) => {
    gatherRenderPackSystem(world);
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

  /**
   * Advance ECS schedule, then sync + render via presenter (present outside schedule).
   *
   * Order matters for volumetric/camera sync:
   * 1. syncViewCamera — camera.update() + pose → ECS before gather
   * 2. schedule (worldTransform + gather) — cam-relative pack matches this frame
   * 3. presenter.sync / render — depth + fluid + volumetric + scene.render(false)
   *    (no second camera.update, so volumes stay locked to the packed pose)
   */
  tick(dt: number): void {
    const atmo = this.world.resources.Atmosphere;
    if (atmo?.enabled && atmo.timeAnimating) {
      // Do not bump epoch — mesh sync treats bump as a full rebuild.
      this.world.resources.Atmosphere = atmosphereAdvanceTime(atmo, dt);
    }
    if (this.world.resources.Atmosphere?.enabled) {
      const created = syncPrimarySunFromAtmosphere(this.world);
      if (created) this.world.bump();
    }
    const presenter = this.presenter;
    presenter?.syncViewCamera?.(this.world);
    this.schedule.run(this.world, dt);
    if (!presenter) return;
    presenter.sync(this.world);
    presenter.render();
  }

  /** Gather pack without presenting (tests / tooling). Uses cache if gather already ran. */
  gatherPack() {
    return this.world.resources.RenderFrame ?? gatherRenderPack(this.world);
  }

  resize(): void {
    this.presenter?.resize();
  }

  dispose(): void {
    this.presenter?.dispose();
    this.presenter = null;
  }
}
