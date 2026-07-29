import { describe, expect, it } from 'vitest';
import { createDemoWorld } from '../../scene/demo-world';
import { gatherRenderPack } from '../../render/pack';
import {
  applyGlobalSunLookPreset,
  applyGlobalSunQualityPreset,
  createDefaultGlobalSunVolumetrics,
  createGlobalSunVolumetricsForQuality,
  globalSunLookTuneForPreset,
  globalSunQualityTuneForPreset,
  matchGlobalSunLookPreset,
  matchGlobalSunQualityPreset,
  normalizeGlobalSunVolumetrics,
} from './global-sun-volumetrics';

describe('global sun volumetrics', () => {
  it('defaults to softHaze look + medium quality', () => {
    const gs = createDefaultGlobalSunVolumetrics();
    expect(gs.enabled).toBe(true);
    expect(gs.lookPreset).toBe('softHaze');
    expect(gs.qualityPreset).toBe('medium');
    expect(gs.density).toBeGreaterThan(0);
    expect(gs.stepScale).toBe(1);
  });

  it('look presets pack optical fields and rematch', () => {
    const base = createDefaultGlobalSunVolumetrics();
    const god = applyGlobalSunLookPreset(base, 'godRays');
    expect(god.lookPreset).toBe('godRays');
    expect(god.shaftPower).toBe(globalSunLookTuneForPreset('godRays').shaftPower);
    expect(matchGlobalSunLookPreset(god)).toBe('godRays');

    const custom = normalizeGlobalSunVolumetrics({ ...god, intensity: 2.5 });
    expect(custom.lookPreset).toBe('custom');
  });

  it('quality presets pack maxDistance/stepScale and rematch', () => {
    const base = createDefaultGlobalSunVolumetrics();
    const ultra = applyGlobalSunQualityPreset(base, 'ultra');
    expect(ultra.qualityPreset).toBe('ultra');
    expect(ultra.maxDistance).toBe(globalSunQualityTuneForPreset('ultra').maxDistance);
    expect(ultra.stepScale).toBe(globalSunQualityTuneForPreset('ultra').stepScale);
    expect(matchGlobalSunQualityPreset(ultra)).toBe('ultra');
    expect(ultra.lookPreset).toBe(base.lookPreset);
  });

  it('overall quality helper preserves look', () => {
    const look = applyGlobalSunLookPreset(createDefaultGlobalSunVolumetrics(), 'denseMist');
    const aligned = createGlobalSunVolumetricsForQuality('high', look);
    expect(aligned.lookPreset).toBe('denseMist');
    expect(aligned.qualityPreset).toBe('high');
  });

  it('packs global sun settings into RenderFrame', () => {
    const world = createDemoWorld();
    world.resources.GlobalSunVolumetrics = normalizeGlobalSunVolumetrics({
      enabled: true,
      intensity: 1.5,
      density: 0.02,
      stepScale: 0.75,
    });
    const pack = gatherRenderPack(world);
    expect(pack.globalSun.enabled).toBe(1);
    expect(pack.globalSun.intensity).toBeCloseTo(1.5);
    expect(pack.globalSun.density).toBeCloseTo(0.02);
    expect(pack.globalSun.stepScale).toBeCloseTo(0.75);
  });

  it('packs disabled flag when toggled off', () => {
    const world = createDemoWorld();
    world.resources.GlobalSunVolumetrics = normalizeGlobalSunVolumetrics({
      enabled: false,
    });
    const pack = gatherRenderPack(world);
    expect(pack.globalSun.enabled).toBe(0);
  });
});
