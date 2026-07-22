import { Injectable, computed, inject } from '@angular/core';
import {
  collectComponentValues,
  editableToVec3,
  eulerDegToQuat,
  fieldStateJson,
  quatToEulerDeg,
  selectionHasComponent,
  setTransformCommand,
  setTransformsCommand,
  vec3ToEditable,
  type GizmoMode,
  type GizmoSpace,
  type Transform,
  type Vec3Editable,
} from '../../../engine';
import { EngineHostService } from '../services/engine-host.service';
import { SelectionService } from './selection.service';

export interface TransformViewModel {
  position: Vec3Editable;
  rotationDeg: Vec3Editable;
  scale: Vec3Editable;
  positionMixed: boolean;
  rotationMixed: boolean;
  scaleMixed: boolean;
}

@Injectable({ providedIn: 'root' })
export class TransformEditorService {
  private readonly engine = inject(EngineHostService);
  private readonly selection = inject(SelectionService);

  readonly gizmoMode = computed(() => {
    this.engine.epoch();
    return this.engine.world().resources.EditorTooling.gizmoMode;
  });

  readonly gizmoSpace = computed(() => {
    this.engine.epoch();
    return this.engine.world().resources.EditorTooling.gizmoSpace ?? 'world';
  });

  readonly selectedTransform = computed(() => {
    this.engine.epoch();
    const id = this.selection.selectedId();
    if (!id) return null;
    return this.engine.world().get(id, 'Transform') ?? null;
  });

  readonly selectedTransformView = computed((): TransformViewModel | null => {
    this.engine.epoch();
    const ids = this.selection.selectedIds();
    const world = this.engine.world();
    if (!ids.length || !selectionHasComponent(world, ids, 'Transform')) return null;
    const transforms = collectComponentValues(world, ids, 'Transform');
    if (!transforms.length) return null;

    const positions = transforms.map((t) => t.position);
    const rotations = transforms.map((t) => t.rotation);
    const scales = transforms.map((t) => t.scale);
    const posState = fieldStateJson(positions);
    const rotState = fieldStateJson(rotations);
    const scaleState = fieldStateJson(scales);
    const primary = transforms[0]!;
    const rot = quatToEulerDeg(primary.rotation);

    return {
      position:
        posState.kind === 'equal' ? vec3ToEditable(posState.value) : vec3ToEditable(primary.position),
      rotationDeg:
        rotState.kind === 'equal'
          ? (() => {
              const r = quatToEulerDeg(rotState.value);
              return { x: r.x, y: r.y, z: r.z } satisfies Vec3Editable;
            })()
          : { x: rot.x, y: rot.y, z: rot.z },
      scale: scaleState.kind === 'equal' ? vec3ToEditable(scaleState.value) : vec3ToEditable(primary.scale),
      positionMixed: posState.kind === 'mixed',
      rotationMixed: rotState.kind === 'mixed',
      scaleMixed: scaleState.kind === 'mixed',
    };
  });

  setGizmoMode(mode: GizmoMode): void {
    this.engine.mutate((world) => {
      world.resources.EditorTooling.gizmoMode = mode;
      world.bump();
    });
    this.engine.getHost()?.setGizmoMode(mode);
  }

  setGizmoSpace(space: GizmoSpace): void {
    this.engine.mutate((world) => {
      world.resources.EditorTooling.gizmoSpace = space;
      world.bump();
    });
    this.engine.getHost()?.setGizmoSpace(space);
  }

  applyTransformFromView(
    partial: {
      position?: Vec3Editable;
      rotationDeg?: Vec3Editable;
      scale?: Vec3Editable;
    },
    opts?: { coalesce?: boolean },
  ): void {
    const ids = this.selection.selectedIds();
    if (!ids.length) return;
    const world = this.engine.world();

    if (ids.length === 1) {
      const id = ids[0]!;
      const before = world.get(id, 'Transform');
      if (!before) return;
      const after: Transform = {
        position: partial.position ? editableToVec3(partial.position) : before.position,
        rotation: partial.rotationDeg ? eulerDegToQuat(partial.rotationDeg) : before.rotation,
        scale: partial.scale ? editableToVec3(partial.scale) : before.scale,
      };
      if (opts?.coalesce) {
        this.engine.coalesceSnapshot({
          key: `Transform:${id}`,
          label: 'Transform',
          before,
          after,
          apply: (t) => {
            world.set(id, 'Transform', {
              position: [...t.position] as Transform['position'],
              rotation: [...t.rotation] as Transform['rotation'],
              scale: [...t.scale] as Transform['scale'],
            });
          },
        });
        return;
      }
      this.engine.executeCommand(setTransformCommand(world, id, before, after));
      return;
    }

    const entries: { entityId: string; before: Transform; after: Transform }[] = [];
    for (const id of ids) {
      const before = world.get(id, 'Transform');
      if (!before) continue;
      entries.push({
        entityId: id,
        before: structuredClone(before),
        after: {
          position: partial.position ? editableToVec3(partial.position) : before.position,
          rotation: partial.rotationDeg ? eulerDegToQuat(partial.rotationDeg) : before.rotation,
          scale: partial.scale ? editableToVec3(partial.scale) : before.scale,
        },
      });
    }
    if (!entries.length) return;

    if (opts?.coalesce) {
      this.engine.coalesceSnapshot({
        key: `Transform:multi:${ids.join(',')}`,
        label: `Transform (${entries.length})`,
        before: entries.map((e) => e.before),
        after: entries.map((e) => e.after),
        apply: (list) => {
          list.forEach((t, i) => {
            const id = entries[i]?.entityId;
            if (!id) return;
            world.set(id, 'Transform', {
              position: [...t.position] as Transform['position'],
              rotation: [...t.rotation] as Transform['rotation'],
              scale: [...t.scale] as Transform['scale'],
            });
          });
        },
      });
      return;
    }
    const cmd = setTransformsCommand(world, entries);
    if (cmd) this.engine.executeCommand(cmd);
  }
}
