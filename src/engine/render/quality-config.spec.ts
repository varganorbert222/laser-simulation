import { describe, expect, it } from 'vitest';
import {
  configureQualityRenderScale,
  createQuality,
  getQualityRenderScaleConfig,
  renderScaleForPreset,
} from './quality';

describe('quality render scale', () => {
  it('maps Low→min and Ultra→max with linear midpoints', () => {
    configureQualityRenderScale({ renderScaleMin: 0.25, renderScaleMax: 0.5 });
    expect(renderScaleForPreset('low')).toBeCloseTo(0.25);
    expect(renderScaleForPreset('ultra')).toBeCloseTo(0.5);
    expect(renderScaleForPreset('medium')).toBeCloseTo(0.25 + (0.5 - 0.25) / 3);
    expect(renderScaleForPreset('high')).toBeCloseTo(0.25 + (2 * (0.5 - 0.25)) / 3);
    expect(createQuality('ultra').renderScale).toBeCloseTo(0.5);
    expect(createQuality('medium').antiAliasing).toBe(true);
    expect(createQuality('medium').theatricalGlow).toBe(false);
    expect(createQuality('medium').tonemapMode).toBe('aces');
  });

  it('clamps and orders min/max from config', () => {
    configureQualityRenderScale({ renderScaleMin: 0.6, renderScaleMax: 0.2 });
    const cfg = getQualityRenderScaleConfig();
    expect(cfg.renderScaleMin).toBeCloseTo(0.2);
    expect(cfg.renderScaleMax).toBeCloseTo(0.6);
    configureQualityRenderScale({ renderScaleMin: 0.25, renderScaleMax: 0.5 });
  });
});
