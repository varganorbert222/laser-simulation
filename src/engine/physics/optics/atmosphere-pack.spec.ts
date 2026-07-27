import { describe, expect, it } from 'vitest';
import { createDemoWorld } from '../../scene/demo-world';
import { worldTransformSystem } from '../../ecs/systems/world-transform';
import { gatherRenderPack } from '../../render/pack';
import { normalizeAtmosphereSettings } from './atmosphere-settings';

describe('atmosphere pack integration', () => {
  it('SPA overrides env sun direction when Atmosphere.enabled', () => {
    const world = createDemoWorld();
    worldTransformSystem(world);
    const before = gatherRenderPack(world);

    world.resources.Atmosphere = normalizeAtmosphereSettings({
      ...world.resources.Atmosphere,
      enabled: true,
      latitudeDeg: 0,
      longitudeDeg: 0,
      timezoneOffsetHours: 0,
      year: 2026,
      month: 3,
      day: 20,
      hour: 12,
      minute: 0,
    });
    const after = gatherRenderPack(world);
    // Equator equinox noon → light mostly downward (−Y)
    expect(after.env.sunDirCam[1]).toBeLessThan(-0.7);
    expect(after.env.sunDirCam[1]).not.toBeCloseTo(before.env.sunDirCam[1], 2);
    // Physical sun RGB should be warm-white-ish and positive
    expect(after.env.sunRgb[0]).toBeGreaterThan(0);
    expect(after.env.hemiRgb[2]).toBeGreaterThan(0);
    // Lens flare sits toward the sun disc (−lightDir), not along light travel.
    const sunFlare = after.lensFlares.find((f) => f.directional > 0.5);
    expect(sunFlare).toBeTruthy();
    expect(sunFlare!.originCam[1]).toBeGreaterThan(0);
  });
});
