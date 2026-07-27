import { describe, expect, it } from 'vitest';
import {
  createDefaultGravityEnvironment,
  normalizeGravityEnvironment,
  resolveGravityAccel,
} from './gravity-environment';
import {
  createDefaultWindEnvironment,
  normalizeWindEnvironment,
  resolveWindForce,
} from './wind-environment';
import { World } from '../../ecs/world';
import { defaultFogVolume, defaultTransform } from '../../ecs/components';
import { gatherRenderPack } from '../../render/pack';
import { serializeWorld, deserializeWorld } from '../../save/serialize';

describe('GravityEnvironment', () => {
  it('defaults to downward gravity', () => {
    const g = createDefaultGravityEnvironment();
    expect(g.enabled).toBe(true);
    expect(g.direction[1]).toBeLessThan(0);
    const a = resolveGravityAccel(g);
    expect(a[1]).toBeCloseTo(-g.strength);
  });

  it('normalize clamps strength and unitizes direction', () => {
    const n = normalizeGravityEnvironment({
      direction: [0, -10, 0],
      strength: 100,
      enabled: true,
    });
    expect(n.strength).toBeLessThanOrEqual(40);
    expect(Math.hypot(...n.direction)).toBeCloseTo(1);
  });

  it('disabled gravity resolves to zero', () => {
    const a = resolveGravityAccel(
      normalizeGravityEnvironment({ enabled: false, strength: 5, direction: [0, -1, 0] }),
    );
    expect(a).toEqual([0, 0, 0]);
  });
});

describe('WindEnvironment', () => {
  it('gustAmount 0 is static wind', () => {
    const env = normalizeWindEnvironment({
      enabled: true,
      direction: [1, 0, 0],
      strength: 2,
      gustAmount: 0,
    });
    const a = resolveWindForce(env, 0);
    const b = resolveWindForce(env, 10);
    expect(a[0]).toBeCloseTo(2);
    expect(b[0]).toBeCloseTo(2);
  });

  it('gustAmount > 0 modulates magnitude over time', () => {
    const env = normalizeWindEnvironment({
      enabled: true,
      direction: [1, 0, 0],
      strength: 2,
      gustAmount: 1,
      noiseScale: 0.5,
      noiseTimeScale: 1,
    });
    const samples = [0, 0.7, 1.4, 2.1, 3.3].map((t) => resolveWindForce(env, t)[0]);
    const unique = new Set(samples.map((v) => v.toFixed(4)));
    expect(unique.size).toBeGreaterThan(1);
  });

  it('disabled wind resolves to zero', () => {
    const w = resolveWindForce(
      normalizeWindEnvironment({ enabled: false, strength: 5, direction: [1, 0, 0] }),
      1,
    );
    expect(w).toEqual([0, 0, 0]);
  });
});

describe('fluid force pack fields', () => {
  it('packs gravity, wind, and volume couplings', () => {
    const world = new World();
    world.resources.GravityEnvironment = normalizeGravityEnvironment({
      enabled: true,
      direction: [0, -1, 0],
      strength: 3,
    });
    world.resources.WindEnvironment = normalizeWindEnvironment({
      enabled: true,
      direction: [1, 0, 0],
      strength: 1.5,
      gustAmount: 0,
    });
    const id = world.createEntity();
    world.add(id, 'Name', { value: 'Smoke' });
    world.add(id, 'Transform', defaultTransform());
    world.add(id, 'FogVolume', {
      ...defaultFogVolume(),
      windCoupling: 0.4,
      inertiaCoupling: 0.7,
    });
    const pack = gatherRenderPack(world);
    expect(pack.forces.gravity[1]).toBeCloseTo(-3);
    expect(pack.forces.wind[0]).toBeCloseTo(1.5);
    expect(pack.fogs[0]?.windCoupling).toBeCloseTo(0.4);
    expect(pack.fluids[0]?.windCoupling).toBeCloseTo(0.4);
    expect(pack.fluids[0]?.inertiaCoupling).toBeCloseTo(0.7);
    expect(pack.fluids[0]?.centerWorld).toBeTruthy();
  });

  it('round-trips Wind/Gravity through serialize', () => {
    const world = new World();
    world.resources.WindEnvironment = normalizeWindEnvironment({
      enabled: true,
      strength: 1.25,
      gustAmount: 0.4,
      direction: [0, 0, 1],
    });
    world.resources.GravityEnvironment = normalizeGravityEnvironment({
      strength: 5,
      direction: [0, -1, 0],
    });
    const json = serializeWorld(world);
    const restored = deserializeWorld(json);
    expect(restored.resources.WindEnvironment.strength).toBeCloseTo(1.25);
    expect(restored.resources.WindEnvironment.gustAmount).toBeCloseTo(0.4);
    expect(restored.resources.GravityEnvironment.strength).toBeCloseTo(5);
    expect(createDefaultWindEnvironment().enabled).toBe(true);
  });
});
