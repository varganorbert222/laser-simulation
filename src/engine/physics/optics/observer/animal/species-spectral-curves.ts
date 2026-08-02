/**
 * Species → monitor RGB maps (*approximated* on RGB HDR proxy).
 * Plug in via SpeciesRgbMapper when registering a new animal.
 */
import { dogConeSensitivities } from './data/dog-cone-peaks';
import type { SpeciesProfile } from './species-profile';

export type SpeciesRgbMapper = (
  r: number,
  g: number,
  b: number,
  peakWavelengthNm?: number,
) => [number, number, number];

/**
 * Dog dichromat: collapse human L/M toward shared ML + keep S (blue).
 * When λ metadata is present, weight by educational Gaussian cone peaks.
 */
export function dichromatDogRgb(
  r: number,
  g: number,
  b: number,
  peakWavelengthNm?: number,
): [number, number, number] {
  let mlW = 0.625;
  let sW = 0.35;
  if (peakWavelengthNm != null) {
    const { S, ML } = dogConeSensitivities(peakWavelengthNm);
    const sum = S + ML;
    if (sum > 1e-8) {
      sW = S / sum;
      mlW = ML / sum;
    }
  }
  const lm = mlW * (0.7 * r + 0.3 * g) + (1 - mlW) * (0.5 * r + 0.5 * g);
  const s = sW * b + (1 - sW) * (0.15 * r + 0.15 * g + 0.7 * b);
  return [lm * 0.95 + s * 0.05, lm * 0.85 + s * 0.12, s * 0.92 + lm * 0.08];
}

const SPECIES_MAPPERS = new Map<string, SpeciesRgbMapper>([['dog', dichromatDogRgb]]);

/** Register / override RGB mapper for a species id (extension hook). */
export function registerSpeciesRgbMapper(speciesId: string, mapper: SpeciesRgbMapper): void {
  SPECIES_MAPPERS.set(speciesId, mapper);
}

export function radianceToSpeciesMonitorRgb(
  profile: SpeciesProfile,
  r: number,
  g: number,
  b: number,
  peakWavelengthNm?: number,
): [number, number, number] {
  const map = SPECIES_MAPPERS.get(profile.id);
  if (map) return map(r, g, b, peakWavelengthNm);
  // Generic fallback — identity-ish with honesty tag at observer level
  return [r, g, b];
}
