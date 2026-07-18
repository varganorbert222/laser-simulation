import { fromTRS, getTranslation, mul, transformDirection } from '../../math/mat4';
import { forward } from '../../math/quat';
import { identity as quatIdentity } from '../../math/quat';
import { normalize, vec3 } from '../../math/vec3';
import type { World } from '../world';

/** Phase 2 — recompute WorldXform from local Transform + Parent. */
export function worldTransformSystem(world: World): void {
  const ids = world.query('Transform');
  const visiting = new Set<string>();

  const resolve = (id: string): void => {
    if (visiting.has(id)) return;
    visiting.add(id);

    const local = world.get(id, 'Transform');
    if (!local) return;

    const parent = world.get(id, 'Parent');
    let matrix = fromTRS(local.position, local.rotation, local.scale);

    if (parent?.entityId) {
      resolve(parent.entityId);
      const parentX = world.get(parent.entityId, 'WorldXform');
      if (parentX) {
        matrix = mul(parentX.matrix, matrix);
      }
    }

    const existing = world.get(id, 'WorldXform');
    if (existing) {
      existing.matrix = matrix;
      existing.dirty = false;
    } else {
      world.add(id, 'WorldXform', { matrix, dirty: false });
    }
  };

  for (const id of ids) resolve(id);
}

export function lightWorldPose(world: World, entityId: string) {
  const xform = world.get(entityId, 'WorldXform');
  const transform = world.get(entityId, 'Transform');
  const position = xform ? getTranslation(xform.matrix) : (transform?.position ?? vec3());
  const rotation = transform?.rotation ?? quatIdentity();
  const direction = xform
    ? normalize(transformDirection(xform.matrix, [0, 0, 1]))
    : forward(rotation);
  return { position, direction, rotation };
}
