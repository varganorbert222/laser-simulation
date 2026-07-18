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
});
