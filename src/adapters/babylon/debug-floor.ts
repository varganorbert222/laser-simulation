import { Color3, MeshBuilder, Vector3, type LinesMesh, type Scene } from '@babylonjs/core';

export interface DebugFloorOptions {
  center?: Vector3;
  extent?: number;
  step?: number;
  y?: number;
}

/** XZ line grid for spatial orientation during edit mode. */
export class DebugFloor {
  private readonly meshes: LinesMesh[] = [];

  constructor(scene: Scene, options: DebugFloorOptions = {}) {
    const y = options.y ?? 0;
    const extent = options.extent ?? 20;
    const step = options.step ?? 1;
    const center = options.center ?? Vector3.Zero();
    const lines: Vector3[][] = [];

    for (let x = -extent; x <= extent; x += step) {
      lines.push([
        new Vector3(center.x + x, y, center.z - extent),
        new Vector3(center.x + x, y, center.z + extent),
      ]);
    }
    for (let z = -extent; z <= extent; z += step) {
      lines.push([
        new Vector3(center.x - extent, y, center.z + z),
        new Vector3(center.x + extent, y, center.z + z),
      ]);
    }

    const grid = MeshBuilder.CreateLineSystem('debugFloorGrid', { lines }, scene);
    grid.color = new Color3(0.22, 0.32, 0.42);
    grid.isPickable = false;
    this.meshes.push(grid);

    const axis = MeshBuilder.CreateLineSystem(
      'debugFloorAxis',
      {
        lines: [
          [new Vector3(center.x, y, center.z), new Vector3(center.x + 2, y, center.z)],
          [new Vector3(center.x, y, center.z), new Vector3(center.x, y, center.z + 2)],
        ],
      },
      scene,
    );
    axis.color = new Color3(0.85, 0.4, 0.3);
    axis.isPickable = false;
    this.meshes.push(axis);
  }

  setEnabled(enabled: boolean): void {
    for (const mesh of this.meshes) mesh.setEnabled(enabled);
  }

  dispose(): void {
    for (const mesh of this.meshes) mesh.dispose();
    this.meshes.length = 0;
  }
}
