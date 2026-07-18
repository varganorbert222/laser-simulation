import type { CameraPose } from '../runtime/frame-presenter';
import { cross, normalize, sub, type Vec3 } from './vec3';

const AXIS_COLORS = {
  x: '#e85d5d',
  y: '#5dd67a',
  z: '#6ea8ff',
} as const;

const WORLD_AXES: Record<'x' | 'y' | 'z', Vec3> = {
  x: [1, 0, 0],
  y: [0, 1, 0],
  z: [0, 0, 1],
};

export interface ViewportAxisGizmoLine {
  axis: 'x' | 'y' | 'z';
  label: string;
  x2: number;
  y2: number;
  labelX: number;
  labelY: number;
  color: string;
}

/** World XYZ projected to 2D widget space from camera pose (no Babylon). */
export function computeViewportAxisGizmoLines(
  pose: CameraPose,
  size = 80,
): ViewportAxisGizmoLine[] {
  const forward = normalize(sub(pose.target as Vec3, pose.position as Vec3));
  let right = cross(forward, [0, 1, 0]);
  if (right[0] * right[0] + right[1] * right[1] + right[2] * right[2] < 1e-10) {
    right = cross(forward, [0, 0, 1]);
  }
  right = normalize(right);
  const up = normalize(cross(right, forward));

  const len = size * 0.38;
  const cx = size * 0.5;

  return (['x', 'y', 'z'] as const)
    .map((axis) => {
      const w = WORLD_AXES[axis];
      const vx = w[0] * right[0] + w[1] * right[1] + w[2] * right[2];
      const vy = w[0] * up[0] + w[1] * up[1] + w[2] * up[2];
      const depth = w[0] * forward[0] + w[1] * forward[1] + w[2] * forward[2];
      const x2 = cx + vx * len;
      const y2 = cx + -vy * len;
      return {
        axis,
        label: axis.toUpperCase(),
        x2,
        y2,
        labelX: x2 + 3,
        labelY: y2 + 4,
        color: AXIS_COLORS[axis],
        depth,
      };
    })
    .sort((a, b) => a.depth - b.depth)
    .map(({ axis, label, x2, y2, labelX, labelY, color }) => ({
      axis,
      label,
      x2,
      y2,
      labelX,
      labelY,
      color,
    }));
}

/** Hit-test axis tip/label in SVG viewBox coordinates (origin top-left of 80×80). */
export function hitTestViewportAxis(
  lines: readonly ViewportAxisGizmoLine[],
  x: number,
  y: number,
  tipRadius = 12,
): 'x' | 'y' | 'z' | null {
  let best: { axis: 'x' | 'y' | 'z'; dist: number } | null = null;
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]!;
    const dx = x - line.x2;
    const dy = y - line.y2;
    const dist = Math.hypot(dx, dy);
    if (dist <= tipRadius && (!best || dist < best.dist)) {
      best = { axis: line.axis, dist };
    }
  }
  return best?.axis ?? null;
}
