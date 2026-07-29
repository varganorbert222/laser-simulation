import { describe, expect, it } from 'vitest';
import { defaultSmokeEmitter, normalizeSmokeEmitter } from '../../../ecs/components';
import { World } from '../../../ecs/world';
import { createSmokeEmitterCommand } from '../../../commands/hierarchy-commands';
import { gatherRenderPack } from '../../../render/pack';
import { PLUME_DISABLED_CONE_COS, coneCosFromHalfAngleDeg } from './smoke-plume';
import { createSceneEntity } from '../../../hierarchy/entity-factory';
import { defaultMediaVolumeForKind } from './media-optical-presets';
import { identity as matIdentity } from '../../../math/mat4';
import { worldTransformSystem } from '../../../ecs/systems/world-transform';

describe('SmokeEmitter pack / normalize', () => {
  it('normalizeSmokeEmitter fills defaults', () => {
    const n = normalizeSmokeEmitter({});
    expect(n.enabled).toBe(true);
    expect(n.emissionRate).toBe(1);
    expect(n.coneAngleDeg).toBe(25);
    expect(n.plumeLengthM).toBe(4);
  });

  it('plain MediaVolume packs disabled plume (uniform AABB)', () => {
    const world = new World();
    const id = createSceneEntity(world, { name: 'fog', parentId: null });
    world.add(id, 'MediaVolume', defaultMediaVolumeForKind('fog'));
    world.add(id, 'WorldXform', { matrix: matIdentity(), dirty: false });
    const pack = gatherRenderPack(world);
    expect(pack.media.length).toBe(1);
    expect(pack.media[0]!.coneCos).toBe(PLUME_DISABLED_CONE_COS);
    expect(pack.media[0]!.emissionRate).toBe(1);
  });

  it('createSmokeEmitter uses FluidVolume(smoke)+SmokeEmitter (no MediaVolume)', () => {
    const world = new World();
    const root = createSceneEntity(world, {
      name: 'root',
      parentId: null,
      locked: true,
      isSceneRoot: true,
    });
    createSmokeEmitterCommand(world, 'Füstszóró', root);
    worldTransformSystem(world);
    const pack = gatherRenderPack(world);
    expect(pack.media.some((m) => m.coneCos > 0)).toBe(false);
    const f = pack.fogs.find((x) => x.emissionRate > 0 && x.coneCos > 0);
    expect(f).toBeTruthy();
    expect(f!.emissionRate).toBeGreaterThan(0);
    expect(f!.coneCos).toBeCloseTo(coneCosFromHalfAngleDeg(25), 5);
    expect(f!.plumeLengthM).toBe(defaultSmokeEmitter().plumeLengthM);
    expect(f!.maxDensity).toBeGreaterThan(0);
  });
});
