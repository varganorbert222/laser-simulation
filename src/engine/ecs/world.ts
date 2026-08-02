import type { ComponentMap, ComponentName, EntityId } from './components';
import { SERIALIZABLE_COMPONENTS } from './components';
import type {
  ActiveScene,
  CameraResource,
  EditorSelection,
  EditorTooling,
  PresentationMode,
  TimeResource,
} from './resources';
import {
  createDefaultCamera,
  createDefaultEditorSelection,
  normalizeEditorTooling,
  normalizeEditorSelection,
} from './resources';
import type { DisplayVision } from '../physics/optics/display/display-vision';
import { createDefaultDisplayVision } from '../physics/optics/display/display-vision';
import type { EnvironmentLighting } from '../physics/optics/scene/environment-lighting';
import { createDefaultEnvironmentLighting } from '../physics/optics/scene/environment-lighting';
import type { AtmosphereSettings } from '../physics/optics/atmosphere/atmosphere-settings';
import { createDefaultAtmosphereSettings } from '../physics/optics/atmosphere/atmosphere-settings';
import type { SceneSunBinding } from '../physics/optics/scene/scene-sun';
import { createDefaultSceneSunBinding } from '../physics/optics/scene/scene-sun';
import type { GravityEnvironment } from '../physics/fluid/gravity-environment';
import { createDefaultGravityEnvironment } from '../physics/fluid/gravity-environment';
import type { WindEnvironment } from '../physics/fluid/wind-environment';
import { createDefaultWindEnvironment } from '../physics/fluid/wind-environment';
import type { GlobalSunVolumetrics } from '../physics/optics/scene/global-sun-volumetrics';
import { createDefaultGlobalSunVolumetrics } from '../physics/optics/scene/global-sun-volumetrics';
import type { Quality } from '../render/quality';
import { createQuality } from '../render/quality';
import type { GatheredFrame } from '../render/pack';

/** v4: DisplayVision gains activeObserver / debugView / fatigue / legacyLuminousPack. */
export const SAVE_SCHEMA_VERSION = 4;

export interface WorldResources {
  ActiveScene: ActiveScene;
  Quality: Quality;
  Time: TimeResource;
  Camera: CameraResource;
  EditorSelection: EditorSelection;
  PresentationMode: PresentationMode;
  EditorTooling: EditorTooling;
  DisplayVision: DisplayVision;
  EnvironmentLighting: EnvironmentLighting;
  /** Procedural sky + SPA site/time (optional). */
  Atmosphere: AtmosphereSettings;
  /** Global gravity for fluid force pass. */
  GravityEnvironment: GravityEnvironment;
  /** Global wind for fluid force pass. */
  WindEnvironment: WindEnvironment;
  /** Screen-wide sun volumetrics (god-rays) independent of media volumes. */
  GlobalSunVolumetrics: GlobalSunVolumetrics;
  /** Primary / suppressed sun emitters (refreshed on pack / load). */
  SceneSun: SceneSunBinding;
  /**
   * Last frame's GPU pack from the gather schedule phase (runtime-only, not saved).
   */
  RenderFrame: GatheredFrame | null;
  epoch: number;
}

export interface SerializedEntity {
  id: EntityId;
  components: Partial<ComponentMap>;
}

export interface SerializedWorld {
  schemaVersion: number;
  resources: {
    ActiveScene: ActiveScene;
    Quality: Quality;
    Camera: CameraResource;
    EditorSelection: EditorSelection;
    PresentationMode: PresentationMode;
    EditorTooling: EditorTooling;
    DisplayVision: DisplayVision;
    EnvironmentLighting: EnvironmentLighting;
    Atmosphere?: AtmosphereSettings;
    GravityEnvironment?: GravityEnvironment;
    WindEnvironment?: WindEnvironment;
    GlobalSunVolumetrics?: GlobalSunVolumetrics;
    SceneSun?: SceneSunBinding;
  };
  entities: SerializedEntity[];
}

type StoreMap = { [K in ComponentName]: Map<EntityId, ComponentMap[K]> };

function createStores(): StoreMap {
  return {
    Name: new Map(),
    Parent: new Map(),
    SiblingOrder: new Map(),
    Transform: new Map(),
    WorldXform: new Map(),
    FixtureRef: new Map(),
    EnvironmentPiece: new Map(),
    SurfaceMaterial: new Map(),
    LightEmitter: new Map(),
    MediaVolume: new Map(),
    SmokeEmitter: new Map(),
    FogVolume: new Map(),
    FluidVolume: new Map(),
    Selectable: new Map(),
    ViewportHidden: new Map(),
    EditorFlags: new Map(),
  };
}

export class World {
  private nextId = 1;
  private readonly entities = new Set<EntityId>();
  private readonly stores: StoreMap = createStores();
  readonly resources: WorldResources;

  constructor(resources?: Partial<WorldResources>) {
    this.resources = {
      ActiveScene: resources?.ActiveScene ?? { sceneId: 'room', label: 'Szoba labor' },
      Quality: resources?.Quality ?? createQuality('medium'),
      Time: resources?.Time ?? { elapsedS: 0, deltaS: 0 },
      Camera: resources?.Camera ?? createDefaultCamera(),
      EditorSelection: normalizeEditorSelection(
        resources?.EditorSelection ?? createDefaultEditorSelection(),
      ),
      PresentationMode: resources?.PresentationMode ?? 'edit',
      EditorTooling: normalizeEditorTooling(resources?.EditorTooling),
      DisplayVision: resources?.DisplayVision ?? createDefaultDisplayVision(),
      EnvironmentLighting: resources?.EnvironmentLighting ?? createDefaultEnvironmentLighting(),
      Atmosphere: resources?.Atmosphere ?? createDefaultAtmosphereSettings(),
      GravityEnvironment: resources?.GravityEnvironment ?? createDefaultGravityEnvironment(),
      WindEnvironment: resources?.WindEnvironment ?? createDefaultWindEnvironment(),
      GlobalSunVolumetrics:
        resources?.GlobalSunVolumetrics ?? createDefaultGlobalSunVolumetrics(),
      SceneSun: resources?.SceneSun ?? createDefaultSceneSunBinding(),
      RenderFrame: resources?.RenderFrame ?? null,
      epoch: resources?.epoch ?? 0,
    };
  }

  createEntity(id?: EntityId): EntityId {
    const entityId = id ?? `e_${this.nextId++}`;
    this.entities.add(entityId);
    this.bump();
    return entityId;
  }

  destroyEntity(id: EntityId): void {
    if (!this.entities.has(id)) return;
    (Object.keys(this.stores) as ComponentName[]).forEach((name) => {
      this.stores[name].delete(id);
    });
    this.entities.delete(id);
    const sel = this.resources.EditorSelection;
    const ids = (sel.entityIds ?? []).filter((eid) => eid !== id);
    const primary =
      sel.entityId === id
        ? (ids[ids.length - 1] ?? null)
        : sel.entityId && ids.includes(sel.entityId)
          ? sel.entityId
          : (ids[ids.length - 1] ?? null);
    this.resources.EditorSelection = {
      entityId: primary,
      entityIds: ids,
    };
    this.bump();
  }

  hasEntity(id: EntityId): boolean {
    return this.entities.has(id);
  }

  allEntities(): EntityId[] {
    return [...this.entities];
  }

  add<C extends ComponentName>(id: EntityId, name: C, value: ComponentMap[C]): void {
    if (!this.entities.has(id)) this.entities.add(id);
    this.stores[name].set(id, value);
    this.bump();
  }

  get<C extends ComponentName>(id: EntityId, name: C): ComponentMap[C] | undefined {
    return this.stores[name].get(id);
  }

  set<C extends ComponentName>(id: EntityId, name: C, value: ComponentMap[C]): void {
    if (!this.entities.has(id)) return;
    this.stores[name].set(id, value);
    this.bump();
  }

  /**
   * Replace a component without bumping epoch (per-frame animation / SPA sun sync).
   * Use when meshes should update transforms in place, not rebuild.
   */
  setQuiet<C extends ComponentName>(
    id: EntityId,
    name: C,
    value: ComponentMap[C],
  ): void {
    if (!this.entities.has(id)) return;
    this.stores[name].set(id, value);
  }

  remove<C extends ComponentName>(id: EntityId, name: C): void {
    this.stores[name].delete(id);
    this.bump();
  }

  has<C extends ComponentName>(id: EntityId, name: C): boolean {
    return this.stores[name].has(id);
  }

  query<C extends ComponentName>(...names: C[]): EntityId[] {
    if (names.length === 0) return this.allEntities();
    const [first, ...rest] = names;
    const out: EntityId[] = [];
    for (const id of this.stores[first].keys()) {
      if (!this.entities.has(id)) continue;
      if (rest.every((n) => this.stores[n].has(id))) out.push(id);
    }
    return out;
  }

  bump(): void {
    this.resources.epoch++;
  }

  cloneSerializable(): SerializedWorld {
    const entities: SerializedEntity[] = [];
    for (const id of this.entities) {
      const components: Partial<ComponentMap> = {};
      for (const name of SERIALIZABLE_COMPONENTS) {
        const value = this.get(id, name);
        if (value !== undefined) {
          (components as Record<string, unknown>)[name] = structuredClone(value);
        }
      }
      entities.push({ id, components });
    }
    return {
      schemaVersion: SAVE_SCHEMA_VERSION,
      resources: {
        ActiveScene: structuredClone(this.resources.ActiveScene),
        Quality: structuredClone(this.resources.Quality),
        Camera: { ...structuredClone(this.resources.Camera), dirty: true },
        EditorSelection: structuredClone(this.resources.EditorSelection),
        PresentationMode: this.resources.PresentationMode,
        EditorTooling: structuredClone(this.resources.EditorTooling),
        DisplayVision: structuredClone(this.resources.DisplayVision),
        EnvironmentLighting: structuredClone(this.resources.EnvironmentLighting),
        Atmosphere: structuredClone(this.resources.Atmosphere),
        GravityEnvironment: structuredClone(this.resources.GravityEnvironment),
        WindEnvironment: structuredClone(this.resources.WindEnvironment),
        GlobalSunVolumetrics: structuredClone(this.resources.GlobalSunVolumetrics),
      },
      entities,
    };
  }
}
