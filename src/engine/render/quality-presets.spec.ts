import { describe, expect, it } from 'vitest';
import {
  applyVolumetricsPreset,
  createQuality,
  normalizeQualityResource,
  refreshQualityPresets,
  resolveOverallPreset,
  skyAllowsHdrColors,
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

  it('defaults to HDR + gamma 2.2 color settings', () => {
    const q = createQuality('medium');
    expect(q.colorProfile).toBe('hdr');
    expect(q.outputGamma).toBe(2.2);
    expect(skyAllowsHdrColors(q.colorProfile)).toBe(true);
    expect(skyAllowsHdrColors('sdr')).toBe(false);
  });

  it('createQuality can preserve color profile and gamma', () => {
    const q = createQuality('ultra', { colorProfile: 'sdr', outputGamma: 2.4 });
    expect(q.overallPreset).toBe('ultra');
    expect(q.colorProfile).toBe('sdr');
    expect(q.outputGamma).toBe(2.4);
  });

  it('migrates legacy colorSpace into outputGamma', () => {
    const fromLinear = normalizeQualityResource({ colorSpace: 'linear' } as never);
    expect(fromLinear.outputGamma).toBe(2.2);
    const fromGamma = normalizeQualityResource({ colorSpace: 'gamma' } as never);
    expect(fromGamma.outputGamma).toBe(1);
  });

  it('resolveOverallPreset requires unanimous ladder', () => {
    expect(resolveOverallPreset(['high', 'high', 'high'])).toBe('high');
    expect(resolveOverallPreset(['high', 'medium', 'high'])).toBe('custom');
    expect(resolveOverallPreset(['high', 'custom', 'high'])).toBe('custom');
  });
});
