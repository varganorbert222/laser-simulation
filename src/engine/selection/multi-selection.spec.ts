import { describe, expect, it } from 'vitest';
import { applySelection, snapshotSelection } from '../commands/selection';
import { createDemoWorld } from '../scene/demo-world';
import { createSceneEntity } from '../hierarchy/entity-factory';
import { deleteEntitiesCommand, duplicateEntitiesCommand } from '../commands/hierarchy-commands';
import { fieldState, fieldStateJson, sharedComponents } from '../selection/aggregate';
import { normalizeEditorSelection } from '../ecs/resources';
import { migrateSave } from '../save/serialize';
import { SAVE_SCHEMA_VERSION, type SerializedWorld } from '../ecs/world';

describe('multi selection', () => {
  it('replace / toggle / range modes', () => {
    const world = createDemoWorld();
    const a = createSceneEntity(world, { name: 'A', parentId: 'scene_root' });
    const b = createSceneEntity(world, { name: 'B', parentId: 'scene_root' });
    const c = createSceneEntity(world, { name: 'C', parentId: 'scene_root' });

    applySelection(world, a);
    expect(world.resources.EditorSelection).toEqual({ entityId: a, entityIds: [a] });

    applySelection(world, b, { mode: 'toggle' });
    expect(new Set(world.resources.EditorSelection.entityIds)).toEqual(new Set([a, b]));
    expect(world.resources.EditorSelection.entityId).toBe(b);

    applySelection(world, c, { mode: 'range', rangeOrder: [a, b, c] });
    expect(world.resources.EditorSelection.entityIds).toEqual([b, c]);
    expect(world.resources.EditorSelection.entityId).toBe(c);

    applySelection(world, b, { mode: 'toggle' });
    expect(world.resources.EditorSelection.entityIds).not.toContain(b);
  });

  it('prunes destroyed entities from selection', () => {
    const world = createDemoWorld();
    const a = createSceneEntity(world, { name: 'A', parentId: 'scene_root' });
    const b = createSceneEntity(world, { name: 'B', parentId: 'scene_root' });
    applySelection(world, [a, b]);
    world.destroyEntity(a);
    expect(world.resources.EditorSelection.entityIds).toEqual([b]);
    expect(world.resources.EditorSelection.entityId).toBe(b);
  });

  it('migrates legacy EditorSelection without entityIds', () => {
    const raw = {
      schemaVersion: 1,
      resources: {
        ActiveScene: { sceneId: 'room', label: 'x' },
        Quality: { preset: 'medium' },
        Camera: {
          position: [0, 0, 0],
          target: [0, 0, 0],
          fovYDeg: 60,
          near: 0.1,
          far: 100,
          dirty: false,
        },
        EditorSelection: { entityId: 'laser_1' },
        PresentationMode: 'edit',
        EditorTooling: { gizmoMode: 'position' },
      },
      entities: [],
    } as unknown as SerializedWorld;
    const migrated = migrateSave(raw);
    expect(migrated.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
    expect(normalizeEditorSelection(migrated.resources.EditorSelection)).toEqual({
      entityId: 'laser_1',
      entityIds: ['laser_1'],
    });
  });

  it('bulk delete and duplicate', () => {
    const world = createDemoWorld();
    const a = createSceneEntity(world, { name: 'A', parentId: 'scene_root' });
    const b = createSceneEntity(world, { name: 'B', parentId: 'scene_root' });
    applySelection(world, [a, b]);
    const dup = duplicateEntitiesCommand(world, [a, b]);
    expect(dup).not.toBeNull();
    dup!.execute();
    expect(world.resources.EditorSelection.entityIds.length).toBe(2);

    const del = deleteEntitiesCommand(world, [a, b]);
    expect(del).not.toBeNull();
    del!.execute();
    expect(world.hasEntity(a)).toBe(false);
    expect(world.hasEntity(b)).toBe(false);
  });

  it('fieldState and sharedComponents', () => {
    expect(fieldState([1, 1, 1])).toEqual({ kind: 'equal', value: 1 });
    expect(fieldState([1, 2]).kind).toBe('mixed');
    expect(fieldStateJson([{ a: 1 }, { a: 1 }]).kind).toBe('equal');
    expect(fieldStateJson([{ a: 1 }, { a: 2 }]).kind).toBe('mixed');

    const world = createDemoWorld();
    const shared = sharedComponents(world, ['laser_1']);
    expect(shared).toContain('LightEmitter');
    expect(shared).toContain('Transform');
  });

  it('snapshotSelection round-trip', () => {
    const world = createDemoWorld();
    const a = createSceneEntity(world, { name: 'A', parentId: 'scene_root' });
    applySelection(world, a, { mode: 'toggle' });
    const snap = snapshotSelection(world);
    applySelection(world, null);
    applySelection(world, snap);
    expect(world.resources.EditorSelection.entityIds).toContain(a);
  });
});
