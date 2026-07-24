import { readFileSync, writeFileSync } from 'node:fs';

const table = JSON.parse(readFileSync('temp/_lumen_extracted.json', 'utf8'));
const keys = Object.keys(table)
  .map(Number)
  .sort((a, b) => a - b);
const lines = keys.map((k) => `  ${k}: ${table[k]},`);
const out = `/**
 * Photopic relative luminous efficacy V(λ) per nm (peak 1 at 555 nm).
 * Sourced from temp/laser_beam_and_dot_relative_brightness.js (laser beam vs dot calculator).
 */
export const PHOTOPIC_LUMINOUS_EFFICACY: Readonly<Record<number, number>> = {
${lines.join('\n')}
};

export const PHOTOPIC_NM_MIN = ${keys[0]};
export const PHOTOPIC_NM_MAX = ${keys[keys.length - 1]};
`;
writeFileSync('src/engine/physics/optics/photopic-efficacy-table.ts', out);
console.log('wrote', keys.length, 'entries');
