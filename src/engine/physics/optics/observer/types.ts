/**
 * Observer / RadianceBuffer / DebugView contracts (perception post-layer).
 * No Angular / Babylon / World mutation here.
 *
 * Extensibility: implement {@link ObserverLayer}, then
 * `registerObserver(...)` (see `registry.ts`). Animal species:
 * `registerAnimalObserver(profile, opts?)`.
 */

/** Physical radiance representation (v1 = linear RGB HDR proxy). */
export interface RadianceBuffer {
  /** Encoding label for honesty / debug HUD. */
  readonly encoding: 'linear-rgb-hdr-v1';
  /**
   * Optional narrowband laser λ metadata (nm) for educational observer math.
   * Broadband / sky / surfaces omit this.
   */
  readonly peakWavelengthNm?: number;
  /**
   * v1 has no true UV/IR planes — UV/IR species & cameras must label `approximated`.
   */
  readonly hasUvPlane: false;
  readonly hasIrPlane: false;
}

/** Observer output ready for DisplayLayer (typically linear RGB). */
export interface PerceptualBuffer {
  readonly encoding: 'linear-rgb-perceptual';
  readonly observerId: ObserverId;
  /** Honest tag when UV/IR/species math used proxies. */
  readonly approximationTag?: 'approximated' | null;
}

/**
 * Built-in ids + open `animal:*` / `custom` / future string ids via registry.
 * Prefer `registerObserver` over extending this union for new plugins.
 */
export type ObserverId =
  | 'human-eye'
  | 'protanopia'
  | 'deuteranopia'
  | 'tritanopia'
  | 'digital-camera'
  | 'thermal-camera'
  | 'infrared-camera'
  | `animal:${string}`
  | 'custom'
  | (string & {});

/** UI / docs grouping — drives optgroups and filters. */
export type ObserverCategory =
  | 'human'
  | 'colour-blind'
  | 'camera'
  | 'animal'
  | 'custom';

export type DebugViewMode =
  | 'final'
  | 'radiance-rgb'
  | 'radiance-luminance'
  | 'radiance-split'
  | 'observer-bypass';

export type ObserverImplementationStatus =
  | 'ready'
  | 'stub'
  | 'gpu-pending'
  | 'fallback';

export interface ObserverContext {
  /** Relative HDR Y or educational cd/m² mapping — document scale at call site. */
  sceneLuminanceY: number;
  quality: { maxObserverCost: number };
  timeSeconds: number;
  deltaTime?: number;
}

/**
 * Architectural contract — Babylon implements via post-process / compute on RTs.
 * CPU helpers may approximate for science readout / offline tests.
 */
export interface ObserverLayer {
  readonly id: ObserverId;
  readonly label: string;
  /** i18n key (falls back to label / id in UI). */
  readonly labelKey: string;
  readonly category: ObserverCategory;
  readonly status: ObserverImplementationStatus;
  /** When false, hidden from the Vision picker (still resolvable / saveable). */
  readonly selectable: boolean;
  /** When true, UI should show approximated / proxy honesty. */
  readonly approximationTag?: 'approximated' | null;
  apply(radiance: RadianceBuffer, ctx: ObserverContext): PerceptualBuffer;
}

export interface ConeFatigueSettings {
  enabled: boolean;
  /** Educational default ~0.05 */
  fatigueRate: number;
  /** Educational default ~0.02 */
  recoveryRate: number;
}

export const DEFAULT_CONE_FATIGUE: ConeFatigueSettings = {
  enabled: false,
  fatigueRate: 0.05,
  recoveryRate: 0.02,
};

export const DEBUG_VIEW_MODES: readonly DebugViewMode[] = [
  'final',
  'radiance-rgb',
  'radiance-luminance',
  'radiance-split',
  'observer-bypass',
] as const;

/** Stable UI order for categories. */
export const OBSERVER_CATEGORY_ORDER: readonly ObserverCategory[] = [
  'human',
  'colour-blind',
  'camera',
  'animal',
  'custom',
] as const;
