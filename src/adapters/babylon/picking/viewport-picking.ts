import { PointerEventTypes, type Scene } from '@babylonjs/core';
import type { StudioTransformGizmo } from '../transform-gizmo';

export interface ViewportPickModifiers {
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
}

export function bindViewportPicking(
  scene: Scene,
  gizmo: StudioTransformGizmo,
  isEditMode: () => boolean,
  onPick: (entityId: string | null, mods?: ViewportPickModifiers) => void,
): { dispose: () => void } {
  const observer = scene.onPointerObservable.add((info) => {
    if (info.type !== PointerEventTypes.POINTERDOWN) return;
    if (!isEditMode()) return;
    if (info.event.button !== 0) return;
    if (gizmo.isHovered || gizmo.isDragging) return;

    const pick = scene.pick(scene.pointerX, scene.pointerY);
    const rawId = pick?.hit ? pick.pickedMesh?.metadata?.entityId : undefined;
    // Only accept real ECS string ids — non-string metadata must not reach applySelection.
    const entityId = typeof rawId === 'string' ? rawId : null;
    const ev = info.event as PointerEvent;
    onPick(entityId, {
      ctrlKey: ev.ctrlKey,
      metaKey: ev.metaKey,
      shiftKey: ev.shiftKey,
    });
  });

  return {
    dispose: () => {
      scene.onPointerObservable.remove(observer);
    },
  };
}
