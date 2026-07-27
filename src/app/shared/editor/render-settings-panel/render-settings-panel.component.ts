import { Component, inject } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import {
  GLOBAL_SUN_LOOK_PRESET_IDS,
  QUALITY_LADDER_ORDER,
  studioAssets,
  type FluidAdvectionMode,
  type FluidVorticityMode,
  type GlobalSunLookPresetId,
  type QualityLadder,
  type QualityPresetSelection,
  type ShadowQuality,
  type Vec3Editable,
} from '@engine';
import { EditorFacade } from '../../../core/services/editor-facade.service';
import { LocalizationService } from '../../../core/services/localization.service';
import type { LocaleKey } from '../../../i18n/messages';
import { ColorFieldComponent } from '../color-field/color-field.component';
import { Vec3FieldComponent } from '../vec3-field/vec3-field.component';

@Component({
  selector: 'app-render-settings-panel',
  standalone: true,
  imports: [DecimalPipe, ColorFieldComponent, Vec3FieldComponent],
  templateUrl: './render-settings-panel.component.html',
  styleUrl: './render-settings-panel.component.scss',
})
export class RenderSettingsPanelComponent {
  readonly editor = inject(EditorFacade);
  readonly l10n = inject(LocalizationService);
  readonly ladder = QUALITY_LADDER_ORDER;
  readonly globalSunLooks = GLOBAL_SUN_LOOK_PRESET_IDS;
  readonly skyboxIds = studioAssets.listSkyboxIds();
  readonly nightSkyTextureIds = studioAssets.listTextureIdsByUsage('equirect');
  readonly moonTextureIds = studioAssets.listTextureIdsByUsage('sprite');

  gravityDirVec(): Vec3Editable {
    const [x, y, z] = this.editor.gravityEnvironment().direction;
    return { x, y, z };
  }

  windDirVec(): Vec3Editable {
    const [x, y, z] = this.editor.windEnvironment().direction;
    return { x, y, z };
  }

  onGravityDir(v: Vec3Editable): void {
    this.editor.patchGravityEnvironment({ direction: [v.x, v.y, v.z] });
  }

  onWindDir(v: Vec3Editable): void {
    this.editor.patchWindEnvironment({ direction: [v.x, v.y, v.z] });
  }

  presetLabel(p: QualityPresetSelection): string {
    if (p === 'custom') return this.l10n.t('qualityPresetCustom');
    return p;
  }

  isActive(current: QualityPresetSelection, p: QualityLadder): boolean {
    return current === p;
  }

  setOverall(preset: QualityLadder): void {
    this.editor.setQuality(preset);
  }

  setVolumetrics(preset: QualityLadder): void {
    this.editor.setVolumetricsPreset(preset);
  }

  setFluids(preset: QualityLadder): void {
    this.editor.setFluidsPreset(preset);
  }

  setShadow(preset: QualityLadder): void {
    this.editor.setShadowPreset(preset);
  }

  setSky(preset: QualityLadder): void {
    this.editor.setAtmosphereQuality(preset);
  }

  setGlobalSunLook(preset: Exclude<GlobalSunLookPresetId, 'custom'>): void {
    this.editor.setGlobalSunLookPreset(preset);
  }

  setGlobalSunQuality(preset: QualityLadder): void {
    this.editor.setGlobalSunQualityPreset(preset);
  }

  globalSunLookLabel(id: Exclude<GlobalSunLookPresetId, 'custom'>): string {
    const keys: Record<Exclude<GlobalSunLookPresetId, 'custom'>, LocaleKey> = {
      clearAir: 'globalSunLookClearAir',
      softHaze: 'globalSunLookSoftHaze',
      godRays: 'globalSunLookGodRays',
      denseMist: 'globalSunLookDenseMist',
    };
    return this.l10n.t(keys[id]);
  }

  onNumber(
    key:
      | 'stepSize'
      | 'maxSteps'
      | 'densityThreshold'
      | 'transmittanceCut'
      | 'renderScale'
      | 'fluidGridRes'
      | 'fluidJacobiIterations'
      | 'fluidDissipation'
      | 'fluidMaxSurfaceBounces'
      | 'fluidSurfaceSamples',
    raw: string,
  ): void {
    const v = Number(raw);
    if (!Number.isFinite(v)) return;
    this.editor.patchQuality({ [key]: v });
  }

  onBool(key: 'fluidEnableRefraction', checked: boolean): void {
    this.editor.patchQuality({ [key]: checked });
  }

  onFluidAdvection(raw: string): void {
    this.editor.patchQuality({ fluidAdvectionMode: raw as FluidAdvectionMode });
  }

  onFluidVorticity(raw: string): void {
    this.editor.patchQuality({ fluidVorticityMode: raw as FluidVorticityMode });
  }

  onShadow(raw: string): void {
    this.editor.setShadowQuality(raw as ShadowQuality);
  }

  onGlobalSunNumber(
    key:
      | 'intensity'
      | 'density'
      | 'scatter'
      | 'absorption'
      | 'mieG'
      | 'mieWeight'
      | 'shaftPower'
      | 'hemiFill'
      | 'multiScatter'
      | 'maxDistance'
      | 'stepScale',
    raw: string,
  ): void {
    const v = Number(raw);
    if (!Number.isFinite(v)) return;
    this.editor.patchGlobalSunVolumetrics({ [key]: v });
  }

  onSkyNumber(
    key:
      | 'sunAngularDiameterDeg'
      | 'lutBlend'
      | 'reflectionLevel'
      | 'skyViewSamples'
      | 'transmittanceSamples'
      | 'moonAngularDiameterDeg'
      | 'nightBlendStrength',
    raw: string,
  ): void {
    const v = Number(raw);
    if (!Number.isFinite(v)) return;
    this.editor.patchAtmosphere({ [key]: v });
  }

  onSkyGroundColor(rgb: readonly [number, number, number]): void {
    this.editor.patchAtmosphere({
      skyboxGroundColor: [rgb[0], rgb[1], rgb[2]],
    });
  }

  onSkyEquatorColor(rgb: readonly [number, number, number]): void {
    this.editor.patchAtmosphere({
      skyboxEquatorColor: [rgb[0], rgb[1], rgb[2]],
    });
  }

  customHintKey(): LocaleKey {
    return 'hintQualityCustom';
  }

  skyboxLabel(id: string): string {
    return studioAssets.getSkybox(id)?.label ?? id;
  }

  textureLabel(id: string): string {
    return studioAssets.getTexture(id)?.label ?? id;
  }

  onSkyboxAsset(raw: string): void {
    const skyboxAssetId = raw.trim() ? raw.trim() : null;
    this.editor.patchAtmosphere({
      skyboxAssetId,
      ...(skyboxAssetId ? { enabled: false } : {}),
    });
  }

  onNightSkyTexture(raw: string): void {
    const id = raw.trim();
    if (!id) return;
    this.editor.patchAtmosphere({ nightSkyTextureId: id });
  }

  onMoonTexture(raw: string): void {
    const id = raw.trim();
    if (!id) return;
    this.editor.patchAtmosphere({ moonTextureId: id });
  }
}
