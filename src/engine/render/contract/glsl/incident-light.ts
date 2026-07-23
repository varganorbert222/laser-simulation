/** GLSL twin of incidentLightDirection (srLightDir). */
export function incidentLightDirGlsl(): string {
  return `
// Unity-like L: Point/Spot from emitter; Directional (tube/laser) = -beamDir.
vec3 srLightDir(vec3 worldPos, vec3 o, vec3 dIn, float mode) {
  if (mode < 1.5) {
    // 0 = Point (omni), 1 = Spot (cone)
    vec3 toLight = o - worldPos;
    float len = length(toLight);
    if (len < 1e-6) return normalize(-dIn);
    return toLight / len;
  }
  // 2 = Directional tube, 3 = Directional laser
  return normalize(-dIn);
}
`;
}
