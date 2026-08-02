/**
 * Factories for new perceptors — prefer these over hand-rolling ObserverLayer.
 */
import type {
  ObserverCategory,
  ObserverContext,
  ObserverId,
  ObserverImplementationStatus,
  ObserverLayer,
  PerceptualBuffer,
  RadianceBuffer,
} from './types';

export interface DefineObserverOptions {
  id: ObserverId;
  label: string;
  labelKey: string;
  category: ObserverCategory;
  status?: ObserverImplementationStatus;
  selectable?: boolean;
  approximationTag?: 'approximated' | null;
  apply?: (radiance: RadianceBuffer, ctx: ObserverContext) => PerceptualBuffer;
}

/** Contract passthrough apply (GPU path owns the real RT transform). */
export function passthroughApply(
  id: ObserverId,
  approximationTag: 'approximated' | null = null,
): (radiance: RadianceBuffer, ctx: ObserverContext) => PerceptualBuffer {
  return () => ({
    encoding: 'linear-rgb-perceptual',
    observerId: id,
    approximationTag,
  });
}

export function defineObserver(opts: DefineObserverOptions): ObserverLayer {
  const approximationTag = opts.approximationTag ?? null;
  return {
    id: opts.id,
    label: opts.label,
    labelKey: opts.labelKey,
    category: opts.category,
    status: opts.status ?? 'stub',
    selectable: opts.selectable !== false,
    approximationTag,
    apply: opts.apply ?? passthroughApply(opts.id, approximationTag),
  };
}

export function defineCameraObserver(
  opts: Omit<DefineObserverOptions, 'category'> & {
    category?: 'camera';
  },
): ObserverLayer {
  return defineObserver({
    ...opts,
    category: 'camera',
    status: opts.status ?? 'stub',
    approximationTag: opts.approximationTag ?? 'approximated',
  });
}
