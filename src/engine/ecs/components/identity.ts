import type { Mat4 } from '../../math/mat4';
import type { Quat } from '../../math/quat';
import type { Vec3 } from '../../math/vec3';

export type EntityId = string;

export interface Name {
  value: string;
}

export interface Parent {
  entityId: EntityId | null;
}

/** Order among siblings under the same parent (Blender/Unity outliner). */
export interface SiblingOrder {
  index: number;
}

export interface Transform {
  position: Vec3;
  rotation: Quat;
  scale: Vec3;
}

/** Runtime-only world matrix — never serialized. */
export interface WorldXform {
  matrix: Mat4;
  dirty: boolean;
}

export interface FixtureRef {
  fixtureId: string;
}

export interface EnvironmentPiece {
  kind: 'ground' | 'prop' | 'sky';
  catalogId?: string;
}

export function defaultTransform(): Transform {
  return {
    position: [0, 0, 0],
    rotation: [0, 0, 0, 1],
    scale: [1, 1, 1],
  };
}

export function defaultEnvironmentPiece(): EnvironmentPiece {
  return { kind: 'prop' };
}
