import { describe, expect, it } from 'vitest';
import {
  applyVolumetricsPreset,
  createQuality,
  refreshQualityPresets,
  resolveOverallPreset,
} from './quality';

describe('quality section presets', () => {
  it('createQuality aligns overall and all sections', () => {
    const q = createQuality('high');
    expect(q.overallPreset).toBe('high');
    expect(q.volumetricsPreset).toBe('high');
    expect(q.shadowPreset).toBe('high');
    expect(q.presentationPreset).toBe('high');
    expect(q.preset).toBe('high');
    expect(q.shadowQuality).toBe('medium');
  });

  it('overall becomes custom when a section diverges', () => {
    const base = createQuality('medium');
    const next = applyVolumetricsPreset(base, 'ultra', 'medium');
    expect(next.volumetricsPreset).toBe('ultra');
    expect(next.shadowPreset).toBe('medium');
    expect(next.overallPreset).toBe('custom');
  });

  it('tweaking a field marks volumetrics + overall custom', () => {
    const q = createQuality('medium');
    const tweaked = refreshQualityPresets(
      { ...q, stepSize: 0.11 },
      'medium',
    );
    expect(tweaked.volumetricsPreset).toBe('custom');
    expect(tweaked.overallPreset).toBe('custom');
  });

  it('resolveOverallPreset requires unanimous ladder', () => {
    expect(resolveOverallPreset(['high', 'high', 'high'])).toBe('high');
    expect(resolveOverallPreset(['high', 'medium', 'high'])).toBe('custom');
    expect(resolveOverallPreset(['high', 'custom', 'high'])).toBe('custom');
  });
});
