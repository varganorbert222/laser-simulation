/** Shared GLSL for evalRadianceField (volumetric + surface plugin). */
import { RADIANCE_FIELD_GLSL } from '../../../../generated/shaders/radiance_field';

export function radianceFieldGlslFunctions(): string {
  return RADIANCE_FIELD_GLSL;
}
