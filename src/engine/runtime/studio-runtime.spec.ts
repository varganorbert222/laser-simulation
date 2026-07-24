import { describe, expect, it, vi } from 'vitest';
import { createDemoWorld } from '../scene/demo-world';
import type { FramePresenter } from './frame-presenter';
import { StudioRuntime } from './studio-runtime';

describe('StudioRuntime', () => {
  it('syncs view camera before gather, then presenter sync/render', () => {
    const world = createDemoWorld();
    const runtime = new StudioRuntime(world);
    const order: string[] = [];
    const syncViewCamera = vi.fn(() => {
      order.push('syncViewCamera');
      // Mimic Babylon → ECS so gather sees the live pose.
      world.resources.Camera.position = [9, 4, 7];
    });
    const sync = vi.fn(() => order.push('sync'));
    const render = vi.fn(() => order.push('render'));
    const presenter: FramePresenter = {
      setWorld: vi.fn(),
      syncViewCamera,
      sync,
      render,
      resize: vi.fn(),
      dispose: vi.fn(),
    };
    runtime.setPresenter(presenter);
    const camBeforeGather = world.resources.Camera.position.slice() as [number, number, number];
    runtime.tick(1 / 60);
    expect(syncViewCamera).toHaveBeenCalledWith(world);
    expect(sync).toHaveBeenCalledWith(world);
    expect(render).toHaveBeenCalledOnce();
    expect(order).toEqual(['syncViewCamera', 'sync', 'render']);
    // Gather ran after syncViewCamera — pack camera matches the live pose.
    expect(world.resources.RenderFrame?.cameraPosition).toEqual([9, 4, 7]);
    expect(camBeforeGather).not.toEqual([9, 4, 7]);
    expect(world.resources.Time.elapsedS).toBeGreaterThan(0);
  });
});
