/**
 * Babylon post-FX binding for ObserverLayer + DebugViewMode.
 * Compose applies these uniforms on linear HDR before tonemap.
 */
import type { DebugViewMode, ObserverId, World } from '@engine';
import {
  resolveObserver,
  resolveObserverGpuUniforms,
  type ObserverGpuUniforms,
} from '@engine';

export interface ObserverPostFxState {
  activeObserverId: ObserverId;
  /** Id used for GPU (selected observer — stubs no longer remapped away). */
  effectiveObserverId: ObserverId;
  usedFallback: boolean;
  debugViewMode: DebugViewMode;
  fatigueEnabled: boolean;
  bypassObserver: boolean;
  showRadianceDebug: boolean;
  gpu: ObserverGpuUniforms;
}

export function readObserverPostFxState(world: World): ObserverPostFxState {
  const vision = world.resources.DisplayVision;
  const resolved = resolveObserver(vision.activeObserverId);
  const debug = vision.debugViewMode;
  const effectiveId = resolved.observer.id;
  return {
    activeObserverId: vision.activeObserverId,
    effectiveObserverId: effectiveId,
    usedFallback: resolved.usedFallback,
    debugViewMode: debug,
    fatigueEnabled: vision.coneFatigue.enabled && vision.activeObserverId === 'human-eye',
    bypassObserver: debug === 'observer-bypass',
    showRadianceDebug:
      debug === 'radiance-rgb' ||
      debug === 'radiance-luminance' ||
      debug === 'radiance-split',
    gpu: resolveObserverGpuUniforms(effectiveId, debug),
  };
}
