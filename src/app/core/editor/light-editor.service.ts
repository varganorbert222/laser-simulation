import { Injectable, computed, inject } from '@angular/core';
import {
  ALL_LIGHT_MODES,
  POWER_PRESETS_W,
  buildScienceReadout,
  clampIntensityLm,
  clampPowerW,
  defaultHdrAppearance,
  defaultModeParams,
  estimateIntensityLmFromSpectral,
  isSpectralLightMode,
  isSuppressedSunEntity,
  refreshSceneSunBinding,
  resolveVisionBrightnessOpts,
  setLightEmitterCommand,
  wavelengthToRgb,
  wouldSuppressAdditionalSun,
  writeLightEmitter,
  type LightEmitter,
  type LightMode,
} from '@engine';
import { EngineHostService } from '../services/engine-host.service';
import { SelectionService } from './selection.service';
import { HierarchyEditorService } from './hierarchy-editor.service';
import { LocalizationService } from '../services/localization.service';
import {
  patchSelectedComponents,
  resolvePatchTargetIds,
  selectionComponentMixed,
  selectionComponentPrimary,
} from './patch-component';

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
    this.engine.selectionRevision();
    return selectionComponentPrimary(
      this.engine.world(),
      this.selection.selectedIds(),
      'LightEmitter',
    );
  });

  /** True when all selected have LightEmitter but values differ (section disabled). */
  readonly selectedLightMixed = computed(() => {
    this.engine.epoch();
    this.engine.selectionRevision();
    return selectionComponentMixed(
      this.engine.world(),
      this.selection.selectedIds(),
      'LightEmitter',
    );
  });

  /** Selected entity is an extra sun (not rendered as key light). */
  readonly selectedSunSuppressed = computed(() => {
    this.engine.epoch();
    this.engine.selectionRevision();
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
    const atmo = this.engine.world().resources.Atmosphere;
    return buildScienceReadout({
      wavelengthNm: fallback.wavelengthNm,
      powerW: fallback.powerW,
      params: fallback.params,
      spill: fallback.spill,
      colorRgb: fallback.colorRgb,
      intensityLm: fallback.intensityLm,
      useColorTemperature: fallback.useColorTemperature,
      colorTemperatureK: fallback.colorTemperatureK,
      vision: resolveVisionBrightnessOpts(env.ambientLevel, atmo, vision.responseCurve),
    });
  });

  updateLight(
    patch: Partial<LightEmitter>,
    opts?: { coalesce?: boolean; entityIds?: readonly string[] },
  ): void {
    const world = this.engine.world();
    const ids = resolvePatchTargetIds(
      world,
      'LightEmitter',
      opts?.entityIds ?? this.selection.selectedIds(),
    );
    patchSelectedComponents({
      engine: this.engine,
      ids,
      component: 'LightEmitter',
      label: 'Fény paraméterek',
      multiLabel: `Fény (${ids.length})`,
      coalesce: opts?.coalesce,
      writeComponent: writeLightEmitter,
      merge: (before) => mergeLight(before, patch),
      singleCommand: setLightEmitterCommand,
      afterApply: refreshSceneSunBinding,
    });
  }

  setLightMode(mode: LightMode, opts?: { entityIds?: readonly string[] }): void {
    const world = this.engine.world();
    const ids = resolvePatchTargetIds(
      world,
      'LightEmitter',
      opts?.entityIds ?? this.selection.selectedIds(),
    );
    if (!ids.length) return;
    let warn = false;
    if (mode === 'sun') {
      for (const id of ids) {
        if (wouldSuppressAdditionalSun(world, id)) warn = true;
      }
    }

    const primary = world.get(ids[0]!, 'LightEmitter');
    if (primary?.params.mode === mode) return;

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

    this.updateLight(patch, { entityIds: ids });
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
