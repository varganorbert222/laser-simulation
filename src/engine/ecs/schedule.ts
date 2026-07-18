import type { World } from './world';

export type SchedulePhase =
  | 'input'
  | 'worldTransform'
  | 'adapt'
  | 'gather'
  | 'render'
  | 'present';

export type SystemFn = (world: World, dt: number) => void;

export class Schedule {
  private readonly phases: Record<SchedulePhase, SystemFn[]> = {
    input: [],
    worldTransform: [],
    adapt: [],
    gather: [],
    render: [],
    present: [],
  };

  add(phase: SchedulePhase, system: SystemFn): void {
    this.phases[phase].push(system);
  }

  run(world: World, dt: number): void {
    world.resources.Time.deltaS = dt;
    world.resources.Time.elapsedS += dt;

    const order: SchedulePhase[] = [
      'input',
      'worldTransform',
      'adapt',
      'gather',
      'render',
      'present',
    ];
    for (const phase of order) {
      for (const system of this.phases[phase]) {
        system(world, dt);
      }
    }
  }
}
