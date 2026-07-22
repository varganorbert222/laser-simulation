import { Injectable, computed, inject } from '@angular/core';
import {
  ALL_LIGHT_MODES,
  POWER_PRESETS_W,
  buildScienceReadout,
  clampIntensityLm,
  clampPowerW,
  collectComponentValues,
  defaultHdrAppearance,
  defaultModeParams,
  estimateIntensityLmFromSpectral,
  fieldStateJson,
  isSpectralLightMode,
  isSuppressedSunEntity,
  refreshSceneSunBinding,
  restoreWorldFromSerialized,
  selectionHasComponent,
  setLightEmitterCommand,
  wavelengthToRgb,
  wouldSuppressAdditionalSun,
  type LightEmitter,
  type LightMode,
} from '../../../engine';
import { EngineHostService } from '../services/engine-host.service';
import { SelectionService } from './selection.service';
import { HierarchyEditorService } from './hierarchy-editor.service';
import { LocalizationService } from '../services/localization.service';

@Injectable({ providedIn: 'root' })
export class LightEditorService {
  private readonly engine = inject(EngineHostService);
  private readonly selection = inject(SelectionService);
  private readonly hierarchy = inject(HierarchyEditorService);
  private readonly l10n = inject(LocalizationService);

  readonly powerPresets = POWER_PRESETS_W;
  readonly lightModes = ALL_LIGHT_MODES;

  /** Display light when all selected have LightEmitter (primary values if mixed). */
  readonly selectedLight = computed(() => {
    this.engine.epoch();
    const ids = this.selection.selectedIds();
    const world = this.engine.world();
    if (!selectionHasComponent(world, ids, 'LightEmitter')) return null;
    const values = collectComponentValues(world, ids, 'LightEmitter');
    return values[0] ?? null;
  });

  /** True when all selected have LightEmitter but values differ (section disabled). */
  readonly selectedLightMixed = computed(() => {
    this.engine.epoch();
    const ids = this.selection.selectedIds();
    const world = this.engine.world();
    if (!selectionHasComponent(world, ids, 'LightEmitter')) return false;
    return fieldStateJson(collectComponentValues(world, ids, 'LightEmitter')).kind === 'mixed';
  });

  /** Selected entity is an extra sun (not rendered as key light). */
  readonly selectedSunSuppressed = computed(() => {
    this.engine.epoch();
    const id = this.selection.selectedId();
    if (!id) return false;
    return isSuppressedSunEntity(this.engine.world(), id);
  });

  readonly scienceReadout = computed(() => {
    const light = this.selectedLight();
    const id = this.selection.selectedId();
    const fallback =
      light ??
      (id ? this.engine.world().get(id, 'LightEmitter') : null);
    if (!fallback) return null;
    this.engine.epoch();
    const vision = this.engine.world().resources.DisplayVision;
    const env = this.engine.world().resources.EnvironmentLighting;
    return buildScienceReadout({
      wavelengthNm: fallback.wavelengthNm,
      powerW: fallback.powerW,
      params: fallback.params,
      spill: fallback.spill,
      colorRgb: fallback.colorRgb,
      intensityLm: fallback.intensityLm,
      useColorTemperature: fallback.useColorTemperature,
      colorTemperatureK: fallback.colorTemperatureK,
      vision: {
        ambientLevel: env.ambientLevel,
        responseCurve: vision.responseCurve,
      },
    });
  });

  updateLight(patch: Partial<LightEmitter>, opts?: { coalesce?: boolean }): void {
    const ids = this.selection.selectedIds().filter((id) =>
      this.engine.world().has(id, 'LightEmitter'),
    );
    if (!ids.length) return;
    const world = this.engine.world();

    if (ids.length === 1) {
      const id = ids[0]!;
      const before = world.get(id, 'LightEmitter');
      if (!before) return;
      const after = mergeLight(before, patch);
      if (opts?.coalesce) {
        this.engine.coalesceSnapshot({
          key: `LightEmitter:${id}`,
          label: 'Fény paraméterek',
          before,
          after,
          apply: (v) => {
            world.set(id, 'LightEmitter', structuredClone(v));
            refreshSceneSunBinding(world);
          },
        });
        return;
      }
      this.engine.executeCommand(setLightEmitterCommand(world, id, before, after));
      refreshSceneSunBinding(world);
      return;
    }

    const beforeSnap = world.cloneSerializable();
    for (const id of ids) {
      const before = world.get(id, 'LightEmitter');
      if (!before) continue;
      world.set(id, 'LightEmitter', mergeLight(before, patch));
    }
    refreshSceneSunBinding(world);
    const afterSnap = world.cloneSerializable();
    if (opts?.coalesce) {
      this.engine.coalesceSnapshot({
        key: `LightEmitter:multi:${ids.join(',')}`,
        label: `Fény (${ids.length})`,
        before: beforeSnap,
        after: afterSnap,
        apply: (v) => {
          restoreWorldFromSerialized(world, v);
        },
      });
      return;
    }
    this.engine.executeCommand({
      label: `Fény (${ids.length})`,
      execute: () => restoreWorldFromSerialized(world, afterSnap),
      undo: () => restoreWorldFromSerialized(world, beforeSnap),
    });
  }

  setLightMode(mode: LightMode): void {
    const ids = this.selection.selectedIds().filter((id) =>
      this.engine.world().has(id, 'LightEmitter'),
    );
    if (!ids.length) return;
    const world = this.engine.world();
    let warn = false;
    if (mode === 'sun') {
      for (const id of ids) {
        if (wouldSuppressAdditionalSun(world, id)) warn = true;
      }
    }

    const primary = world.get(ids[0]!, 'LightEmitter');
    const patch: Partial<LightEmitter> = { params: defaultModeParams(mode) };
    if (primary && isSpectralLightMode(primary.params.mode) && !isSpectralLightMode(mode)) {
      const hdr = defaultHdrAppearance(mode);
      patch.colorRgb = wavelengthToRgb(primary.wavelengthNm) as [number, number, number];
      patch.intensityLm = estimateIntensityLmFromSpectral(
        primary.powerW,
        primary.wavelengthNm,
      );
      patch.useColorTemperature = false;
      patch.colorTemperatureK = hdr.colorTemperatureK;
    } else if (primary && !isSpectralLightMode(primary.params.mode) && isSpectralLightMode(mode)) {
      // Keep wavelengthNm / powerW; HDR fields remain for round-trip.
    } else if (mode === 'sun' && primary && primary.params.mode !== 'sun') {
      const hdr = defaultHdrAppearance('sun');
      if (!primary.useColorTemperature && primary.intensityLm < 10_000) {
        patch.intensityLm = hdr.intensityLm;
        patch.useColorTemperature = hdr.useColorTemperature;
        patch.colorTemperatureK = hdr.colorTemperatureK;
        patch.colorRgb = hdr.colorRgb;
      }
    }

    this.updateLight(patch);
    refreshSceneSunBinding(world);
    if (warn) {
      this.hierarchy.showNotice(this.l10n.t('warnSecondSun'));
    }
  }

  setWavelength(nm: number): void {
    this.updateLight({ wavelengthNm: nm }, { coalesce: true });
  }

  setPower(powerW: number): void {
    this.updateLight({ powerW: clampPowerW(powerW) }, { coalesce: true });
  }

  setIntensityLm(intensityLm: number): void {
    this.updateLight({ intensityLm: clampIntensityLm(intensityLm) }, { coalesce: true });
  }
}

function mergeLight(before: LightEmitter, patch: Partial<LightEmitter>): LightEmitter {
  return {
    ...structuredClone(before),
    ...patch,
    params: patch.params ? structuredClone(patch.params) : structuredClone(before.params),
    colorRgb: patch.colorRgb
      ? ([...patch.colorRgb] as [number, number, number])
      : ([...before.colorRgb] as [number, number, number]),
    spill: patch.spill
      ? {
          ...before.spill,
          ...patch.spill,
        }
      : structuredClone(before.spill),
  };
}
