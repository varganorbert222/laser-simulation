import {
  Color3,
  PointLight,
  SpotLight,
  Vector3,
  type Light,
  type Scene,
} from '@babylonjs/core';
import {
  laserDotDisplayBrightness,
  lightWorldPose,
  MAX_GPU_LIGHTS,
  normalizeChromaticity,
  normalizeOpticsSpill,
  wavelengthToRgb,
  type LightEmitter,
  type World,
} from '../../../engine';

/**
 * Surface lighting via Babylon lights (StandardMaterial diffuse + specular),
 * matching the working e1233f9 path and Unity Point / Spot classes:
 *
 *   omni_lamp           → PointLight
 *   spotlight / laser /
 *   parallel            → SpotLight (localized spot + specular; laser = tight cone ≈ collimated)
 *
 * Volumetrics still use BeamModel / evalRadianceField separately.
 */
export class SurfaceLightSync {
  private readonly lights = new Map<string, Light>();

  constructor(private readonly scene: Scene) {}

  sync(world: World): void {
    const alive = new Set<string>();
    let bound = 0;
    for (const id of world.query('LightEmitter', 'Transform')) {
      const emitter = world.get(id, 'LightEmitter');
      if (!emitter?.enabled) continue;
      if (bound >= MAX_GPU_LIGHTS) continue;
      bound++;
      alive.add(id);

      const pose = lightWorldPose(world, id);
      const rgb = normalizeChromaticity(wavelengthToRgb(emitter.wavelengthNm));
      const vision = world.resources.DisplayVision;
      const env = world.resources.EnvironmentLighting;
      const power = laserDotDisplayBrightness(emitter.powerW, emitter.wavelengthNm, {
        ambientLevel: env.ambientLevel,
        responseCurve: vision.responseCurve,
      });
      // Match e1233f9 display scale so specular/diffuse read on StandardMaterial.
      const intensity = Math.max(0, power) * 2;
      const color = new Color3(rgb[0], rgb[1], rgb[2]);
      const pos = new Vector3(pose.position[0], pose.position[1], pose.position[2]);
      const dir = new Vector3(pose.direction[0], pose.direction[1], pose.direction[2]);

      const wantOmni = emitter.params.mode === 'omni_lamp';
      let light = this.lights.get(id);

      if (wantOmni) {
        if (!(light instanceof PointLight)) {
          light?.dispose();
          light = new PointLight(`surface_${id}`, pos, this.scene);
          this.lights.set(id, light);
        }
        const point = light as PointLight;
        point.position.copyFrom(pos);
        point.diffuse = color;
        point.specular = color;
        point.intensity = intensity;
        const soft =
          emitter.params.mode === 'omni_lamp' ? emitter.params.omni.softRadiusM : 4;
        point.range = Math.max(soft * 8, 6);
      } else {
        if (!(light instanceof SpotLight)) {
          light?.dispose();
          light = new SpotLight(`surface_${id}`, pos, dir, Math.PI / 6, 2, this.scene);
          this.lights.set(id, light);
        }
        const spot = light as SpotLight;
        spot.position.copyFrom(pos);
        spot.direction.copyFrom(dir);
        spot.diffuse = color;
        spot.specular = color;
        spot.intensity = intensity;
        const { angle, exponent } = spotShapeForEmitter(emitter);
        spot.angle = angle;
        spot.exponent = exponent;
        spot.range = 80;
      }
    }

    for (const [id, light] of [...this.lights.entries()]) {
      if (!alive.has(id)) {
        light.dispose();
        this.lights.delete(id);
      }
    }
  }

  dispose(): void {
    for (const light of this.lights.values()) light.dispose();
    this.lights.clear();
  }
}

function spotShapeForEmitter(emitter: LightEmitter): { angle: number; exponent: number } {
  const params = emitter.params;
  const spill = normalizeOpticsSpill(emitter.spill);
  const f = spill.strayPowerFraction;
  const spillWiden = 1 + f * 0.35;
  const spillSoft = f * 0.4;

  switch (params.mode) {
    case 'spotlight': {
      const outer = (params.spot.outerConeDeg * Math.PI) / 180;
      return {
        angle: Math.max(outer * 2 * spillWiden, 0.05),
        exponent: Math.max(params.spot.apertureSharpness * (1 - spillSoft * 0.5), 1),
      };
    }
    case 'laser': {
      const w0 = Math.max(params.laser.w0M, 0.0005);
      const m2 = Math.max(params.laser.m2, 1);
      // Tight cone ≈ collimated beam; M² widens / softens the spot.
      const angle = Math.max(
        0.02,
        Math.min(0.55, Math.atan(w0 * 12 * Math.sqrt(m2)) * 2 * spillWiden),
      );
      return {
        angle,
        exponent: Math.max(2, (8 + 24 / m2) * (1 - spillSoft * 0.6)),
      };
    }
    case 'parallel': {
      const residual = Math.max(params.parallel.residualMrad * 1e-3, 0.002);
      return {
        angle: Math.max(0.04, residual * 8 * spillWiden),
        exponent: Math.max(2, 16 * (1 - spillSoft * 0.5)),
      };
    }
    default:
      return { angle: (Math.PI / 5) * spillWiden, exponent: Math.max(1, 2 * (1 - spillSoft)) };
  }
}
