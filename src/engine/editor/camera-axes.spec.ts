import { describe, expect, it } from 'vitest';
import { computeViewportAxisGizmoLines, hitTestViewportAxis } from './camera-axes';

describe('viewport axis gizmo', () => {
  it('projects axes and hit-tests tip', () => {
    const lines = computeViewportAxisGizmoLines({
      position: [0, 5, 10],
      target: [0, 0, 0],
      fovYDeg: 50,
    });
    expect(lines).toHaveLength(3);
    expect(lines.map((l) => l.axis).sort()).toEqual(['x', 'y', 'z']);

    const tip = lines.find((l) => l.axis === 'x')!;
    expect(hitTestViewportAxis(lines, tip.x2, tip.y2)).toBe('x');
    expect(hitTestViewportAxis(lines, 40, 40)).toBeNull();
  });

  it('matches Babylon LookAtLH: camera on +Z → +Y up, +X to screen left', () => {
    const lines = computeViewportAxisGizmoLines({
      position: [0, 0, 10],
      target: [0, 0, 0],
      fovYDeg: 50,
    });
    const x = lines.find((l) => l.axis === 'x')!;
    const y = lines.find((l) => l.axis === 'y')!;
    const z = lines.find((l) => l.axis === 'z')!;
    // SVG y grows down → world +Y (screen up) has y2 < center.
    expect(y.y2).toBeLessThan(40);
    expect(Math.abs(y.x2 - 40)).toBeLessThan(1);
    // LookAtLH right = (−1,0,0) → world +X projects to screen left.
    expect(x.x2).toBeLessThan(40);
    expect(Math.abs(x.y2 - 40)).toBeLessThan(1);
    // +Z into camera → near center tip (depth-sorted, short projection).
    expect(Math.hypot(z.x2 - 40, z.y2 - 40)).toBeLessThan(8);
  });

  it('matches Babylon LookAtLH: camera on +X → +Y up, +Z to screen right', () => {
    const lines = computeViewportAxisGizmoLines({
      position: [10, 0, 0],
      target: [0, 0, 0],
      fovYDeg: 50,
    });
    const y = lines.find((l) => l.axis === 'y')!;
    const z = lines.find((l) => l.axis === 'z')!;
    expect(y.y2).toBeLessThan(40);
    expect(z.x2).toBeGreaterThan(40);
  });
});
