/** edit = gizmos/grid/wireframes; photo = clean shot view. */
export type PresentationMode = 'edit' | 'photo';

export type GizmoMode = 'position' | 'rotation' | 'scale' | 'none';
export type GizmoSpace = 'local' | 'world';

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
