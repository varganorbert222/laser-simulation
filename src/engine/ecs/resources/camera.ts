import type { Vec3 } from '../../math/vec3';

export interface CameraResource {
  position: Vec3;
  target: Vec3;
  fovYDeg: number;
  near: number;
  far: number;
  dirty: boolean;
}

export function createDefaultCamera(): CameraResource {
  return {
    position: [4, 2.5, 6],
    target: [0, 0.5, 0],
    fovYDeg: 60,
    near: 0.05,
    far: 5000,
    dirty: true,
  };
}
