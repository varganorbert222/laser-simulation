import {
  Color3,
  Mesh,
  MeshBuilder,
  StandardMaterial,
  Vector3,
  type AbstractMesh,
  type LinesMesh,
  type Scene,
} from '@babylonjs/core';
import type { LightEmitter, World } from '@engine';

/** Unity-like yellow for light helpers. */
const GIZMO_COLOR = new Color3(1, 0.92, 0.16);
const INNER_CONE_COLOR = new Color3(1, 0.75, 0.12);
const DIR_LENGTH_M = 1.6;
const SPOT_LENGTH_M = 1.5;
const PARALLEL_LENGTH_M = 1.6;
const LASER_LENGTH_M = 1.8;

type HelperBundle = {
  root: Mesh;
  lines: LinesMesh[];
  meshes: AbstractMesh[];
};

/**
 * Viewport helpers for selected lights (Unity Editor style):
 * - directional / laser / sun / parallel → direction arrow (+ radius ring when relevant)
 * - spotlight / flashlight → direction + outer/inner cone
 * - omni_lamp → soft-radius wire sphere
 */
export class LightSelectionGizmos {
  private readonly helpers = new Map<string, HelperBundle>();
  private readonly signatures = new Map<string, string>();

  constructor(private readonly scene: Scene) {}

  sync(
    world: World,
    selectedIds: ReadonlySet<string>,
    fixtures: ReadonlyMap<string, AbstractMesh>,
    edit: boolean,
  ): void {
    if (!edit) {
      this.clear();
      return;
    }

    const wanted = new Set<string>();
    for (const id of selectedIds) {
      if (!world.has(id, 'LightEmitter')) continue;
      const fixture = fixtures.get(id);
      const emitter = world.get(id, 'LightEmitter');
      if (!fixture || !emitter || !fixture.isEnabled()) continue;
      wanted.add(id);
      this.ensure(id, fixture, emitter);
    }

    for (const id of [...this.helpers.keys()]) {
      if (!wanted.has(id)) this.remove(id);
    }
  }

  clear(): void {
    for (const id of [...this.helpers.keys()]) this.remove(id);
  }

  dispose(): void {
    this.clear();
  }

  private ensure(id: string, fixture: AbstractMesh, emitter: LightEmitter): void {
    const sig = signature(emitter);
    const existing = this.helpers.get(id);
    if (existing && this.signatures.get(id) === sig) {
      if (existing.root.parent !== fixture) {
        existing.root.parent = fixture;
        existing.root.position.set(0, 0, 0);
        existing.root.rotation.set(0, 0, 0);
        existing.root.scaling.set(1, 1, 1);
      }
      return;
    }
    this.remove(id);
    const bundle = buildHelper(this.scene, id, emitter);
    bundle.root.parent = fixture;
    bundle.root.position.set(0, 0, 0);
    bundle.root.rotation.set(0, 0, 0);
    bundle.root.scaling.set(1, 1, 1);
    this.helpers.set(id, bundle);
    this.signatures.set(id, sig);
  }

  private remove(id: string): void {
    const bundle = this.helpers.get(id);
    if (!bundle) return;
    for (const line of bundle.lines) line.dispose();
    for (const mesh of bundle.meshes) mesh.dispose();
    bundle.root.dispose();
    this.helpers.delete(id);
    this.signatures.delete(id);
  }
}

function signature(emitter: LightEmitter): string {
  const p = emitter.params;
  switch (p.mode) {
    case 'omni_lamp':
      return `omni:${p.omni.softRadiusM}`;
    case 'spotlight':
    case 'flashlight':
      return `${p.mode}:${p.spot.innerConeDeg}:${p.spot.outerConeDeg}`;
    case 'parallel':
      return `parallel:${p.parallel.beamRadiusM}:${p.parallel.residualMrad}`;
    case 'sun':
      return `sun:${p.sun.angularDiameterDeg}`;
    case 'laser':
      return `laser:${p.laser.w0M}:${p.laser.ellipticRatio}:${p.laser.probeDistanceM}`;
  }
}

function buildHelper(scene: Scene, id: string, emitter: LightEmitter): HelperBundle {
  const root = new Mesh(`lightGizmo_${id}`, scene);
  root.isPickable = false;
  root.metadata = { lightGizmo: true, entityId: id };

  const lines: LinesMesh[] = [];
  const meshes: AbstractMesh[] = [];
  const mode = emitter.params.mode;

  if (mode === 'omni_lamp') {
    meshes.push(makeRadiusSphere(scene, `lightGizmoSphere_${id}`, emitter.params.omni.softRadiusM, root));
  } else {
    const dirLines = directionArrowLines(DIR_LENGTH_M);
    lines.push(makeLineSystem(scene, `lightGizmoDir_${id}`, dirLines, GIZMO_COLOR, root));

    if (mode === 'spotlight' || mode === 'flashlight') {
      const { innerConeDeg, outerConeDeg } = emitter.params.spot;
      lines.push(
        makeLineSystem(
          scene,
          `lightGizmoOuterCone_${id}`,
          coneLines(degToRad(outerConeDeg), SPOT_LENGTH_M, 32, 8),
          GIZMO_COLOR,
          root,
        ),
      );
      if (innerConeDeg > 0.05 && innerConeDeg < outerConeDeg - 0.05) {
        lines.push(
          makeLineSystem(
            scene,
            `lightGizmoInnerCone_${id}`,
            coneLines(degToRad(innerConeDeg), SPOT_LENGTH_M * 0.92, 24, 4),
            INNER_CONE_COLOR,
            root,
          ),
        );
      }
    } else if (mode === 'parallel') {
      const r = Math.max(1e-4, emitter.params.parallel.beamRadiusM);
      const residualRad = Math.max(0, emitter.params.parallel.residualMrad) * 1e-3;
      lines.push(
        makeLineSystem(
          scene,
          `lightGizmoTube_${id}`,
          tubeLines(r, PARALLEL_LENGTH_M, residualRad, 24),
          GIZMO_COLOR,
          root,
        ),
      );
    } else if (mode === 'laser') {
      const { w0M, ellipticRatio, probeDistanceM } = emitter.params.laser;
      const len = Math.min(Math.max(probeDistanceM || LASER_LENGTH_M, 0.4), 4);
      const rx = Math.max(1e-4, w0M);
      const ry = Math.max(1e-4, w0M * Math.max(0.05, ellipticRatio));
      lines.push(
        makeLineSystem(
          scene,
          `lightGizmoLaser_${id}`,
          ellipticRingLines(rx, ry, len * 0.15, 32),
          GIZMO_COLOR,
          root,
        ),
      );
    } else if (mode === 'sun') {
      const half = degToRad(Math.max(0.01, emitter.params.sun.angularDiameterDeg) * 0.5);
      // Educational soft rim — tiny cone so angular size is visible at gizmo length.
      lines.push(
        makeLineSystem(
          scene,
          `lightGizmoSunCone_${id}`,
          coneLines(half, DIR_LENGTH_M, 16, 4),
          INNER_CONE_COLOR,
          root,
        ),
      );
    }
  }

  return { root, lines, meshes };
}

function makeLineSystem(
  scene: Scene,
  name: string,
  lines: Vector3[][],
  color: Color3,
  parent: Mesh,
): LinesMesh {
  const mesh = MeshBuilder.CreateLineSystem(name, { lines, updatable: false }, scene);
  mesh.color = color;
  mesh.isPickable = false;
  mesh.parent = parent;
  return mesh;
}

function makeRadiusSphere(scene: Scene, name: string, radiusM: number, parent: Mesh): AbstractMesh {
  const r = Math.max(1e-3, radiusM);
  const sphere = MeshBuilder.CreateSphere(name, { diameter: r * 2, segments: 20 }, scene);
  const mat = new StandardMaterial(`${name}_mat`, scene);
  mat.emissiveColor = GIZMO_COLOR;
  mat.disableLighting = true;
  mat.wireframe = true;
  mat.alpha = 0.85;
  sphere.material = mat;
  sphere.isPickable = false;
  sphere.parent = parent;
  return sphere;
}

/** Arrow along local +Z (emission axis). */
function directionArrowLines(length: number): Vector3[][] {
  const tip = new Vector3(0, 0, length);
  const head = length * 0.1;
  const headR = length * 0.035;
  return [
    [Vector3.Zero(), tip],
    [tip, new Vector3(headR, 0, length - head)],
    [tip, new Vector3(-headR, 0, length - head)],
    [tip, new Vector3(0, headR, length - head)],
    [tip, new Vector3(0, -headR, length - head)],
  ];
}

/** Spot cone: generators + far circle (Unity-style). */
function coneLines(
  halfAngleRad: number,
  length: number,
  circleSegments: number,
  generators: number,
): Vector3[][] {
  const angle = Math.max(1e-4, halfAngleRad);
  const r = length * Math.tan(angle);
  const lines: Vector3[][] = [];
  const circle: Vector3[] = [];
  for (let i = 0; i <= circleSegments; i++) {
    const a = (i / circleSegments) * Math.PI * 2;
    circle.push(new Vector3(Math.cos(a) * r, Math.sin(a) * r, length));
  }
  lines.push(circle);
  // Near ring (Unity often draws a small base ring)
  const nearZ = length * 0.2;
  const nearR = nearZ * Math.tan(angle);
  const near: Vector3[] = [];
  for (let i = 0; i <= circleSegments; i++) {
    const a = (i / circleSegments) * Math.PI * 2;
    near.push(new Vector3(Math.cos(a) * nearR, Math.sin(a) * nearR, nearZ));
  }
  lines.push(near);
  for (let i = 0; i < generators; i++) {
    const a = (i / generators) * Math.PI * 2;
    lines.push([Vector3.Zero(), new Vector3(Math.cos(a) * r, Math.sin(a) * r, length)]);
  }
  return lines;
}

/** Parallel tube: rings + generators; residual mrad widens far ring. */
function tubeLines(
  radiusM: number,
  length: number,
  residualRad: number,
  segments: number,
): Vector3[][] {
  const lines: Vector3[][] = [];
  const farR = radiusM + length * Math.tan(residualRad);
  const zs = [0.05, length * 0.5, length];
  const rs = [radiusM, radiusM + length * 0.5 * Math.tan(residualRad), farR];
  for (let ri = 0; ri < zs.length; ri++) {
    const ring: Vector3[] = [];
    const z = zs[ri]!;
    const r = Math.max(1e-4, rs[ri]!);
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      ring.push(new Vector3(Math.cos(a) * r, Math.sin(a) * r, z));
    }
    lines.push(ring);
  }
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    lines.push([
      new Vector3(c * radiusM, s * radiusM, 0.05),
      new Vector3(c * farR, s * farR, length),
    ]);
  }
  return lines;
}

function ellipticRingLines(rx: number, ry: number, z: number, segments: number): Vector3[][] {
  const ring: Vector3[] = [];
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    ring.push(new Vector3(Math.cos(a) * rx, Math.sin(a) * ry, z));
  }
  return [ring];
}

function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}
