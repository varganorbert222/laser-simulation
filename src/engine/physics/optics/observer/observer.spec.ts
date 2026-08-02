/**
 * Adaptation polarity + CIE table smoke tests.
 */
import { describe, expect, it } from 'vitest';
import {
  adaptFromSceneLuminanceY,
  createDefaultDisplayVision,
  defineObserver,
  dichromatDogRgb,
  dogConeSensitivities,
  effectiveVLambda,
  getObserver,
  listObservers,
  normalizeDisplayVision,
  photopicV,
  registerObserver,
  resolveObserverGpuUniforms,
  scotopicV,
  scotopicWeightFromLuminanceY,
  simulateColourBlindRgb,
} from '@engine';

describe('observer adaptation polarity', () => {
  it('daylight Y → photopic (scotopicWeight ≈ 0)', () => {
    expect(scotopicWeightFromLuminanceY(10)).toBeLessThan(0.05);
    expect(adaptFromSceneLuminanceY(100).scotopicWeight).toBe(0);
  });

  it('night Y → scotopic (scotopicWeight ≈ 1)', () => {
    expect(scotopicWeightFromLuminanceY(0.001)).toBeGreaterThan(0.95);
  });

  it('mesopic factor peaks in between', () => {
    const mid = adaptFromSceneLuminanceY(Math.sqrt(0.01 * 10));
    const day = adaptFromSceneLuminanceY(10);
    const night = adaptFromSceneLuminanceY(0.01);
    expect(mid.mesopicFactor).toBeGreaterThan(day.mesopicFactor);
    expect(mid.mesopicFactor).toBeGreaterThan(night.mesopicFactor * 0.5);
  });
});

describe('CIE offline tables', () => {
  it('photopic peaks near 555 nm', () => {
    expect(photopicV(555)).toBeGreaterThan(0.95);
    expect(photopicV(555)).toBeGreaterThan(photopicV(450));
    expect(photopicV(555)).toBeGreaterThan(photopicV(650));
  });

  it('scotopic peaks near 507 nm (not 555)', () => {
    expect(scotopicV(507)).toBeGreaterThan(scotopicV(555));
  });

  it('V_eff blends toward scotopic at night', () => {
    const day = effectiveVLambda(450, 0, 0);
    const night = effectiveVLambda(450, 1, 0);
    // Blue relatively brighter under scotopic (Purkinje)
    expect(night / Math.max(1e-9, day)).toBeGreaterThan(1);
  });
});

describe('observer registry', () => {
  it('ships human, cameras, dog — not UV/IR animal stubs', () => {
    const ids = listObservers().map((o) => o.id);
    expect(ids).toContain('human-eye');
    expect(ids).toContain('digital-camera');
    expect(ids).toContain('thermal-camera');
    expect(ids).toContain('infrared-camera');
    expect(ids).toContain('animal:dog');
    expect(ids).not.toContain('animal:bee');
    expect(ids).not.toContain('animal:snake');
  });

  it('resolves dog observer with approximated tag', () => {
    const dog = getObserver('animal:dog');
    expect(dog?.approximationTag).toBe('approximated');
    expect(dog?.category).toBe('animal');
  });

  it('accepts plugin registration', () => {
    registerObserver(
      defineObserver({
        id: 'test-plugin-sensor',
        label: 'Test',
        labelKey: 'observerDigitalCamera',
        category: 'custom',
        selectable: true,
        status: 'stub',
      }),
    );
    expect(getObserver('test-plugin-sensor')?.category).toBe('custom');
    expect(listObservers().map((o) => o.id)).toContain('test-plugin-sensor');
  });
});

describe('DisplayVision normalize', () => {
  it('defaults and migrates missing fields', () => {
    const d = createDefaultDisplayVision();
    expect(d.activeObserverId).toBe('human-eye');
    expect(d.debugViewMode).toBe('final');
    expect(d.legacyLuminousPack).toBe(true);
    expect(d.coneFatigue.enabled).toBe(false);

    const n = normalizeDisplayVision({
      responseCurve: d.responseCurve,
      activeObserverId: 'animal:dog' as const,
    });
    expect(n.activeObserverId).toBe('animal:dog');
    expect(n.debugViewMode).toBe('final');
  });
});

describe('colour-blind + dog helpers', () => {
  it('colour-blind simulation changes RGB', () => {
    const [r, g, b] = simulateColourBlindRgb('protanopia', 1, 0, 0);
    expect(r + g + b).toBeGreaterThan(0);
    expect(Math.abs(r - 1) + Math.abs(g) + Math.abs(b)).toBeGreaterThan(0.01);
  });

  it('dog dichromat collapses red/green', () => {
    const red = dichromatDogRgb(1, 0, 0);
    const green = dichromatDogRgb(0, 1, 0);
    // Shared LM channel → more similar than human RGB primaries
    const humanDist = Math.hypot(1, 1);
    const dogDist = Math.hypot(red[0] - green[0], red[1] - green[1], red[2] - green[2]);
    expect(dogDist).toBeLessThan(humanDist);
  });

  it('dog cone peaks match Neitz-ish locations', () => {
    const at429 = dogConeSensitivities(429);
    const at555 = dogConeSensitivities(555);
    expect(at429.S).toBeGreaterThan(at555.S);
    expect(at555.ML).toBeGreaterThan(at429.ML);
  });
});

describe('observer GPU uniforms', () => {
  it('maps dog / cameras / colour-blind to distinct modes', () => {
    expect(resolveObserverGpuUniforms('human-eye', 'final').observerMode).toBe(0);
    expect(resolveObserverGpuUniforms('animal:dog', 'final').observerMode).toBe(1);
    expect(resolveObserverGpuUniforms('protanopia', 'final').observerMode).toBe(1);
    expect(resolveObserverGpuUniforms('digital-camera', 'final').observerMode).toBe(2);
    expect(resolveObserverGpuUniforms('thermal-camera', 'final').observerMode).toBe(3);
    expect(resolveObserverGpuUniforms('infrared-camera', 'final').observerMode).toBe(4);
  });

  it('bypass disables observer mode', () => {
    const u = resolveObserverGpuUniforms('thermal-camera', 'observer-bypass');
    expect(u.observerMode).toBe(0);
    expect(u.debugViewMode).toBe(4);
  });

  it('dog matrix collapses red toward greenish channel', () => {
    const { matrixRows } = resolveObserverGpuUniforms('animal:dog', 'final');
    const map = (r: number, g: number, b: number) => [
      matrixRows[0][0] * r + matrixRows[0][1] * g + matrixRows[0][2] * b,
      matrixRows[1][0] * r + matrixRows[1][1] * g + matrixRows[1][2] * b,
      matrixRows[2][0] * r + matrixRows[2][1] * g + matrixRows[2][2] * b,
    ];
    const red = map(1, 0, 0);
    const green = map(0, 1, 0);
    expect(Math.hypot(red[0] - green[0], red[1] - green[1], red[2] - green[2])).toBeLessThan(1.2);
  });
});
