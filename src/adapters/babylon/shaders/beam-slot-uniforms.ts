/**
 * Shared GLSL uniform decls for packed beam-light slots.
 * Volumetric march uses `uLight*` (+ Scatter); surface radiance uses `uSr*`.
 */
export function beamSlotUniformDecls(
  slots: number,
  prefix: 'uLight' | 'uSr',
  options: { scatter?: boolean } = {},
): string {
  const lines: string[] = [];
  const scatter = options.scatter === true;
  for (let i = 0; i < slots; i++) {
    lines.push(
      `uniform vec3 ${prefix}Origin${i};`,
      `uniform vec3 ${prefix}Dir${i};`,
      `uniform vec3 ${prefix}Color${i};`,
      `uniform float ${prefix}Power${i};`,
    );
    if (scatter) {
      lines.push(`uniform float ${prefix}Scatter${i};`);
    }
    lines.push(
      `uniform float ${prefix}Mode${i};`,
      `uniform float ${prefix}P0${i};`,
      `uniform float ${prefix}P1${i};`,
      `uniform float ${prefix}P2${i};`,
      `uniform float ${prefix}P3${i};`,
      `uniform float ${prefix}P4${i};`,
      `uniform float ${prefix}P5${i};`,
      `uniform vec3 ${prefix}Spill${i};`,
    );
  }
  return lines.join('\n');
}
