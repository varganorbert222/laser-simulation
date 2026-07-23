import {
  Constants,
  Effect,
  Matrix,
  Mesh,
  MeshBuilder,
  ShaderMaterial,
  Vector3,
  type AbstractMesh,
  type Camera,
  type Scene,
} from '@babylonjs/core';
import type { AtmosphereModel } from '@engine';
import type { AtmosphereLutBaker } from './atmosphere-lut-baker';
import {
  ATMOSPHERE_SKYBOX_FRAG,
  ATMOSPHERE_SKYBOX_SHADER,
  ATMOSPHERE_SKYBOX_VERT,
} from '../shaders/atmosphere-shaders';

Effect.ShadersStore[`${ATMOSPHERE_SKYBOX_SHADER}VertexShader`] = ATMOSPHERE_SKYBOX_VERT;
Effect.ShadersStore[`${ATMOSPHERE_SKYBOX_SHADER}FragmentShader`] = ATMOSPHERE_SKYBOX_FRAG;

const SKYBOX_UNIFORMS = [
  'uInvViewProj',
  'uPlanetCenter',
  'uPlanetRadius',
  'uAtmosphereRadius',
  'uRayleighScattering',
  'uRayleighScaleHeight',
  'uMieScattering',
  'uMieAbsorption',
  'uMieScaleHeight',
  'uMieG',
  'uOzoneAbsorption',
  'uOzoneCenterHeight',
  'uOzoneWidth',
  'uGroundAlbedo',
  'uSolarIrradiance',
  'uSunDirection',
  'uEyeHeight',
  'uSunAngularRadius',
  'uExposure',
  'uLutBlend',
] as const;

const SKYBOX_SAMPLERS = ['uSkyViewLUT', 'uTransmittanceLUT'] as const;

/**
 * Fullscreen far-plane sky: reconstructs view rays (same idea as volumetric) and
 * composites analytical sky + Sky View / Transmittance LUTs.
 */
export class AtmosphereSkybox {
  readonly mesh: AbstractMesh;
  readonly material: ShaderMaterial;
  private visible = false;
  private readonly invViewProj = Matrix.Identity();

  constructor(
    private readonly scene: Scene,
    private readonly baker: AtmosphereLutBaker,
  ) {
    // Clip-space style plane: vertex shader ignores world and writes NDC directly.
    this.mesh = MeshBuilder.CreatePlane(
      'atmosphereSkybox',
      { size: 2, sideOrientation: Mesh.DOUBLESIDE },
      scene,
    );
    this.mesh.isPickable = false;
    this.mesh.receiveShadows = false;
    this.mesh.applyFog = false;
    this.mesh.infiniteDistance = true;
    this.mesh.alwaysSelectAsActiveMesh = true;
    this.mesh.renderingGroupId = 0;
    // Parent under null; keep at origin — VS uses pure clip positions from the plane's local XY.
    this.mesh.position.set(0, 0, 0);
    this.mesh.rotation.set(0, 0, 0);
    this.mesh.scaling.set(1, 1, 1);

    this.material = new ShaderMaterial(
      'atmosphereSkyboxMat',
      scene,
      {
        vertex: ATMOSPHERE_SKYBOX_SHADER,
        fragment: ATMOSPHERE_SKYBOX_SHADER,
      },
      {
        attributes: ['position'],
        uniforms: [...SKYBOX_UNIFORMS],
        samplers: [...SKYBOX_SAMPLERS],
      },
    );
    this.material.backFaceCulling = false;
    this.material.disableDepthWrite = true;
    // LEQUAL + far-plane depth → only fills empty background; never covers scene.
    this.material.depthFunction = Constants.LEQUAL;
    this.mesh.material = this.material;
    this.mesh.setEnabled(false);
  }

  setEnabled(enabled: boolean): void {
    this.visible = enabled;
    this.mesh.setEnabled(enabled);
  }

  /**
   * Upload camera ray matrix + LUT samplers + atmosphere uniforms.
   */
  sync(
    camera: Camera,
    model: AtmosphereModel,
    sunLightDir: readonly [number, number, number],
    opts: {
      ambientLevel: number;
      exposure: number;
      sunAngularDiameterDeg: number;
      lutBlend: number;
      lutReady: boolean;
    },
  ): void {
    if (!this.visible) return;

    // Plane vertices are ±1 in local XY; force them into NDC via a fixed world matrix
    // so the vertex shader's `position` attribute maps to clip xy (Babylon plane is XY).
    // Our VS treats `position` as vec2 clip xy — ShaderMaterial binds mesh positions as vec3;
    // CreatePlane gives z=0, so position.xy is the clip corner. Scale mesh so local |xy|=1.
    this.mesh.freezeWorldMatrix();

    camera.getTransformationMatrix().invertToRef(this.invViewProj);

    const m = this.material;
    m.setMatrix('uInvViewProj', this.invViewProj);
    m.setTexture('uSkyViewLUT', this.baker.skyViewLut);
    m.setTexture('uTransmittanceLUT', this.baker.transmittanceLut);
    m.setVector3('uPlanetCenter', Vector3.Zero());
    m.setFloat('uPlanetRadius', model.planetRadius);
    m.setFloat('uAtmosphereRadius', model.atmosphereRadius);
    m.setVector3('uRayleighScattering', new Vector3(...model.rayleighScattering));
    m.setFloat('uRayleighScaleHeight', model.rayleighScaleHeight);
    m.setVector3('uMieScattering', new Vector3(...model.mieScattering));
    m.setVector3('uMieAbsorption', new Vector3(...model.mieAbsorption));
    m.setFloat('uMieScaleHeight', model.mieScaleHeight);
    m.setFloat('uMieG', model.mieG);
    m.setVector3('uOzoneAbsorption', new Vector3(...model.ozoneAbsorption));
    m.setFloat('uOzoneCenterHeight', model.ozoneCenterHeight);
    m.setFloat('uOzoneWidth', model.ozoneWidth);
    m.setVector3('uGroundAlbedo', new Vector3(...model.groundAlbedo));
    m.setVector3('uSolarIrradiance', new Vector3(...model.solarIrradiance));
    m.setVector3(
      'uSunDirection',
      new Vector3(sunLightDir[0], sunLightDir[1], sunLightDir[2]),
    );
    m.setFloat('uEyeHeight', 1);
    m.setFloat(
      'uSunAngularRadius',
      (opts.sunAngularDiameterDeg * 0.5 * Math.PI) / 180,
    );
    // Exposure is artistic; ambient still lifts the floor slightly for night→day eye feel.
    m.setFloat('uExposure', opts.exposure * (0.55 + opts.ambientLevel * 0.9));
    m.setFloat('uLutBlend', opts.lutReady ? opts.lutBlend : 0.0);
  }

  dispose(): void {
    this.material.dispose();
    this.mesh.dispose();
  }
}
