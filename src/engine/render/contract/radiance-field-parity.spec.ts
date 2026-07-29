import { describe, expect, it } from 'vitest';

import { radianceFieldGlslFunctions } from './index';
import { VOLUMETRIC_FRAGMENT } from '../../../generated/shaders/volumetric_raymarch';

describe('radiance-field GLSL parity', () => {
  it('shared snippet contains core symbols', () => {
    const glsl = radianceFieldGlslFunctions();
    expect(glsl).toContain('rfEvalRadianceField');
    expect(glsl).toContain('rfEvalCore');
    expect(glsl).toContain('rfGaussianCore');
    expect(glsl).toContain('rfTem00Elliptic');
    // Mode branches: omni / cone / tube / gaussian
    expect(glsl).toContain('mode < 0.5');
    expect(glsl).toContain('mode < 1.5');
    expect(glsl).toContain('mode < 2.5');
  });

  it('volumetric fragment embeds shared radiance field', () => {
    expect(VOLUMETRIC_FRAGMENT).toContain('rfEvalRadianceField');
    expect(VOLUMETRIC_FRAGMENT).toContain('rfEvalCore');
    // Must not keep the old local duplicates as the call site.
    expect(VOLUMETRIC_FRAGMENT).not.toContain('float evalLightWithSpill(');
    expect(VOLUMETRIC_FRAGMENT).not.toContain('float evalLight(');
  });

  it('volumetric fragment supports additive multi-media Rayleigh+Mie', () => {
    expect(VOLUMETRIC_FRAGMENT).toContain('sigmaSR');
    expect(VOLUMETRIC_FRAGMENT).toContain('sigmaSM');
    // 4 GPU media slots (stable); 8 froze browsers on load.
    expect(VOLUMETRIC_FRAGMENT).toContain('uMediaCenter3');
    expect(VOLUMETRIC_FRAGMENT).not.toContain('uMediaCenter7');
    // Dual-channel in-scatter (not a single binary phase pick at the light loop).
    expect(VOLUMETRIC_FRAGMENT).toContain('sigmaSR * specR');
    expect(VOLUMETRIC_FRAGMENT).toContain('sigmaSM * specM');
  });

  it('volumetric fragment lights media from environment + multi-scatter', () => {
    expect(VOLUMETRIC_FRAGMENT).toContain('uEnvHemi');
    expect(VOLUMETRIC_FRAGMENT).toContain('uEnvSun');
    expect(VOLUMETRIC_FRAGMENT).toContain('uVolumeMultiScatter');
    expect(VOLUMETRIC_FRAGMENT).toContain('omega0');
  });
});
