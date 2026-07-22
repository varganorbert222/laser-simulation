import type { Vec3 } from '../math/vec3';

export type {
  Quality,
  QualityPreset,
  QualityRenderScaleConfig,
  ShadowQuality,
} from '../render/quality';
export {
  configureQualityRenderScale,
  createQuality,
  getQualityRenderScaleConfig,
  normalizeShadowQuality,
  QUALITY_PRESETS,
  refreshQualityPresets,
  renderScaleForPreset,
  shadowQualityIndex,
  shadowStepsForQuality,
} from '../render/quality';

export type { DisplayVision } from '../optics/display-vision';
export { createDefaultDisplayVision, normalizeDisplayVision } from '../optics/display-vision';
export type { EnvironmentLighting } from '../optics/environment-lighting';
export {
  createDefaultEnvironmentLighting,
  normalizeEnvironmentLighting,
  ENVIRONMENT_AMBIENT_DEFAULT,
} from '../optics/environment-lighting';

export type { SceneSunBinding } from '../optics/scene-sun';
export {
  createDefaultSceneSunBinding,
  isSunEmitter,
  isSuppressedSunEntity,
  refreshSceneSunBinding,
  resolveSceneSunBinding,
  wouldSuppressAdditionalSun,
} from '../optics/scene-sun';

/** edit = gizmos/grid/wireframes; photo = clean shot view. */
export type PresentationMode = 'edit' | 'photo';

export type GizmoMode = 'position' | 'rotation' | 'scale' | 'none';
export type GizmoSpace = 'local' | 'world';

export interface ActiveScene {
  sceneId: string;
  label: string;
}

export interface TimeResource {
  elapsedS: number;
  deltaS: number;
}

export interface CameraResource {
  position: Vec3;
  target: Vec3;
  fovYDeg: number;
  near: number;
  far: number;
  dirty: boolean;
}

export interface EditorSelection {
  /** Primary / last-clicked — gizmo pivot, paste parent default. */
  entityId: string | null;
  /** Full selection set including primary; empty when none. */
  entityIds: string[];
}

export function createDefaultEditorSelection(): EditorSelection {
  return { entityId: null, entityIds: [] };
}

/** Migrate legacy `{ entityId }` or partial selection payloads. */
export function normalizeEditorSelection(raw: unknown): EditorSelection {
  if (!raw || typeof raw !== 'object') return createDefaultEditorSelection();
  const r = raw as { entityId?: unknown; entityIds?: unknown };
  const primary =
    typeof r.entityId === 'string' ? r.entityId : r.entityId === null ? null : null;
  let ids: string[] = [];
  if (Array.isArray(r.entityIds)) {
    ids = r.entityIds.filter((id): id is string => typeof id === 'string');
  } else if (primary) {
    ids = [primary];
  }
  if (primary && !ids.includes(primary)) {
    ids = [...ids, primary];
  }
  if (!primary && ids.length > 0) {
    return { entityId: ids[ids.length - 1]!, entityIds: ids };
  }
  if (primary && ids.length === 0) {
    return { entityId: primary, entityIds: [primary] };
  }
  return { entityId: primary, entityIds: ids };
}

export interface EditorTooling {
  gizmoMode: GizmoMode;
  /** Gizmo axes follow mesh (local) or stay world-aligned. */
  gizmoSpace: GizmoSpace;
}

export function createDefaultEditorTooling(): EditorTooling {
  return { gizmoMode: 'position', gizmoSpace: 'world' };
}

export function normalizeEditorTooling(raw: unknown): EditorTooling {
  const out = createDefaultEditorTooling();
  if (!raw || typeof raw !== 'object') return out;
  const r = raw as { gizmoMode?: unknown; gizmoSpace?: unknown };
  if (
    r.gizmoMode === 'position' ||
    r.gizmoMode === 'rotation' ||
    r.gizmoMode === 'scale' ||
    r.gizmoMode === 'none'
  ) {
    out.gizmoMode = r.gizmoMode;
  }
  if (r.gizmoSpace === 'local' || r.gizmoSpace === 'world') {
    out.gizmoSpace = r.gizmoSpace;
  }
  return out;
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
