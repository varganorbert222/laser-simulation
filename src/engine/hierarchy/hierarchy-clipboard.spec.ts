import { describe, expect, it } from 'vitest';
import { World } from '../ecs/world';
import { createSceneEntity } from '../hierarchy/entity-factory';
import {
  captureEntitySubtree,
  duplicateEntitySubtree,
  pasteEntitySubtree,
} from '../hierarchy/ops';
import { defaultLightEmitter } from '../ecs/components';

describe('hierarchy clipboard ops', () => {
  it('duplicates a light subtree with new id and selection', () => {
    const world = new World();
    const root = createSceneEntity(world, { name: 'Scene', isSceneRoot: true, locked: true });
    const laser = createSceneEntity(world, { name: 'Lézer', parentId: root });
    world.add(laser, 'LightEmitter', defaultLightEmitter());

    const copyId = duplicateEntitySubtree(world, laser);
    expect(copyId).toBeTruthy();
    expect(copyId).not.toBe(laser);
    expect(world.get(copyId!, 'Name')?.value).toContain('másolat');
    expect(world.get(copyId!, 'LightEmitter')?.wavelengthNm).toBe(532);
    expect(world.get(copyId!, 'Parent')?.entityId).toBe(root);
    expect(world.resources.EditorSelection.entityId).toBe(copyId);
  });

  it('paste restores captured subtree under a parent', () => {
    const world = new World();
    const root = createSceneEntity(world, { name: 'Scene', isSceneRoot: true, locked: true });
    const a = createSceneEntity(world, { name: 'A', parentId: root });
    const child = createSceneEntity(world, { name: 'Child', parentId: a });
    world.add(child, 'LightEmitter', defaultLightEmitter());

    const snap = captureEntitySubtree(world, a);
    expect(snap?.children).toHaveLength(1);
    const pasted = pasteEntitySubtree(world, snap!, root, { nameSuffix: ' (másolat)' });
    expect(pasted).toBeTruthy();
    expect(world.get(pasted!, 'Name')?.value).toBe('A (másolat)');
    const kids = world
      .allEntities()
      .filter((id) => world.get(id, 'Parent')?.entityId === pasted);
    expect(kids).toHaveLength(1);
    expect(world.get(kids[0], 'LightEmitter')).toBeTruthy();
  });
});
