/**
 * WaterOpticsBinder — invisible SPH state + analytical water surface post-process.
 * No billboards, RTT pack/smooth/normals, or FluidRender composite.
 *
 * Note: GpuWater.windCoupling is intentionally unused here (SPH has no wind force path).
 * Free-surface look comes from fillFraction + gravity + waves, not particle positions.
 */
import {
  Constants,
  Effect,
  Matrix,
  PostProcess,
  RenderTargetTexture,
  Vector2,
  Vector3,
  type Camera,
  type Scene,
  type Texture,
} from '@babylonjs/core';
import {
  angularVelocity,
  clampSimDt,
  getRotation,
  resolveGravityAccel,
  spawnFill,
  step as sphStep,
  type GatheredFrame,
  type GpuWater,
  type Quat,
  type SphParams,
  type SphState,
  type Vec3,
  type World,
} from '@engine';
import { FLUID_WATER_SURFACE_FRAGMENT } from '../shaders/load-shaders';

Effect.ShadersStore['waterSurfacePixelShader'] = FLUID_WATER_SURFACE_FRAGMENT;

interface EffectLike {
  setFloat(name: string, v: number): void;
  setVector2(name: string, v: Vector2): void;
  setVector3(name: string, v: Vector3): void;
  setMatrix(name: string, m: Matrix): void;
  setTexture(name: string, t: Texture | RenderTargetTexture | null): void;
}

interface XformHistory {
  pos: Vec3;
  rot: Quat;
  linearVel: Vec3;
  ready: boolean;
}

interface TankState {
  entityId: string;
  sph: SphState;
  appliedFill: number;
  appliedRadius: number;
  halfKey: string;
  xform: XformHistory;
}

function clampVec3(v: Vec3, maxLen: number): Vec3 {
  const len = Math.hypot(v[0], v[1], v[2]);
  if (len <= maxLen || len < 1e-12) return v;
  const s = maxLen / len;
  return [v[0] * s, v[1] * s, v[2] * s];
}

function halfKey(h: readonly [number, number, number]): string {
  return `${h[0].toFixed(3)}:${h[1].toFixed(3)}:${h[2].toFixed(3)}`;
}

function worldToLocal(
  v: readonly [number, number, number],
  ax: readonly [number, number, number],
  ay: readonly [number, number, number],
  az: readonly [number, number, number],
): [number, number, number] {
  return [
    v[0] * ax[0] + v[1] * ax[1] + v[2] * ax[2],
    v[0] * ay[0] + v[1] * ay[1] + v[2] * ay[2],
    v[0] * az[0] + v[1] * az[1] + v[2] * az[2],
  ];
}

function asTriple(v: Vec3): [number, number, number] {
  return [v[0], v[1], v[2]];
}

export class WaterOpticsBinder {
  private readonly scene: Scene;
  private readonly tanks = new Map<string, TankState>();
  private waterCompose: PostProcess | null = null;
  private _camera: Camera | null = null;
  private _world: World | null = null;
  private _sceneDepth: Texture | null = null;
  private _envTex: Texture | null = null;
  private _envDummy: RenderTargetTexture | null = null;
  private _frame: GatheredFrame | null = null;
  private _active: GpuWater | null = null;

  constructor(scene: Scene) {
    this.scene = scene;
  }

  attach(
    world: World,
    camera: Camera,
    sceneDepth: Texture | null,
    afterPostProcess?: PostProcess | null,
  ): void {
    this._world = world;
    this._camera = camera;
    this._sceneDepth = sceneDepth;
    this.ensureDummyTextures();
    if (!this.waterCompose) {
      this.waterCompose = new PostProcess(
        'waterSurface',
        'waterSurface',
        [
          'uUseEnv',
          'uInvViewProj',
          'uView',
          'uCameraPos',
          'uFluidCenter',
          'uFluidHalfExt',
          'uAxisX',
          'uAxisY',
          'uAxisZ',
          'uGravityDir',
          'uSunDir',
          'uSunRgb',
          'uHemiRgb',
          'uWaterColor',
          'uOpticalDensity',
          'uScatter',
          'uAbsorb',
          'uCausticStrength',
          'uFoamStrength',
          'uIor',
          'uFillFraction',
          'uWaveAmp',
          'uWaveFreq',
          'uWaveSteep',
          'uTime',
          'uEnableRefraction',
          'uMaxSurfaceBounces',
          'uSurfaceSamples',
          'uRefractionMultiplier',
          'uExtinctionScale',
          'uResolution',
        ],
        ['uSceneDepth', 'uEnvCube'],
        1.0,
        null,
        Constants.TEXTURE_BILINEAR_SAMPLINGMODE,
        this.scene.getEngine(),
        false,
      );
      this.waterCompose.onApply = (effect) => {
        this.applyWaterUniforms(effect as unknown as EffectLike);
      };
    }
    this.insertWaterAfter(camera, afterPostProcess ?? null);
  }

  private insertWaterAfter(camera: Camera, after: PostProcess | null): void {
    if (!this.waterCompose) return;
    camera.detachPostProcess(this.waterCompose);
    const chain = (camera as Camera & { _postProcesses?: (PostProcess | null)[] })._postProcesses;
    const idx = after && chain ? chain.indexOf(after) : -1;
    camera.attachPostProcess(this.waterCompose, idx >= 0 ? idx + 1 : null);
  }

  setEnvTexture(tex: Texture | null): void {
    this._envTex = tex;
  }

  private ensureDummyTextures(): void {
    if (this._envDummy) return;
    this._envDummy = new RenderTargetTexture(
      'waterEnvDummy',
      { width: 1, height: 1 },
      this.scene,
      false,
      true,
      Constants.TEXTURETYPE_UNSIGNED_BYTE,
      false,
      Constants.TEXTURE_NEAREST_SAMPLINGMODE,
      false,
      false,
    );
    this._envDummy.renderList = [];
  }

  step(frame: GatheredFrame, dt: number): void {
    this._frame = frame;
    const water = frame.waters[0] ?? null;
    this._active = water;

    if (!water) {
      this.tanks.clear();
      return;
    }

    try {
      const live = new Set([water.entityId]);
      for (const id of [...this.tanks.keys()]) {
        if (!live.has(id)) this.tanks.delete(id);
      }
      const state = this.ensureTank(water, frame);
      const simDt = clampSimDt(dt, 8, 0.85);
      const sub = simDt > 1 / 90 ? 2 : 1;
      const hDt = simDt / sub;
      for (let s = 0; s < sub; s++) {
        this.simulate(state, water, frame, hDt);
      }
    } catch (err) {
      console.warn('[WaterOpticsBinder] step failed', err);
    }
  }

  private ensureTank(w: GpuWater, frame: GatheredFrame): TankState {
    let s = this.tanks.get(w.entityId);
    const hk = halfKey(w.halfExtents);
    const needSpawn =
      !s ||
      Math.abs(s.appliedRadius - w.particleRadius) > 1e-4 ||
      Math.abs(s.appliedFill - w.fillFraction) > 0.02 ||
      s.halfKey !== hk;

    if (!s) {
      s = {
        entityId: w.entityId,
        sph: spawnFill(asTriple(w.halfExtents), w.fillFraction, w.particleRadius, [0, -1, 0]),
        appliedFill: w.fillFraction,
        appliedRadius: w.particleRadius,
        halfKey: hk,
        xform: {
          pos: [...w.centerWorld] as Vec3,
          rot: [0, 0, 0, 1],
          linearVel: [0, 0, 0],
          ready: false,
        },
      };
      this.tanks.set(w.entityId, s);
    } else if (needSpawn) {
      const gWorld = frame.forces?.gravity ?? ([0, -9.5, 0] as Vec3);
      const gLocal = worldToLocal(gWorld, w.axisX, w.axisY, w.axisZ);
      s.sph = spawnFill(asTriple(w.halfExtents), w.fillFraction, w.particleRadius, gLocal);
      s.appliedFill = w.fillFraction;
      s.appliedRadius = w.particleRadius;
      s.halfKey = hk;
    }
    return s;
  }

  private simulate(s: TankState, w: GpuWater, frame: GatheredFrame, dt: number): void {
    const { linearAccel, angularVel } = this.updateContainerInertia(s, w, dt);
    const gWorld =
      this._world != null
        ? resolveGravityAccel(this._world.resources.GravityEnvironment)
        : (frame.forces?.gravity ?? ([0, -9.5, 0] as Vec3));
    const gLocal = worldToLocal(gWorld, w.axisX, w.axisY, w.axisZ);
    const aLocal = worldToLocal(linearAccel, w.axisX, w.axisY, w.axisZ);
    const oLocal = worldToLocal(angularVel, w.axisX, w.axisY, w.axisZ);

    const params: SphParams = {
      halfExtents: asTriple(w.halfExtents),
      gravity: gLocal,
      restDensity: w.restDensity,
      stiffness: w.stiffness,
      viscosity: w.viscosity,
      mass: 0,
      h: Math.max(0.04, w.particleRadius * 2.2),
      linearAccel: aLocal,
      angularVel: oLocal,
      inertiaCoupling: w.inertiaCoupling,
    };
    sphStep(s.sph, dt, params);
  }

  private updateContainerInertia(
    s: TankState,
    w: GpuWater,
    dt: number,
  ): { linearAccel: Vec3; angularVel: Vec3 } {
    const h = s.xform;
    const pos = w.centerWorld;
    let rot: Quat = [0, 0, 0, 1];
    if (this._world) {
      const xform = this._world.get(w.entityId, 'WorldXform');
      if (xform) rot = getRotation(xform.matrix);
    }
    if (!h.ready || dt < 1e-6) {
      h.pos = [...pos] as Vec3;
      h.rot = [...rot] as Quat;
      h.linearVel = [0, 0, 0];
      h.ready = true;
      return { linearAccel: [0, 0, 0], angularVel: [0, 0, 0] };
    }
    const linearVel: Vec3 = [
      (pos[0] - h.pos[0]) / dt,
      (pos[1] - h.pos[1]) / dt,
      (pos[2] - h.pos[2]) / dt,
    ];
    let linearAccel: Vec3 = [
      (linearVel[0] - h.linearVel[0]) / dt,
      (linearVel[1] - h.linearVel[1]) / dt,
      (linearVel[2] - h.linearVel[2]) / dt,
    ];
    let ang = angularVelocity(h.rot, rot, dt);
    linearAccel = clampVec3(linearAccel, 40);
    ang = clampVec3(ang, 12);
    h.pos = [...pos] as Vec3;
    h.rot = [...rot] as Quat;
    h.linearVel = linearVel;
    return { linearAccel, angularVel: ang };
  }

  private applyWaterUniforms(effect: EffectLike): void {
    const frame = this._frame;
    const cam = this._camera;
    const water = this._active;
    if (!frame || !cam || !water) {
      effect.setFloat('uOpticalDensity', 0);
      effect.setFloat('uFillFraction', 0);
      return;
    }

    effect.setTexture('uSceneDepth', this._sceneDepth);
    const env = this._envTex ?? this._envDummy;
    effect.setTexture('uEnvCube', env);
    effect.setFloat('uUseEnv', this._envTex ? 1 : 0);

    const camPos = cam.position;
    effect.setMatrix('uInvViewProj', Matrix.Invert(cam.getTransformationMatrix()));
    effect.setMatrix('uView', cam.getViewMatrix());
    effect.setVector3('uCameraPos', camPos);
    effect.setVector2(
      'uResolution',
      new Vector2(this.scene.getEngine().getRenderWidth(), this.scene.getEngine().getRenderHeight()),
    );
    effect.setVector3('uSunDir', new Vector3(...frame.env.sunDirCam));
    effect.setVector3(
      'uSunRgb',
      new Vector3(
        Math.max(0.35, frame.env.sunRgb[0] * 12),
        Math.max(0.32, frame.env.sunRgb[1] * 12),
        Math.max(0.28, frame.env.sunRgb[2] * 12),
      ),
    );
    effect.setVector3(
      'uHemiRgb',
      new Vector3(
        Math.max(0.15, frame.env.hemiRgb[0] * 8),
        Math.max(0.18, frame.env.hemiRgb[1] * 8),
        Math.max(0.25, frame.env.hemiRgb[2] * 8),
      ),
    );

    const g =
      this._world != null
        ? resolveGravityAccel(this._world.resources.GravityEnvironment)
        : (frame.forces?.gravity ?? ([0, -1, 0] as Vec3));
    const gLen = Math.hypot(g[0], g[1], g[2]);
    effect.setVector3(
      'uGravityDir',
      gLen > 1e-6
        ? new Vector3(g[0] / gLen, g[1] / gLen, g[2] / gLen)
        : new Vector3(0, -1, 0),
    );

    effect.setVector3(
      'uFluidCenter',
      new Vector3(
        water.centerWorld[0] - camPos.x,
        water.centerWorld[1] - camPos.y,
        water.centerWorld[2] - camPos.z,
      ),
    );
    effect.setVector3('uFluidHalfExt', new Vector3(...water.halfExtents));
    effect.setVector3('uAxisX', new Vector3(...water.axisX));
    effect.setVector3('uAxisY', new Vector3(...water.axisY));
    effect.setVector3('uAxisZ', new Vector3(...water.axisZ));
    effect.setVector3('uWaterColor', new Vector3(...water.colorRgb));
    effect.setFloat('uOpticalDensity', water.opticalDensity);
    effect.setFloat('uScatter', water.scatter);
    effect.setFloat('uAbsorb', water.absorption);
    effect.setFloat('uCausticStrength', water.causticStrength);
    effect.setFloat('uFoamStrength', water.foamStrength);
    effect.setFloat('uIor', water.ior);
    effect.setFloat('uFillFraction', water.fillFraction);
    effect.setFloat('uWaveAmp', water.waveAmplitude);
    effect.setFloat('uWaveFreq', water.waveFrequency);
    effect.setFloat('uWaveSteep', water.waveSteepness);
    effect.setFloat('uTime', frame.timeS);
    effect.setFloat('uRefractionMultiplier', 1.0);
    effect.setFloat('uExtinctionScale', 1.0);
    effect.setFloat('uEnableRefraction', frame.quality.fluidEnableRefraction);
    effect.setFloat('uMaxSurfaceBounces', frame.quality.fluidMaxSurfaceBounces);
    effect.setFloat('uSurfaceSamples', frame.quality.fluidSurfaceSamples);
  }

  dispose(): void {
    this.tanks.clear();
    if (this._camera && this.waterCompose) {
      this._camera.detachPostProcess(this.waterCompose);
    }
    this.waterCompose?.dispose();
    this.waterCompose = null;
    this._envDummy?.dispose();
    this._envDummy = null;
    this._camera = null;
    this._world = null;
    this._sceneDepth = null;
    this._envTex = null;
    this._frame = null;
    this._active = null;
  }
}
