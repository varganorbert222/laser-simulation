import { describe, expect, it } from 'vitest';
import {
  AUTO_EXPOSURE_KEY,
  AUTO_EXPOSURE_MAX,
  AUTO_EXPOSURE_MIN,
  MANUAL_HDR_EXPOSURE,
  MANUAL_SDR_EXPOSURE,
  exposureFromAvgLuminance,
  manualComposeExposure,
  smoothExposure,
} from './auto-exposure';

describe('auto-exposure', () => {
  it('raises exposure for dark frames and lowers it for bright ones', () => {
    const dark = exposureFromAvgLuminance(0.01, AUTO_EXPOSURE_KEY);
    const bright = exposureFromAvgLuminance(2.0, AUTO_EXPOSURE_KEY);
    expect(dark).toBeGreaterThan(bright);
    expect(dark).toBeLessThanOrEqual(AUTO_EXPOSURE_MAX);
    expect(bright).toBeGreaterThanOrEqual(AUTO_EXPOSURE_MIN);
  });

  it('targets middle grey key / avgLum', () => {
    expect(exposureFromAvgLuminance(AUTO_EXPOSURE_KEY)).toBeCloseTo(1, 5);
  });

  it('smooths temporally toward the target', () => {
    const next = smoothExposure(1, 3, 0.5);
    expect(next).toBeCloseTo(2, 5);
  });

  it('preserves manual HDR vs SDR compose baselines', () => {
    expect(manualComposeExposure('hdr')).toBe(MANUAL_HDR_EXPOSURE);
    expect(manualComposeExposure('sdr')).toBe(MANUAL_SDR_EXPOSURE);
  });
});
