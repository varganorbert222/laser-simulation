import { Injectable, computed, inject } from '@angular/core';
import {
  addComponentToSelectionCommand,
  fieldState,
  removeComponentFromSelectionCommand,
  sharedUserComponents,
  type GizmoMode,
  type HierarchyReorderEvent,
  type LightEmitter,
  type LightMode,
  type MediaVolume,
  type SmokeEmitter,
  type PresentationMode,
  type QualityPreset,
  type ShadowQuality,
  type Quality,
  type SurfaceMaterial,
  type UserAddableComponent,
  type ComponentName,
  type Vec3Editable,
  type DisplayResponseCurve,
} from '../../../engine';
import { EngineHostService } from './engine-host.service';
import { HierarchyEditorService } from '../editor/hierarchy-editor.service';
import { LightEditorService } from '../editor/light-editor.service';
import { MediaEditorService } from '../editor/media-editor.service';
import { SmokeEmitterEditorService } from '../editor/smoke-emitter-editor.service';
import { SelectionService, type SelectOptions } from '../editor/selection.service';
import { SessionService } from '../editor/session.service';
import { SurfaceMaterialEditorService } from '../editor/surface-material-editor.service';
import { TransformEditorService } from '../editor/transform-editor.service';
import type { HierarchySelectEvent } from '../../shared/editor/hierarchy-panel/hierarchy-panel.component';

/**
 * Thin façade for templates — delegates to domain editor services.
 */
@Injectable({ providedIn: 'root' })
export class EditorFacade {
  private readonly engine = inject(EngineHostService);
  private readonly selection = inject(SelectionService);
  private readonly hierarchy = inject(HierarchyEditorService);
  private readonly light = inject(LightEditorService);
  private readonly media = inject(MediaEditorService);
  private readonly smoke = inject(SmokeEmitterEditorService);
  private readonly surface = inject(SurfaceMaterialEditorService);
  private readonly transform = inject(TransformEditorService);
  private readonly session = inject(SessionService);

  readonly selectedId = this.selection.selectedId;
  readonly selectedIds = this.selection.selectedIds;
  readonly selectionCount = this.selection.selectionCount;
  readonly hierarchyTree = this.hierarchy.hierarchyTree;
  readonly presentationMode = this.session.presentationMode;
  readonly isEditMode = this.session.isEditMode;
  readonly gizmoMode = this.transform.gizmoMode;
  readonly selectedLight = this.light.selectedLight;
  readonly selectedLightMixed = this.light.selectedLightMixed;
  readonly selectedSunSuppressed = this.light.selectedSunSuppressed;
  readonly lightModes = this.light.lightModes;
  readonly editorNotice = this.hierarchy.notice;
  readonly selectedMedia = this.media.selectedMedia;
  readonly selectedMediaMixed = this.media.selectedMediaMixed;
  readonly selectedSmoke = this.smoke.selectedSmoke;
  readonly selectedSmokeMixed = this.smoke.selectedSmokeMixed;
  readonly selectedSurfaceMaterial = this.surface.selectedSurfaceMaterial;
  readonly selectedSurfaceMaterialMixed = this.surface.selectedSurfaceMaterialMixed;
  readonly selectedTransform = this.transform.selectedTransform;
  readonly selectedTransformView = this.transform.selectedTransformView;
  readonly scienceReadout = this.light.scienceReadout;
  readonly quality = this.session.quality;
  readonly qualitySettings = this.session.qualitySettings;
  readonly antiAliasing = this.session.antiAliasing;
  readonly theatricalGlow = this.session.theatricalGlow;
  readonly tonemapMode = this.session.tonemapMode;
  readonly shadowQuality = this.session.shadowQuality;
  readonly ambientLevel = this.session.ambientLevel;
  readonly responseCurve = this.session.responseCurve;
  readonly powerPresets = this.light.powerPresets;
  readonly sceneList = this.session.sceneList;
  readonly activeSceneId = this.session.activeSceneId;
  readonly activeSceneLabel = this.session.activeSceneLabel;

  readonly selectedName = computed(() => {
    this.engine.epoch();
    const ids = this.selectedIds();
    if (!ids.length) return null;
    const names = ids.map((id) => this.engine.world().get(id, 'Name')?.value ?? id);
    const state = fieldState(names);
    return state.kind === 'equal' ? state.value : null;
  });

  readonly selectedNameMixed = computed(() => {
    this.engine.epoch();
    const ids = this.selectedIds();
    if (ids.length <= 1) return false;
    const names = ids.map((id) => this.engine.world().get(id, 'Name')?.value ?? id);
    return fieldState(names).kind === 'mixed';
  });

  readonly selectedComponents = computed(() => {
    this.engine.epoch();
    const ids = this.selectedIds();
    if (!ids.length) return [] as string[];
    return sharedUserComponents(this.engine.world(), ids);
  });

  worldHidden = (id: string): boolean => this.hierarchy.worldHidden(id);

  select(id: string | null, opts?: SelectOptions): void {
    this.selection.select(id, opts);
  }

  onHierarchySelect(event: HierarchySelectEvent): void {
    if (event.mode === 'range') {
      const order = this.flatOutlinerIds();
      this.selection.select(event.id, { mode: 'range', rangeOrder: order });
      return;
    }
    this.selection.select(event.id, { mode: event.mode });
  }

  private flatOutlinerIds(): string[] {
    const ids: string[] = [];
    const walk = (nodes: { id: string; children: typeof nodes }[]) => {
      for (const n of nodes) {
        ids.push(n.id);
        if (n.children?.length) walk(n.children);
      }
    };
    walk(this.hierarchyTree());
    return ids;
  }

  canAddComponent(component: UserAddableComponent): boolean {
    const ids = this.selectedIds();
    if (!ids.length) return false;
    const world = this.engine.world();
    return ids.some((id) => !world.has(id, component));
  }

  setPresentation(mode: PresentationMode): void {
    this.session.setPresentation(mode);
  }

  setGizmoMode(mode: GizmoMode): void {
    this.transform.setGizmoMode(mode);
  }

  reorder(event: HierarchyReorderEvent): void {
    this.hierarchy.reorder(event);
  }

  addEmpty(parentId: string | null = null): void {
    this.hierarchy.addEmpty(parentId);
  }

  addSmokeEmitter(parentId: string | null = null): void {
    this.hierarchy.addSmokeEmitter(parentId);
  }

  addSun(parentId: string | null = null): void {
    this.hierarchy.addSun(parentId);
  }

  addBelow(parentId: string): void {
    this.hierarchy.addBelow(parentId);
  }

  addSmokeEmitterBelow(parentId: string): void {
    this.hierarchy.addSmokeEmitterBelow(parentId);
  }

  addSunBelow(parentId: string): void {
    this.hierarchy.addSunBelow(parentId);
  }

  deleteSelected(id?: string | null): void {
    this.hierarchy.deleteSelected(id);
  }

  copySelected(id?: string | null): void {
    this.hierarchy.copy(id);
  }

  cutSelected(id?: string | null): void {
    this.hierarchy.cut(id);
  }

  pasteInto(parentId?: string | null): void {
    this.hierarchy.paste(parentId);
  }

  duplicateSelected(id?: string | null): void {
    this.hierarchy.duplicate(id);
  }

  renameInteractive(id?: string | null): void {
    this.hierarchy.renameInteractive(id);
  }

  readonly hasClipboard = this.hierarchy.hasClipboard;

  setVisibility(id: string, visible: boolean): void {
    this.hierarchy.setVisibility(id, visible);
  }

  rename(name: string): void {
    this.hierarchy.rename(name);
  }

  addComponent(component: UserAddableComponent): void {
    const ids = this.selectedIds();
    if (!ids.length) return;
    const cmd = addComponentToSelectionCommand(this.engine.world(), ids, component);
    this.engine.commitApplied(cmd);
  }

  removeComponent(component: UserAddableComponent | 'SmokeEmitter'): void {
    const ids = this.selectedIds();
    if (!ids.length) return;
    const cmd = removeComponentFromSelectionCommand(
      this.engine.world(),
      ids,
      component as ComponentName,
    );
    this.engine.commitApplied(cmd);
  }

  updateLight(patch: Partial<LightEmitter>, opts?: { coalesce?: boolean }): void {
    this.light.updateLight(patch, opts);
  }

  setLightMode(mode: LightMode): void {
    this.light.setLightMode(mode);
  }

  clearEditorNotice(): void {
    this.hierarchy.clearNotice();
  }

  updateSurfaceMaterial(patch: Partial<SurfaceMaterial>, opts?: { coalesce?: boolean }): void {
    this.surface.updateSurfaceMaterial(patch, opts);
  }

  setWavelength(nm: number): void {
    this.light.setWavelength(nm);
  }

  setPower(powerW: number): void {
    this.light.setPower(powerW);
  }

  setMediaDensity(density: number): void {
    this.media.setMediaDensity(density);
  }

  updateMedia(patch: Partial<MediaVolume>, opts?: { coalesce?: boolean }): void {
    this.media.updateMedia(patch, opts);
  }

  updateSmoke(patch: Partial<SmokeEmitter>, opts?: { coalesce?: boolean }): void {
    this.smoke.updateSmoke(patch, opts);
  }

  applyTransformFromView(
    partial: {
      position?: Vec3Editable;
      rotationDeg?: Vec3Editable;
      scale?: Vec3Editable;
    },
    opts?: { coalesce?: boolean },
  ): void {
    this.transform.applyTransformFromView(partial, opts);
  }

  setQuality(preset: QualityPreset): void {
    this.session.setQuality(preset);
  }

  patchQuality(partial: Partial<Omit<Quality, 'preset'>>): void {
    this.session.patchQuality(partial);
  }

  setShadowQuality(quality: ShadowQuality): void {
    this.session.setShadowQuality(quality);
  }

  setAntiAliasing(enabled: boolean): void {
    this.session.setAntiAliasing(enabled);
  }

  setTheatricalGlow(enabled: boolean): void {
    this.session.setTheatricalGlow(enabled);
  }

  setTonemapMode(mode: 'aces' | 'reinhard'): void {
    this.session.setTonemapMode(mode);
  }

  setAmbientLevel(ambientLevel: number): void {
    this.session.setAmbientLevel(ambientLevel);
  }

  setResponseCurve(curve: DisplayResponseCurve): void {
    this.session.setResponseCurve(curve);
  }

  resetResponseCurve(): void {
    this.session.resetResponseCurve();
  }

  saveToLibrary(opts?: { id?: string | null; label?: string; asNew?: boolean }): void {
    this.session.saveToLibrary(opts);
  }

  loadFromLibrary(id: string): boolean {
    return this.session.loadFromLibrary(id);
  }

  deleteFromLibrary(id: string): void {
    this.session.deleteFromLibrary(id);
  }

  renameInLibrary(id: string, label: string): void {
    this.session.renameInLibrary(id, label);
  }

  exportSceneFile(filename?: string): void {
    this.session.exportSceneFile(filename);
  }

  importSceneFile(file: File): Promise<void> {
    return this.session.importSceneFile(file);
  }

  resetDemo(): void {
    this.session.resetDemo();
  }

  screenshot(): void {
    this.session.screenshot();
  }
}
