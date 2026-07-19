import { describe, expect, it } from 'vitest';
import type { SerializedWorld } from '../ecs/world';
import { migrateSave } from './serialize';

describe('surface material save migration', () => {
  it('maps legacy light surfaceMaterial to gains/coupling without attaching SM to the light', () => {
    const raw = {
      schemaVersion: 1,
      resources: {
        ActiveScene: { sceneId: 'room', label: 't' },
        Quality: { preset: 'medium' },
        Camera: {
          position: [0, 1, 4],
          target: [0, 1, 0],
          fovYDeg: 50,
          near: 0.1,
          far: 200,
          dirty: true,
        },
        EditorSelection: { entityId: null, entityIds: [] },
        PresentationMode: 'edit',
        EditorTooling: { gizmoMode: 'position' },
      },
      entities: [
        {
          id: 'laser_old',
          components: {
            Name: { value: 'Old laser' },
            Parent: { entityId: null },
            SiblingOrder: { index: 0 },
            Transform: {
              position: [0, 1, 0],
              rotation: [0, 0, 0, 1],
              scale: [1, 1, 1],
            },
            LightEmitter: {
              wavelengthNm: 532,
              powerW: 1,
              enabled: true,
              params: {
                mode: 'laser',
                laser: { w0M: 0.01, parallelness: 0.85, probeDistanceM: 5 },
              },
              surfaceMaterial: {
                preset: 'chrome',
                albedo: 0.55,
                metalness: 1,
                roughness: 0.12,
                housingCoupling: 0.7,
              },
              surfaceIntensity: 2,
              glowIntensity: 1.5,
              bloomIntensity: 2.2,
              spill: { strayLight: 0.1, internalReflection: 0.1, apertureSpill: 0.1 },
            },
          },
        },
      ],
    } as unknown as SerializedWorld;

    const migrated = migrateSave(raw);
    const comps = migrated.entities[0].components;
    expect(comps.SurfaceMaterial).toBeUndefined();
    expect(comps.LightEmitter).toBeDefined();
    expect(comps.LightEmitter?.apertureCoupling).toBeCloseTo(0.7);
    expect(comps.LightEmitter?.surfaceGain).toBeCloseTo(2);
    expect(comps.LightEmitter?.glowGain).toBeCloseTo(1.5);
    expect(comps.LightEmitter?.bloomGain).toBeCloseTo(2.2);
    expect(comps.LightEmitter?.spill.strayPowerFraction).toBeGreaterThan(0);
    expect(
      (comps.LightEmitter as unknown as { surfaceMaterial?: unknown }).surfaceMaterial,
    ).toBeUndefined();
  });

  it('strips SurfaceMaterial from light-only entities on load', () => {
    const raw = {
      schemaVersion: 1,
      resources: {
        ActiveScene: { sceneId: 'room', label: 't' },
        Quality: { preset: 'medium' },
        Camera: {
          position: [0, 1, 4],
          target: [0, 1, 0],
          fovYDeg: 50,
          near: 0.1,
          far: 200,
          dirty: true,
        },
        EditorSelection: { entityId: null, entityIds: [] },
        PresentationMode: 'edit',
        EditorTooling: { gizmoMode: 'position' },
      },
      entities: [
        {
          id: 'laser_1',
          components: {
            Name: { value: 'Lézer' },
            LightEmitter: {
              wavelengthNm: 532,
              powerW: 1,
              enabled: true,
              params: {
                mode: 'laser',
                laser: { w0M: 0.01, parallelness: 0.85, probeDistanceM: 5 },
              },
              surfaceGain: 1,
              glowGain: 1,
              bloomGain: 1,
              apertureCoupling: 0.4,
              spill: { strayLight: 0.1, internalReflection: 0.1, apertureSpill: 0.1 },
            },
            SurfaceMaterial: {
              preset: 'anodized_aluminum',
              albedo: 0.28,
              metalness: 0.75,
              roughness: 0.45,
            },
          },
        },
      ],
    } as unknown as SerializedWorld;

    const migrated = migrateSave(raw);
    expect(migrated.entities[0].components.SurfaceMaterial).toBeUndefined();
    expect(migrated.entities[0].components.LightEmitter?.apertureCoupling).toBeCloseTo(0.4);
  });
});
