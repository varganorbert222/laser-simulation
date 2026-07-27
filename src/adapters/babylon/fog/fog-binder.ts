import {
  Color4,
  Constants,
  EffectRenderer,
  EffectWrapper,
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
  type GatheredFrame,
  type GpuFog,
  type Quat,
  type Vec3,
  type World,
} from '@engine';
import {
  FOG_ADVECT_FRAGMENT,
  FOG_ATLAS_UNIFORMS,
  FOG_BOUNDARIES_FRAGMENT,
  FOG_BUOYANCY_FRAGMENT,
  FOG_DIFFUSE_FRAGMENT,
  FOG_DIVERGENCE_FRAGMENT,
  FOG_FORCE_FRAGMENT,
  FOG_INIT_FRAGMENT,
  FOG_INJECT_FRAGMENT,
  FOG_JACOBI_FRAGMENT,
  FOG_PROJECT_FRAGMENT,
  FOG_VORTICITY_FRAGMENT,
} from '../shaders/load-shaders';

interface EffectLike {
  setFloat(name: string, v: number): void;
  setVector2(name: string, v: Vector2): void;
  setVector3(name: string, v: Vector3): void;
  setTexture(name: string, t: Texture | RenderTargetTexture | null): void;
}

interface PingPong {
  a: RenderTargetTexture;
  b: RenderTargetTexture;
  readIsA: boolean;
}

function ppRead(pp: PingPong): RenderTargetTexture {
  return pp.readIsA ? pp.a : pp.b;
}

function ppWrite(pp: PingPong): RenderTargetTexture {
  return pp.readIsA ? pp.b : pp.a;
}

function ppSwap(pp: PingPong): void {
  pp.readIsA = !pp.readIsA;
}

function clampVec3(v: Vec3, maxLen: number): Vec3 {
  const len = Math.hypot(v[0], v[1], v[2]);
  if (len <= maxLen || len < 1e-12) return v;
  const s = maxLen / len;
  return [v[0] * s, v[1] * s, v[2] * s];
}

interface FogXformHistory {
  pos: Vec3;
  rot: Quat;
  linearVel: Vec3;
  ready: boolean;
}

interface FogSimState {
  entityId: string;
  gridRes: number;
  tilesX: number;
  tilesY: number;
  atlasW: number;
  atlasH: number;
  velocity: PingPong;
  density: PingPong;
  temperature: PingPong;
  pressure: PingPong;
  divergence: RenderTargetTexture;
  initialized: boolean;
  xform: FogXformHistory;
}

/**
 * GPU Navier–Stokes fog/smoke solver via 2D slice-atlas RTTs + EffectRenderer passes.
 * Owns density atlases consumed by volumetric raymarch.
 */
export class FogBinder {
  private readonly scene: Scene;
  private readonly effectRenderer: EffectRenderer;
  private readonly states = new Map<string, FogSimState>();
  private readonly texType: number;

  private readonly advect: EffectWrapper;
  private readonly buoyancy: EffectWrapper;
  private readonly inject: EffectWrapper;
  private readonly vorticity: EffectWrapper;
  private readonly divergence: EffectWrapper;
  private readonly jacobi: EffectWrapper;
  private readonly project: EffectWrapper;
  private readonly boundaries: EffectWrapper;
  private readonly initFx: EffectWrapper;
  private readonly diffuse: EffectWrapper;
  private readonly force: EffectWrapper;

  private _world: World | null = null;
  private _activeFogs: GpuFog[] = [];
  private _frame: GatheredFrame | null = null;
  private _effectsReady = false;

  /** Density atlases aligned with GatheredFrame.fogs / fluids slot order. */
  readonly densityAtlases: (RenderTargetTexture | null)[] = [null, null];

  constructor(scene: Scene) {
    this.scene = scene;
    this.effectRenderer = new EffectRenderer(scene.getEngine());
    this.texType = this.pickHalfFloat();

    const mk = (
      name: string,
      fragmentShader: string,
      uniformNames: string[],
      samplerNames: string[],
    ) =>
      new EffectWrapper({
        engine: scene.getEngine(),
        name,
        fragmentShader,
        uniformNames: [...FOG_ATLAS_UNIFORMS, ...uniformNames],
        samplerNames,
        useAsPostProcess: true,
        allowEmptySourceTexture: true,
      });

    this.advect = mk('fogAdvect', FOG_ADVECT_FRAGMENT, ['uDt', 'uDissipation', 'uAdvectionMode'], [
      'textureSampler',
      'uVelocity',
    ]);
    this.buoyancy = mk(
      'fogBuoyancy',
      FOG_BUOYANCY_FRAGMENT,
      ['uDt', 'uBuoyancy', 'uTempAmbient', 'uGravityDir'],
      ['textureSampler', 'uTemperature'],
    );
    this.inject = mk(
      'fogInject',
      FOG_INJECT_FRAGMENT,
      [
        'uDt',
        'uEmissionRate',
        'uInjectTemp',
        'uMode',
        'uEmitterOrigin',
        'uEmitterDir',
        'uEmitterRadius',
        'uConeCos',
        'uPlumeLength',
        'uMaxDensity',
      ],
      ['textureSampler'],
    );
    this.vorticity = mk(
      'fogVorticity',
      FOG_VORTICITY_FRAGMENT,
      ['uDt', 'uVorticityStrength'],
      ['textureSampler'],
    );
    this.divergence = mk(
      'fogDivergence',
      FOG_DIVERGENCE_FRAGMENT,
      ['uUseFreeSurface'],
      ['textureSampler', 'uPhi'],
    );
    this.jacobi = mk(
      'fogJacobi',
      FOG_JACOBI_FRAGMENT,
      ['uUseFreeSurface'],
      ['textureSampler', 'uDivergence', 'uPhi'],
    );
    this.project = mk(
      'fogProject',
      FOG_PROJECT_FRAGMENT,
      ['uUseFreeSurface'],
      ['textureSampler', 'uPressure', 'uPhi'],
    );
    this.boundaries = mk(
      'fogBoundaries',
      FOG_BOUNDARIES_FRAGMENT,
      ['uBoundaryPad', 'uMode', 'uBoundaryOpenTop'],
      ['textureSampler'],
    );
    this.initFx = mk(
      'fogInit',
      FOG_INIT_FRAGMENT,
      ['uMode', 'uFillHeight', 'uBoundaryPad', 'uGravityDirLocal'],
      [],
    );
    this.diffuse = mk(
      'fogDiffuse',
      FOG_DIFFUSE_FRAGMENT,
      ['uViscosity', 'uDt'],
      ['textureSampler'],
    );
    this.force = mk(
      'fogForce',
      FOG_FORCE_FRAGMENT,
      [
        'uDt',
        'uDensityScaleMode',
        'uWindCoupling',
        'uInertiaCoupling',
        'uBoundaryPad',
        'uGravity',
        'uWind',
        'uContainerLinearAccel',
        'uContainerAngularVel',
        'uContainerCom',
      ],
      ['textureSampler', 'uDensity'],
    );
  }

  attach(
    world: World,
    _camera: Camera,
    _sceneDepth: Texture | null,
    _afterPostProcess?: unknown,
  ): void {
    this._world = world;
  }

  /** Step all active fog volumes; call before volumetric raymarch. Never throws into the render loop. */
  step(frame: GatheredFrame, dt: number): void {
    this._frame = frame;
    this._activeFogs = (frame.fogs?.length ? frame.fogs : frame.fluids).slice(0, 2);
    this.densityAtlases[0] = null;
    this.densityAtlases[1] = null;

    if (!this.effectsAreReady()) {
      return;
    }

    try {
      const live = new Set(this._activeFogs.map((f) => f.entityId));
      for (const id of [...this.states.keys()]) {
        if (!live.has(id)) {
          this.disposeState(this.states.get(id)!);
          this.states.delete(id);
        }
      }

      for (let i = 0; i < this._activeFogs.length; i++) {
        const f = this._activeFogs[i]!;
        const state = this.ensureState(f);
        this.simulate(state, f, clampSimDt(dt, 40, 0.85));
        this.densityAtlases[i] = ppRead(state.density);
      }
    } catch (err) {
      console.warn('[FogBinder] step failed', err);
    } finally {
      this.scene.getEngine().restoreDefaultFramebuffer();
    }
  }

  private effectsAreReady(): boolean {
    if (this._effectsReady) return true;
    const wrappers = [
      this.advect,
      this.buoyancy,
      this.inject,
      this.vorticity,
      this.divergence,
      this.jacobi,
      this.project,
      this.boundaries,
      this.initFx,
      this.diffuse,
      this.force,
    ];
    for (const w of wrappers) {
      if (!w.isReady() || !w.effect?.isReady()) return false;
    }
    this._effectsReady = true;
    return true;
  }

  dispose(): void {
    for (const s of this.states.values()) this.disposeState(s);
    this.states.clear();
    this.effectRenderer.dispose();
  }

  private ensureState(f: GpuFog): FogSimState {
    let s = this.states.get(f.entityId);
    if (s && (s.gridRes !== f.gridRes || s.atlasW !== f.atlasWidth)) {
      this.disposeState(s);
      this.states.delete(f.entityId);
      s = undefined;
    }
    if (s) return s;

    const mkRtt = (name: string) => {
      const rtt = new RenderTargetTexture(
        name,
        { width: f.atlasWidth, height: f.atlasHeight },
        this.scene,
        false,
        true,
        this.texType,
        false,
        Constants.TEXTURE_BILINEAR_SAMPLINGMODE,
        false,
        false,
      );
      rtt.clearColor = new Color4(0, 0, 0, 0);
      rtt.wrapU = Constants.TEXTURE_CLAMP_ADDRESSMODE;
      rtt.wrapV = Constants.TEXTURE_CLAMP_ADDRESSMODE;
      rtt.renderList = [];
      return rtt;
    };

    const mkPp = (base: string): PingPong => ({
      a: mkRtt(`${base}A`),
      b: mkRtt(`${base}B`),
      readIsA: true,
    });

    s = {
      entityId: f.entityId,
      gridRes: f.gridRes,
      tilesX: f.tilesX,
      tilesY: f.tilesY,
      atlasW: f.atlasWidth,
      atlasH: f.atlasHeight,
      velocity: mkPp(`fogVel_${f.entityId}`),
      density: mkPp(`fogDen_${f.entityId}`),
      temperature: mkPp(`fogTemp_${f.entityId}`),
      pressure: mkPp(`fogPrs_${f.entityId}`),
      divergence: mkRtt(`fogDiv_${f.entityId}`),
      initialized: false,
      xform: {
        pos: [0, 0, 0],
        rot: [0, 0, 0, 1],
        linearVel: [0, 0, 0],
        ready: false,
      },
    };
    this.states.set(f.entityId, s);
    return s;
  }

  private disposeState(s: FogSimState): void {
    for (const r of [
      s.velocity.a,
      s.velocity.b,
      s.density.a,
      s.density.b,
      s.temperature.a,
      s.temperature.b,
      s.pressure.a,
      s.pressure.b,
      s.divergence,
    ]) {
      r.dispose();
    }
  }

  private simulate(s: FogSimState, f: GpuFog, dt: number): void {
    const frame = this._frame;
    const gravity = frame?.forces.gravity ?? ([0, -9.5, 0] as Vec3);
    const wind = frame?.forces.wind ?? ([0, 0, 0] as Vec3);
    const { linearAccel, angularVel } = this.updateContainerInertia(s, f, dt);

    if (!s.initialized) {
      const ok = this.runInit(s, f);
      if (!ok) return;
      s.initialized = true;
    }

    this.runAdvect(s, s.velocity, ppRead(s.velocity), f.dissipation * 0.25, dt, f.advectionMode);
    if (f.viscosity > 1e-6) {
      this.runDiffuse(s, s.velocity, f.viscosity, dt);
    }
    this.runForce(s, f, gravity, wind, linearAccel, angularVel, dt);
    this.runAdvect(s, s.density, ppRead(s.velocity), f.dissipation, dt, f.advectionMode);
    this.runAdvect(
      s,
      s.temperature,
      ppRead(s.velocity),
      f.dissipation * 0.5,
      dt,
      f.advectionMode,
    );
    this.runBuoyancy(s, f, dt);
    this.runInject(s, s.density, f, 0, dt);
    this.runInject(s, s.temperature, f, 1, dt);

    if (f.vorticityStrength > 1e-4) {
      this.runVorticity(s, f, dt);
    }
    this.runDivergence(s);
    this.runInitField(s, s.pressure);
    for (let i = 0; i < f.jacobiIterations; i++) {
      this.runJacobi(s);
    }
    this.runProject(s);
    this.runBoundaries(s, s.velocity, f.boundaryPad, 0, f.boundaryMode);
    this.runBoundaries(s, s.density, f.boundaryPad, 1, f.boundaryMode);
    this.runBoundaries(s, s.temperature, f.boundaryPad, 1, f.boundaryMode);
  }

  private updateContainerInertia(
    s: FogSimState,
    f: GpuFog,
    dt: number,
  ): { linearAccel: Vec3; angularVel: Vec3 } {
    const pos = f.centerWorld;
    let rot: Quat = [0, 0, 0, 1];
    const wx = this._world?.get(f.entityId, 'WorldXform');
    if (wx?.matrix) {
      rot = getRotation(wx.matrix);
    }
    const h = s.xform;
    if (!h.ready || dt < 1e-6) {
      h.pos = [...pos] as Vec3;
      h.rot = rot;
      h.linearVel = [0, 0, 0];
      h.ready = true;
      return { linearAccel: [0, 0, 0], angularVel: [0, 0, 0] };
    }
    const invDt = 1 / dt;
    const linearVel: Vec3 = [
      (pos[0] - h.pos[0]) * invDt,
      (pos[1] - h.pos[1]) * invDt,
      (pos[2] - h.pos[2]) * invDt,
    ];
    let linearAccel: Vec3 = [
      (linearVel[0] - h.linearVel[0]) * invDt,
      (linearVel[1] - h.linearVel[1]) * invDt,
      (linearVel[2] - h.linearVel[2]) * invDt,
    ];
    let ang = angularVelocity(h.rot, rot, dt);
    ang = clampVec3(ang, 12);
    linearAccel = clampVec3(linearAccel, 40);
    h.pos = [...pos] as Vec3;
    h.rot = rot;
    h.linearVel = linearVel;
    return { linearAccel, angularVel: ang };
  }

  private runForce(
    s: FogSimState,
    f: GpuFog,
    gravity: Vec3,
    wind: Vec3,
    linearAccel: Vec3,
    angularVel: Vec3,
    dt: number,
  ): void {
    const n = s.gridRes;
    const ax = f.axisX;
    const ay = f.axisY;
    const az = f.axisZ;
    const gLocal = new Vector3(
      gravity[0] * ax[0] + gravity[1] * ax[1] + gravity[2] * ax[2],
      gravity[0] * ay[0] + gravity[1] * ay[1] + gravity[2] * ay[2],
      gravity[0] * az[0] + gravity[1] * az[1] + gravity[2] * az[2],
    );
    const wLocal = new Vector3(
      wind[0] * ax[0] + wind[1] * ax[1] + wind[2] * ax[2],
      wind[0] * ay[0] + wind[1] * ay[1] + wind[2] * ay[2],
      wind[0] * az[0] + wind[1] * az[1] + wind[2] * az[2],
    );
    const aLocal = new Vector3(
      linearAccel[0] * ax[0] + linearAccel[1] * ax[1] + linearAccel[2] * ax[2],
      linearAccel[0] * ay[0] + linearAccel[1] * ay[1] + linearAccel[2] * ay[2],
      linearAccel[0] * az[0] + linearAccel[1] * az[1] + linearAccel[2] * az[2],
    );
    const oLocal = new Vector3(
      angularVel[0] * ax[0] + angularVel[1] * ax[1] + angularVel[2] * ax[2],
      angularVel[0] * ay[0] + angularVel[1] * ay[1] + angularVel[2] * ay[2],
      angularVel[0] * az[0] + angularVel[1] * az[1] + angularVel[2] * az[2],
    );
    const ok = this.renderTo(this.force, ppWrite(s.velocity), (e) => {
      this.bindAtlas(e, s);
      e.setFloat('uDt', dt);
      e.setFloat('uDensityScaleMode', 0);
      e.setFloat('uWindCoupling', f.windCoupling);
      e.setFloat('uInertiaCoupling', f.inertiaCoupling);
      e.setFloat('uBoundaryPad', f.boundaryPad);
      e.setVector3('uGravity', gLocal);
      e.setVector3('uWind', wLocal);
      e.setVector3('uContainerLinearAccel', aLocal);
      e.setVector3('uContainerAngularVel', oLocal);
      e.setVector3('uContainerCom', new Vector3(n * 0.5, n * 0.5, n * 0.5));
      e.setTexture('textureSampler', ppRead(s.velocity));
      e.setTexture('uDensity', ppRead(s.density));
    });
    if (ok) ppSwap(s.velocity);
  }

  private bindAtlas(effect: EffectLike, s: FogSimState): void {
    effect.setFloat('uGridRes', s.gridRes);
    effect.setFloat('uTilesX', s.tilesX);
    effect.setFloat('uTilesY', s.tilesY);
    effect.setVector2('uAtlasSize', new Vector2(s.atlasW, s.atlasH));
  }

  private renderTo(
    fx: EffectWrapper,
    target: RenderTargetTexture,
    apply: (e: EffectLike) => void,
  ): boolean {
    if (!fx.isReady() || !fx.effect?.isReady()) return false;
    fx.onApplyObservable.clear();
    fx.onApplyObservable.add(() => {
      const effect = fx.effect;
      if (!effect) return;
      apply(effect as unknown as EffectLike);
    });
    const rt = target.renderTarget;
    if (rt) {
      const engine = this.scene.getEngine();
      engine.bindFramebuffer(rt);
      engine.clear(target.clearColor, true, true, true);
      engine.unBindFramebuffer(rt);
    }
    this.effectRenderer.render(fx, target);
    return true;
  }

  private runInit(s: FogSimState, f: GpuFog): boolean {
    for (const pp of [s.velocity, s.density, s.temperature, s.pressure]) {
      if (!this.runInitField(s, pp)) return false;
    }
    if (
      !this.renderTo(this.initFx, s.divergence, (e) => {
        this.bindAtlas(e, s);
        e.setFloat('uMode', 0);
        e.setFloat('uFillHeight', 0);
        e.setFloat('uBoundaryPad', f.boundaryPad);
        e.setVector3('uGravityDirLocal', new Vector3(0, -1, 0));
      })
    ) {
      return false;
    }
    return true;
  }

  private runInitField(s: FogSimState, pp: PingPong): boolean {
    if (
      this.renderTo(this.initFx, ppWrite(pp), (e) => {
        this.bindAtlas(e, s);
        e.setFloat('uMode', 0);
        e.setFloat('uFillHeight', 0);
        e.setFloat('uBoundaryPad', 0);
        e.setVector3('uGravityDirLocal', new Vector3(0, -1, 0));
      })
    ) {
      ppSwap(pp);
      return true;
    }
    return false;
  }

  private runAdvect(
    s: FogSimState,
    field: PingPong,
    velocity: RenderTargetTexture,
    dissipation: number,
    dt: number,
    advectionMode = 1,
  ): void {
    if (
      this.renderTo(this.advect, ppWrite(field), (e) => {
        this.bindAtlas(e, s);
        e.setFloat('uDt', dt);
        e.setFloat('uDissipation', dissipation);
        e.setFloat('uAdvectionMode', advectionMode);
        e.setTexture('textureSampler', ppRead(field));
        e.setTexture('uVelocity', velocity);
      })
    ) {
      ppSwap(field);
    }
  }

  private runDiffuse(s: FogSimState, field: PingPong, viscosity: number, dt: number): void {
    if (
      this.renderTo(this.diffuse, ppWrite(field), (e) => {
        this.bindAtlas(e, s);
        e.setFloat('uViscosity', viscosity);
        e.setFloat('uDt', dt);
        e.setTexture('textureSampler', ppRead(field));
      })
    ) {
      ppSwap(field);
    }
  }

  private runBuoyancy(s: FogSimState, f: GpuFog, dt: number): void {
    const up = new Vector3(0, 1, 0);
    if (
      this.renderTo(this.buoyancy, ppWrite(s.velocity), (e) => {
        this.bindAtlas(e, s);
        e.setFloat('uDt', dt);
        e.setFloat('uBuoyancy', f.buoyancy);
        e.setFloat('uTempAmbient', f.temperatureAmbient);
        e.setVector3('uGravityDir', up);
        e.setTexture('textureSampler', ppRead(s.velocity));
        e.setTexture('uTemperature', ppRead(s.temperature));
      })
    ) {
      ppSwap(s.velocity);
    }
  }

  private runInject(s: FogSimState, field: PingPong, f: GpuFog, mode: number, dt: number): void {
    const n = s.gridRes;
    const origin = new Vector3(n * 0.5, n * 0.08, n * 0.5);
    const dir = new Vector3(0, 1, 0);
    const plumeLenVox = Math.max(
      2,
      Math.min(n * 0.9, f.plumeLengthM * (n / Math.max(f.halfExtents[1] * 2, 0.5))),
    );
    if (
      this.renderTo(this.inject, ppWrite(field), (e) => {
        this.bindAtlas(e, s);
        e.setFloat('uDt', dt);
        e.setFloat('uEmissionRate', Math.max(f.emissionRate, 0));
        e.setFloat('uInjectTemp', 2.5);
        e.setFloat('uMode', mode);
        e.setVector3('uEmitterOrigin', origin);
        e.setVector3('uEmitterDir', dir);
        e.setFloat('uEmitterRadius', Math.max(1.5, n * 0.08));
        e.setFloat('uConeCos', f.coneCos);
        e.setFloat('uPlumeLength', plumeLenVox);
        e.setFloat('uMaxDensity', Math.max(f.maxDensity, 0.05));
        e.setTexture('textureSampler', ppRead(field));
      })
    ) {
      ppSwap(field);
    }
  }

  private runVorticity(s: FogSimState, f: GpuFog, dt: number): void {
    if (
      this.renderTo(this.vorticity, ppWrite(s.velocity), (e) => {
        this.bindAtlas(e, s);
        e.setFloat('uDt', dt);
        e.setFloat('uVorticityStrength', f.vorticityStrength);
        e.setTexture('textureSampler', ppRead(s.velocity));
      })
    ) {
      ppSwap(s.velocity);
    }
  }

  private runDivergence(s: FogSimState): void {
    this.renderTo(this.divergence, s.divergence, (e) => {
      this.bindAtlas(e, s);
      e.setFloat('uUseFreeSurface', 0);
      e.setTexture('textureSampler', ppRead(s.velocity));
      // Shader still declares uPhi; bind density (unused when free-surface is off).
      e.setTexture('uPhi', ppRead(s.density));
    });
  }

  private runJacobi(s: FogSimState): void {
    if (
      this.renderTo(this.jacobi, ppWrite(s.pressure), (e) => {
        this.bindAtlas(e, s);
        e.setFloat('uUseFreeSurface', 0);
        e.setTexture('textureSampler', ppRead(s.pressure));
        e.setTexture('uDivergence', s.divergence);
        e.setTexture('uPhi', ppRead(s.density));
      })
    ) {
      ppSwap(s.pressure);
    }
  }

  private runProject(s: FogSimState): void {
    if (
      this.renderTo(this.project, ppWrite(s.velocity), (e) => {
        this.bindAtlas(e, s);
        e.setFloat('uUseFreeSurface', 0);
        e.setTexture('textureSampler', ppRead(s.velocity));
        e.setTexture('uPressure', ppRead(s.pressure));
        e.setTexture('uPhi', ppRead(s.density));
      })
    ) {
      ppSwap(s.velocity);
    }
  }

  private runBoundaries(
    s: FogSimState,
    field: PingPong,
    pad: number,
    mode: number,
    boundaryMode = 0,
  ): void {
    if (
      this.renderTo(this.boundaries, ppWrite(field), (e) => {
        this.bindAtlas(e, s);
        e.setFloat('uBoundaryPad', pad);
        e.setFloat('uMode', mode);
        e.setFloat('uBoundaryOpenTop', boundaryMode > 0.5 ? 1 : 0);
        e.setTexture('textureSampler', ppRead(field));
      })
    ) {
      ppSwap(field);
    }
  }

  private pickHalfFloat(): number {
    try {
      const probe = new RenderTargetTexture(
        'fogHdrProbe',
        { width: 4, height: 4 },
        this.scene,
        false,
        true,
        Constants.TEXTURETYPE_HALF_FLOAT,
        false,
        Constants.TEXTURE_BILINEAR_SAMPLINGMODE,
        false,
        false,
      );
      const ok = !!probe.getInternalTexture();
      probe.dispose();
      if (ok) return Constants.TEXTURETYPE_HALF_FLOAT;
    } catch {
      // fall through
    }
    return Constants.TEXTURETYPE_UNSIGNED_BYTE;
  }
}
