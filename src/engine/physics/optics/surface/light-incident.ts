/**
 * Unity-like incident light direction for surface BRDF.
 *
 * Irradiance / beam profile comes from BeamModel (`rfEvalRadianceField`).
 * This module only chooses the unit vector L used in n·L and the half-vector —
 * the same convention as Unity Point / Spot / Directional lights.
 *
 * GPU mode codes (uniform uLightMode / uSrMode):
 *   0 omni     → Point
 *   1 cone     → Spot  (angular mask stays in the radiance field)
 *   2 tube     → Directional
 *   3 gaussian → Directional (collimated laser)
 */

export type IncidentLightClass = 'point' | 'spot' | 'directional';

export function incidentClassFromBeamMode(mode: number): IncidentLightClass {
  if (mode < 0.5) return 'point';
  if (mode < 1.5) return 'spot';
  return 'directional';
}

/**
 * Unit vector from surface toward the light (incoming opposite to photon travel).
 */
export function incidentLightDirection(
  worldPos: readonly [number, number, number],
  origin: readonly [number, number, number],
  beamDir: readonly [number, number, number],
  mode: number,
): [number, number, number] {
  const cls = incidentClassFromBeamMode(mode);
  if (cls === 'directional') {
    const len = Math.hypot(beamDir[0], beamDir[1], beamDir[2]) || 1;
    return [-beamDir[0] / len, -beamDir[1] / len, -beamDir[2] / len];
  }
  // Point + Spot: from hit toward emitter (Unity PointLight / SpotLight).
  const dx = origin[0] - worldPos[0];
  const dy = origin[1] - worldPos[1];
  const dz = origin[2] - worldPos[2];
  const len = Math.hypot(dx, dy, dz) || 1;
  return [dx / len, dy / len, dz / len];
}
