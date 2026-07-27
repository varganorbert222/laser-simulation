import { describe, expect, it } from 'vitest';
import {
  setTransformCommand,
  setTransformsCommand,
  writeTransform,
} from '../commands/transform-commands';
import { EditHistory } from '../commands/edit-history';
import { createDemoWorld } from '../scene/demo-world';

describe('transform commands', () => {
  it('writeTransform does not bump structural epoch', () => {
    const world = createDemoWorld();
    const id = 'laser_1';
    const before = world.get(id, 'Transform')!;
    const epoch = world.resources.epoch;
    writeTransform(world, id, {
      ...before,
      position: [before.position[0] + 1, before.position[1], before.position[2]],
    });
    expect(world.resources.epoch).toBe(epoch);
    expect(world.get(id, 'Transform')!.position[0]).toBe(before.position[0] + 1);
  });

  it('gizmo-style transform command does not rebuild via epoch', () => {
    const world = createDemoWorld();
    const id = 'laser_1';
    const history = new EditHistory();
    const before = structuredClone(world.get(id, 'Transform')!);
    const after = {
      ...before,
      position: [before.position[0] + 2, before.position[1], before.position[2]] as [
        number,
        number,
        number,
      ],
    };
    const epoch = world.resources.epoch;
    history.run(setTransformCommand(world, id, before, after));
    expect(world.resources.epoch).toBe(epoch);
    expect(world.get(id, 'Transform')!.position[0]).toBe(before.position[0] + 2);

    history.undo();
    expect(world.get(id, 'Transform')!.position[0]).toBe(before.position[0]);
    expect(world.resources.epoch).toBe(epoch);
  });

  it('multi transform command does not restore the whole world', () => {
    const world = createDemoWorld();
    const a = 'laser_1';
    const b = 'fog_smoke_1';
    const history = new EditHistory();
    const beforeA = structuredClone(world.get(a, 'Transform')!);
    const beforeB = structuredClone(world.get(b, 'Transform')!);
    const epoch = world.resources.epoch;
    const entityCount = world.allEntities().length;

    const cmd = setTransformsCommand(world, [
      {
        entityId: a,
        before: beforeA,
        after: {
          ...beforeA,
          position: [beforeA.position[0] + 1, beforeA.position[1], beforeA.position[2]],
        },
      },
      {
        entityId: b,
        before: beforeB,
        after: {
          ...beforeB,
          position: [beforeB.position[0] + 1, beforeB.position[1], beforeB.position[2]],
        },
      },
    ]);
    expect(cmd).not.toBeNull();
    history.run(cmd!);

    expect(world.resources.epoch).toBe(epoch);
    expect(world.allEntities().length).toBe(entityCount);
    expect(world.get(a, 'Transform')!.position[0]).toBe(beforeA.position[0] + 1);
    expect(world.get(b, 'Transform')!.position[0]).toBe(beforeB.position[0] + 1);
  });
});
