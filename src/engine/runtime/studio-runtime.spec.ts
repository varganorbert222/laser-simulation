import { describe, expect, it, vi } from 'vitest';
import { createDemoWorld } from '../scene/demo-world';
import type { FramePresenter } from './frame-presenter';
import { StudioRuntime } from './studio-runtime';

describe('StudioRuntime', () => {
  it('runs schedule then presenter sync/render', () => {
    const world = createDemoWorld();
    const runtime = new StudioRuntime(world);
    const sync = vi.fn();
    const render = vi.fn();
    const presenter: FramePresenter = {
      setWorld: vi.fn(),
      sync,
      render,
      resize: vi.fn(),
      dispose: vi.fn(),
    };
    runtime.setPresenter(presenter);
    runtime.tick(1 / 60);
    expect(sync).toHaveBeenCalledWith(world);
    expect(render).toHaveBeenCalledOnce();
    expect(world.resources.Time.elapsedS).toBeGreaterThan(0);
  });
});
