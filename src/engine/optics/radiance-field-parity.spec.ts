import { describe, expect, it } from 'vitest';

import { radianceFieldGlslFunctions } from './beam-model';
import { VOLUMETRIC_FRAGMENT } from '../../adapters/babylon/shaders/volumetric-shader';

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
});
