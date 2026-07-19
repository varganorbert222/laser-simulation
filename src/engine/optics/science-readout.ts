import {
  beamRadiusAt,
  divergenceMrad,
  rayleighRange,
} from './laser';
import type { ModeParams } from './modes';
import {
  eyeAdaptationGainFromAmbient,
  laserBeamLuminousProduct,
  laserDotDisplayBrightness,
  laserDotLuminousProduct,
  photopicLuminousEfficacy,
  relativeBeamBrightness,
  relativeDotBrightness,
  type VisionBrightnessOpts,
} from './laser-brightness';
import { ENVIRONMENT_AMBIENT_DEFAULT } from './environment-lighting';
import {
  deriveFromWavelengthNm,
  rayleighScatterWeight,
  wavelengthToRgb,
} from './wavelength';
import type { OpticsSpillParams } from './optics-spill';
import { hasOpticsSpill, normalizeOpticsSpill } from './optics-spill';

export type {
  LaserParams,
  LightMode,
  ModeParams,
  OmniParams,
  ParallelParams,
  SpotParams,
} from './modes';

/** Classic calculator reference: 1 mW at photopic peak (V≈1). */
export const RELATIVE_BRIGHTNESS_REF_PHOTOPIC = {
  powerW: 0.001,
  wavelengthNm: 555,
} as const;

/** Pointer-class green anchor used in educational notes. */
export const RELATIVE_BRIGHTNESS_REF_POINTER = {
  powerW: 0.005,
  wavelengthNm: 532,
} as const;

export function relativeBrightnessReference(): {
  powerW: number;
  wavelengthNm: number;
} {
  return { ...RELATIVE_BRIGHTNESS_REF_PHOTOPIC };
}

export interface LightEmitterInput {
  wavelengthNm: number;
  powerW: number;
  params: ModeParams;
  spill?: OpticsSpillParams;
  vision?: VisionBrightnessOpts | null;
}

export interface ScienceQuantity {
  id: string;
  label: string;
  value: string;
  unit: string;
  kind: 'calculated' | 'approximated';
  note?: string;
}

export interface ScienceReadout {
  insight: string;
  formula: string;
  example?: string;
  quantities: ScienceQuantity[];
  rgb: readonly [number, number, number];
  scatterWeight: number;
  displayBrightness: number;
  safetyNote?: string;
}

function fmt(n: number, digits = 3): string {
  if (!Number.isFinite(n)) return '—';
  if (Math.abs(n) >= 1e4 || (Math.abs(n) > 0 && Math.abs(n) < 1e-3)) {
    return n.toExponential(digits);
  }
  return n.toPrecision(digits);
}

export function buildScienceReadout(input: LightEmitterInput): ScienceReadout {
  const derived = deriveFromWavelengthNm(input.wavelengthNm);
  const rgb = wavelengthToRgb(input.wavelengthNm);
  const scatterWeight = rayleighScatterWeight(input.wavelengthNm);
  const ambient = input.vision?.ambientLevel ?? ENVIRONMENT_AMBIENT_DEFAULT;
  const V = photopicLuminousEfficacy(input.wavelengthNm);
  const adapt = eyeAdaptationGainFromAmbient(ambient);
  const dotLuminous = laserDotLuminousProduct(input.powerW, input.wavelengthNm, ambient);
  const beamLuminous = laserBeamLuminousProduct(input.powerW, input.wavelengthNm, 550, ambient);
  const displayBrightness = laserDotDisplayBrightness(
    input.powerW,
    input.wavelengthNm,
    input.vision,
  );
  const self = { powerW: input.powerW, wavelengthNm: input.wavelengthNm };
  const refPeak = relativeBrightnessReference();
  const refPointer = RELATIVE_BRIGHTNESS_REF_POINTER;
  const relDotPeak = relativeDotBrightness(self, refPeak, ambient);
  const relBeamPeak = relativeBeamBrightness(self, refPeak, ambient);
  const relDotPointer = relativeDotBrightness(self, refPointer, ambient);
  const relBeamPointer = relativeBeamBrightness(self, refPointer, ambient);
  const spill = normalizeOpticsSpill(input.spill);

  const quantities: ScienceQuantity[] = [
    {
      id: 'lambda',
      label: 'λ',
      value: fmt(input.wavelengthNm, 4),
      unit: 'nm',
      kind: 'calculated',
    },
    {
      id: 'f',
      label: 'f',
      value: fmt(derived.frequencyTHz, 4),
      unit: 'THz',
      kind: 'calculated',
      note: `${fmt(derived.frequencyHz, 4)} Hz`,
    },
    {
      id: 'k',
      label: 'k̃',
      value: fmt(derived.wavenumberPerCm, 4),
      unit: 'cm⁻¹',
      kind: 'calculated',
      note: `${fmt(derived.wavenumberPerM, 4)} m⁻¹`,
    },
    {
      id: 'E',
      label: 'E = hf',
      value: fmt(derived.energyEv, 4),
      unit: 'eV',
      kind: 'calculated',
      note: `${fmt(derived.energyJ, 4)} J`,
    },
    {
      id: 'P',
      label: 'P',
      value: fmt(input.powerW, 4),
      unit: 'W',
      kind: 'calculated',
    },
    {
      id: 'rgb',
      label: 'RGB',
      value: rgb.map((c) => c.toFixed(2)).join(', '),
      unit: '',
      kind: 'approximated',
      note: 'kijelző-leképezés',
    },
    {
      id: 'Vlambda',
      label: 'V(λ)',
      value: fmt(V, 4),
      unit: '',
      kind: 'approximated',
      note: 'CIE fotopikus fényhasznosítás (555 nm = 1)',
    },
    {
      id: 'ambient',
      label: 'Environment',
      value: fmt(ambient, 3),
      unit: '',
      kind: 'approximated',
      note: 'környezeti fény 0=sötét lab · 1=nappali fill',
    },
    {
      id: 'eyeExposure',
      label: 'Szem exposure',
      value: fmt(adapt, 3),
      unit: '×',
      kind: 'approximated',
      note: 'sötétadaptáció a környezeti fényből (fordított ambient)',
    },
    {
      id: 'dotLum',
      label: 'Pont fényerő',
      value: fmt(dotLuminous, 3),
      unit: 'mW·V',
      kind: 'approximated',
      note: 'P(mW)·V(λ)·exposure(ambient)',
    },
    {
      id: 'beamLum',
      label: 'Nyaláb fényerő',
      value: fmt(beamLuminous, 3),
      unit: 'mW·V·λ⁻⁴',
      kind: 'approximated',
      note: 'P(mW)·V(λ)·exposure·(550/λ)⁴',
    },
    {
      id: 'relDotPeak',
      label: 'Rel. pont',
      value: fmt(relDotPeak, 3),
      unit: '×',
      kind: 'approximated',
      note: `vs ${fmt(refPeak.powerW * 1000, 3)} mW @ ${refPeak.wavelengthNm} nm · (P·V)_a / (P·V)_b`,
    },
    {
      id: 'relBeamPeak',
      label: 'Rel. nyaláb',
      value: fmt(relBeamPeak, 3),
      unit: '×',
      kind: 'approximated',
      note: `vs ${fmt(refPeak.powerW * 1000, 3)} mW @ ${refPeak.wavelengthNm} nm · pont × (λ_b/λ_a)⁴`,
    },
    {
      id: 'relDotPointer',
      label: 'Rel. pont (532 nm 5 mW)',
      value: fmt(relDotPointer, 3),
      unit: '×',
      kind: 'approximated',
      note: 'vs 5 mW @ 532 nm pointer — hullámhosszok egymáshoz képest',
    },
    {
      id: 'relBeamPointer',
      label: 'Rel. nyaláb (532 nm 5 mW)',
      value: fmt(relBeamPointer, 3),
      unit: '×',
      kind: 'approximated',
      note: 'ködben: pontarány × Rayleigh (λ_ref/λ)⁴',
    },
    {
      id: 'display',
      label: 'Kijelző fényerő',
      value: fmt(displayBrightness, 3),
      unit: '',
      kind: 'approximated',
      note: 'response curve a pont fényerőből (nem lineáris a relatív arányhoz)',
    },
    {
      id: 'scatter',
      label: 'Szórási súly',
      value: fmt(scatterWeight, 3),
      unit: '',
      kind: 'approximated',
      note: '∝ λ⁻ⁿ a közeg modelljétől (Rayleigh n=4, Tyndall n≈0)',
    },
  ];

  if (hasOpticsSpill(spill)) {
    quantities.push({
      id: 'stray',
      label: 'Stray power fraction',
      value: fmt(spill.strayPowerFraction, 3),
      unit: '',
      kind: 'approximated',
      note: 'energia-konzisztens residual: core×(1−f), széles lebeny×f',
    });
  }

  let insight =
    'A hullámhossz meghatározza a frekvenciát és a fotonenergiát; a szín a kijelző-leképezés eredménye.';
  let formula = 'f = c / λ ·  E = h f';
  let example: string | undefined;
  let safetyNote: string | undefined;

  switch (input.params.mode) {
    case 'omni_lamp': {
      const { softRadiusM, falloff } = input.params.omni;
      quantities.push(
        {
          id: 'softR',
          label: 'Lágy sugár',
          value: fmt(softRadiusM, 3),
          unit: 'm',
          kind: 'calculated',
        },
        {
          id: 'falloff',
          label: 'Csökkenés',
          value: fmt(falloff, 3),
          unit: '',
          kind: 'calculated',
        },
      );
      insight = 'Omni lámpa: minden irányba sugárzik, lágy távolság-csökkenéssel.';
      formula = 'I(r) ∝ 1 / (1 + (r/R)^n)';
      break;
    }
    case 'spotlight': {
      const { innerConeDeg, outerConeDeg, apertureSharpness } = input.params.spot;
      quantities.push(
        {
          id: 'inner',
          label: 'Belső kúp',
          value: fmt(innerConeDeg, 3),
          unit: '°',
          kind: 'calculated',
        },
        {
          id: 'outer',
          label: 'Külső kúp',
          value: fmt(outerConeDeg, 3),
          unit: '°',
          kind: 'calculated',
        },
        {
          id: 'aperture',
          label: 'Apertúra',
          value: fmt(apertureSharpness, 3),
          unit: '',
          kind: 'calculated',
        },
      );
      insight = 'Spotlight: irányított kúp; a köd teszi láthatóvá a sugarat.';
      formula = 'θ_inner → θ_outer falloff';
      break;
    }
    case 'parallel': {
      const { beamRadiusM, residualMrad } = input.params.parallel;
      quantities.push(
        {
          id: 'rBeam',
          label: 'Nyaláb sugár',
          value: fmt(beamRadiusM, 4),
          unit: 'm',
          kind: 'calculated',
        },
        {
          id: 'mrad',
          label: 'Maradék divergencia',
          value: fmt(residualMrad, 3),
          unit: 'mrad',
          kind: 'calculated',
        },
      );
      insight = 'Kollimált nyaláb: közel állandó sugár, kis maradék divergenciával.';
      formula = 'w(z) ≈ w₀ + θ·z';
      break;
    }
    case 'laser': {
      const laser = input.params.laser;
      const { w0M, m2, probeDistanceM, ellipticRatio, waistOffsetM } = laser;
      const lambdaM = input.wavelengthNm * 1e-9;
      const zR = rayleighRange(w0M, lambdaM, m2);
      const wAtZ = beamRadiusAt(w0M, zR, probeDistanceM - waistOffsetM);
      const divMrad = divergenceMrad(w0M, lambdaM, m2);
      quantities.push(
        {
          id: 'w0',
          label: 'w₀',
          value: fmt(w0M, 4),
          unit: 'm',
          kind: 'calculated',
        },
        {
          id: 'm2',
          label: 'M²',
          value: fmt(m2, 3),
          unit: '',
          kind: 'calculated',
          note: 'nyaláb minőség (≥1)',
        },
        {
          id: 'zR',
          label: 'z_R',
          value: fmt(zR, 4),
          unit: 'm',
          kind: 'calculated',
        },
        {
          id: 'wZ',
          label: `w(z=${fmt(probeDistanceM, 3)} m)`,
          value: fmt(wAtZ, 4),
          unit: 'm',
          kind: 'calculated',
        },
        {
          id: 'div',
          label: 'Divergencia',
          value: fmt(divMrad, 3),
          unit: 'mrad',
          kind: 'calculated',
          note: '≈ M² λ/(π w₀)',
        },
        {
          id: 'ellip',
          label: 'Ellipticitás wy/wx',
          value: fmt(ellipticRatio, 3),
          unit: '',
          kind: 'calculated',
        },
      );
      insight =
        'Lézer: Gauss TEM00 (exp(−2r²/w²)), étendue-normált irradiance. Relatív pont fényerő ∝ P·V(λ); relatív nyaláb ∝ P·V(λ)·(550/λ)⁴ ' +
        '(Laser Beam and Dot Relative Brightness). Szem exposure a környezeti fényből. ' +
        (hasOpticsSpill(spill)
          ? 'Stray / belső reflexió / aperture spill a fő nyaláb körül látható mezőt ad.'
          : '');
      formula =
        'E(r)=2P/(πw²)·exp(−2r²/w²) · BRDF(GGX); relDot = (P_a·V_a)/(P_b·V_b)';
      example =
        `Rel. pont ${fmt(relDotPointer, 3)}× / nyaláb ${fmt(relBeamPointer, 3)}× a 5 mW 532 nm pointerhez képest. ` +
        `z = ${fmt(probeDistanceM, 3)} m-nél w ≈ ${fmt(wAtZ * 1e3, 3)} mm.`;
      if (input.powerW >= 0.005) {
        safetyNote =
          'Oktatási megjegyzés: valódi lézernél szemvédelem kell — ez a szimuláció nem minősítés.';
      }
      break;
    }
  }

  return {
    insight,
    formula,
    example,
    quantities,
    rgb,
    scatterWeight,
    displayBrightness,
    safetyNote,
  };
}

export { POWER_PRESETS_W } from './power';
