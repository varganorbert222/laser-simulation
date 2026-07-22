import type {
  ComponentMap,
  LightEmitter,
  MediaVolume,
  SmokeEmitter,
} from '../ecs/components';
import {
  SERIALIZABLE_COMPONENTS,
  defaultTransform,
  normalizeLightEmitter,
  normalizeMediaVolume,
  normalizeSmokeEmitter,
} from '../ecs/components';
import { createQuality, createDefaultDisplayVision, normalizeDisplayVision, createDefaultEnvironmentLighting, normalizeEnvironmentLighting, normalizeEditorSelection, normalizeShadowQuality, refreshSceneSunBinding, type Quality } from '../ecs/resources';
import { World, SAVE_SCHEMA_VERSION, type SerializedWorld } from '../ecs/world';
import { identity as matIdentity } from '../math/mat4';
import {
  normalizeSurfaceMaterial,
  type SurfaceMaterial,
} from '../optics/surface-material';
import type { DisplayVision } from '../optics/display-vision';
import type { EnvironmentLighting } from '../optics/environment-lighting';

function normalizeQuality(q: Quality | (Partial<Quality> & { preset?: Quality['preset'] })): Quality {
  const preset = q.preset ?? 'medium';
  const base = createQuality(preset);
  return {
    ...base,
    ...q,
    preset,
    renderScale: typeof q.renderScale === 'number' ? q.renderScale : base.renderScale,
    antiAliasing: typeof q.antiAliasing === 'boolean' ? q.antiAliasing : base.antiAliasing,
    theatricalGlow:
      typeof q.theatricalGlow === 'boolean' ? q.theatricalGlow : base.theatricalGlow,
    tonemapMode: q.tonemapMode === 'reinhard' || q.tonemapMode === 'aces' ? q.tonemapMode : base.tonemapMode,
    shadowQuality: normalizeShadowQuality(
      (q as { shadowQuality?: unknown }).shadowQuality ?? base.shadowQuality,
    ),
  };
}

function normalizeEntityComponents(
  components: SerializedWorld['entities'][number]['components'],
): SerializedWorld['entities'][number]['components'] {
  const next = { ...components };
  const rawLight = next.LightEmitter as
    | (Partial<LightEmitter> & Record<string, unknown>)
    | undefined;

  // Legacy nested material on the light: keep apertureCoupling/gains via
  // normalizeLightEmitter, but do NOT keep SurfaceMaterial on light-only
  // entities — materials belong on receiving surfaces (floor / props).
  if (next.LightEmitter && next.SurfaceMaterial && !next.EnvironmentPiece) {
    delete next.SurfaceMaterial;
  } else if (next.SurfaceMaterial) {
    next.SurfaceMaterial = normalizeSurfaceMaterial(
      next.SurfaceMaterial as Partial<SurfaceMaterial>,
    );
  }

  if (rawLight) {
    next.LightEmitter = normalizeLightEmitter(rawLight);
  }
  if (next.MediaVolume) {
    next.MediaVolume = normalizeMediaVolume(
      next.MediaVolume as Partial<MediaVolume> & Record<string, unknown>,
    );
  }
  if (next.SmokeEmitter) {
    next.SmokeEmitter = normalizeSmokeEmitter(
      next.SmokeEmitter as Partial<SmokeEmitter> & Record<string, unknown>,
    );
  }
  return next;
}

/** Migrate older saves forward. */
export function migrateSave(data: SerializedWorld): SerializedWorld {
  const rawMode = data.resources.PresentationMode as string;
  const presentation =
    rawMode === 'capture' || rawMode === 'play' ? 'photo' : (rawMode as 'edit' | 'photo') || 'edit';

  const rawVision = (data.resources as { DisplayVision?: Partial<DisplayVision> }).DisplayVision;
  const rawEnv = (data.resources as { EnvironmentLighting?: Partial<EnvironmentLighting> })
    .EnvironmentLighting;

  return {
    ...data,
    schemaVersion: SAVE_SCHEMA_VERSION,
    resources: {
      ...data.resources,
      Quality: normalizeQuality(data.resources.Quality),
      PresentationMode: presentation,
      EditorTooling: data.resources.EditorTooling ?? { gizmoMode: 'position' },
      EditorSelection: normalizeEditorSelection(data.resources.EditorSelection),
      DisplayVision: normalizeDisplayVision(rawVision),
      EnvironmentLighting: normalizeEnvironmentLighting(rawEnv),
    },
    entities: data.entities.map((e) => ({
      ...e,
      components: normalizeEntityComponents(e.components),
    })),
  };
}

export function serializeWorld(world: World): string {
  return JSON.stringify(world.cloneSerializable(), null, 2);
}

export function restoreWorldFromSerialized(world: World, data: SerializedWorld): void {
  const migrated = migrateSave(data);
  for (const id of [...world.allEntities()]) {
    world.destroyEntity(id);
  }
  world.resources.ActiveScene = structuredClone(migrated.resources.ActiveScene);
  world.resources.Quality = structuredClone(migrated.resources.Quality);
  world.resources.Camera = { ...structuredClone(migrated.resources.Camera), dirty: true };
  world.resources.EditorSelection = normalizeEditorSelection(
    migrated.resources.EditorSelection,
  );
  world.resources.PresentationMode = migrated.resources.PresentationMode;
  world.resources.EditorTooling = structuredClone(
    migrated.resources.EditorTooling ?? { gizmoMode: 'position' },
  );
  world.resources.DisplayVision = structuredClone(
    migrated.resources.DisplayVision ?? createDefaultDisplayVision(),
  );
  world.resources.EnvironmentLighting = structuredClone(
    migrated.resources.EnvironmentLighting ?? createDefaultEnvironmentLighting(),
  );

  for (const entity of migrated.entities) {
    world.createEntity(entity.id);
    for (const name of SERIALIZABLE_COMPONENTS) {
      const value = entity.components[name];
      if (value !== undefined) {
        world.add(entity.id, name, structuredClone(value) as ComponentMap[typeof name]);
      }
    }
    // Ensure Transform always present
    if (!world.has(entity.id, 'Transform')) {
      world.add(entity.id, 'Transform', defaultTransform());
    }
    if (!world.has(entity.id, 'Parent')) {
      world.add(entity.id, 'Parent', { entityId: null });
    }
    if (!world.has(entity.id, 'SiblingOrder')) {
      world.add(entity.id, 'SiblingOrder', { index: 0 });
    }
    if (!world.has(entity.id, 'WorldXform')) {
      world.add(entity.id, 'WorldXform', { matrix: matIdentity(), dirty: true });
    }
    if (!world.has(entity.id, 'ViewportHidden')) {
      world.add(entity.id, 'ViewportHidden', { hidden: false });
    }
  }
  refreshSceneSunBinding(world);
  world.bump();
}

export function deserializeWorld(json: string): World {
  const raw = JSON.parse(json) as SerializedWorld;
  const data = migrateSave(raw);
  const world = new World({
    ActiveScene: data.resources.ActiveScene,
    Quality: data.resources.Quality,
    Camera: { ...data.resources.Camera, dirty: true },
    EditorSelection: data.resources.EditorSelection,
    PresentationMode: data.resources.PresentationMode,
    EditorTooling: data.resources.EditorTooling,
    DisplayVision: data.resources.DisplayVision,
    EnvironmentLighting: data.resources.EnvironmentLighting,
  });
  restoreWorldFromSerialized(world, data);
  return world;
}
