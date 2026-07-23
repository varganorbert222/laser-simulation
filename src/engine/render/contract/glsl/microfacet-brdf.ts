/** GLSL twin shared by SurfaceRadiancePlugin. */
import { MICROFACET_BRDF_GLSL } from '../../../../generated/shaders/microfacet_brdf';

export function microfacetBrdfGlslFunctions(): string {
  return MICROFACET_BRDF_GLSL;
}
