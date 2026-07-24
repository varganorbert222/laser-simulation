import {
  Effect,
  Mesh,
  MeshBuilder,
  RenderTargetTexture,
  ShaderMaterial,
  Texture,
  Vector3,
  type BaseTexture,
  type Scene,
  type StandardMaterial,
} from '@babylonjs/core';
import { ReflectionProbe } from '@babylonjs/core/Probes/reflectionProbe.js';
import type { AtmosphereModel } from '@engine';
import type { AtmosphereLutBaker } from './atmosphere-lut-baker';
import type { AtmosphereNightTextures } from './atmosphere-night-textures';
import {
  ATMOSPHERE_ENV_CAPTURE_SHADER,
  ATMOSPHERE_ENV_CAPTURE_VERT,
  ATMOSPHERE_SKYBOX_FRAG,
} from '../shaders/atmosphere-shaders';

Effect.ShadersStore[`${ATMOSPHERE_ENV_CAPTURE_SHADER}VertexShader`] =
  ATMOSPHERE_ENV_CAPTURE_VERT;
Effect.ShadersStore[`${ATMOSPHERE_ENV_CAPTURE_SHADER}FragmentShader`] =
  ATMOSPHERE_SKYBOX_FRAG;

const CAPTURE_UNIFORMS = [
  'world',
  'worldViewProjection',
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
  'uMoonAngularRadius',
  'uExposure',
  'uLutBlend',
  'uSkyboxHdrColors',
  'uNightExposure',
  'uMoonExposure',
  'uNightBlendStrength',
  'uSkyboxGroundColor',
  'uSkyboxEquatorColor',
] as const;

const CAPTURE_SAMPLERS = [
  'uSkyViewLUT',
  'uTransmittanceLUT',
  'uNightSkyMap',
  'uMoonMap',
] as const;

/** Face resolution for sky → IBL cubemap capture. */
export const ATMOSPHERE_ENV_CUBE_SIZE = 128;

/**
 * Captures the procedural atmosphere sky into a ReflectionProbe cubemap and
 * exposes it as `scene.environmentTexture` + StandardMaterial.reflectionTexture.
 */
export class AtmosphereEnvCubemap {
  readonly probe: ReflectionProbe;
  private readonly captureMesh: Mesh;
  private readonly material: ShaderMaterial;
  private lastKey = '';
  private active = false;

  constructor(
    private readonly scene: Scene,
    private readonly baker: AtmosphereLutBaker,
    private readonly night: AtmosphereNightTextures,
  ) {
    this.probe = new ReflectionProbe(
      'atmosphereEnvProbe',
      ATMOSPHERE_ENV_CUBE_SIZE,
      scene,
      true, // mipmaps — softens rough-ish reflections slightly
      true, // float/half when available
      false, // display-referred (matches skybox exposure)
    );
    this.probe.position = Vector3.Zero();
    this.probe.refreshRate = RenderTargetTexture.REFRESHRATE_RENDER_ONCE;

    const cube = this.probe.cubeTexture;
    cube.coordinatesMode = Texture.CUBIC_MODE;
    cube.level = 0.85;

    // Inverted box: probe cameras sit at the center and look out at the inner faces.
    this.captureMesh = MeshBuilder.CreateBox(
      'atmosphereEnvCapture',
      { size: 2, sideOrientation: Mesh.BACKSIDE },
      scene,
    );
    this.captureMesh.isPickable = false;
    this.captureMesh.receiveShadows = false;
    this.captureMesh.applyFog = false;
    this.captureMesh.infiniteDistance = true;
    this.captureMesh.position.set(0, 0, 0);
    this.captureMesh.setEnabled(false);

    this.material = new ShaderMaterial(
      'atmosphereEnvCaptureMat',
      scene,
      {
        vertex: ATMOSPHERE_ENV_CAPTURE_SHADER,
        fragment: ATMOSPHERE_ENV_CAPTURE_SHADER,
      },
      {
        attributes: ['position'],
        uniforms: [...CAPTURE_UNIFORMS],
        samplers: [...CAPTURE_SAMPLERS],
      },
    );
    this.material.backFaceCulling = false;
    this.material.disableDepthWrite = true;
    this.captureMesh.material = this.material;

    this.probe.renderList = [this.captureMesh];

    // Only visible while the probe is binding faces (stays out of the main camera).
    cube.onBeforeBindObservable.add(() => {
      this.captureMesh.setEnabled(true);
    });
    cube.onAfterUnbindObservable.add(() => {
      this.captureMesh.setEnabled(false);
    });
  }

  /** Cubemap used for IBL / reflections when atmosphere is active. */
  get texture(): BaseTexture | null {
    return this.active ? this.probe.cubeTexture : null;
  }

  /**
   * Upload sky uniforms and rebake the cubemap when sun/model/exposure change.
   */
  sync(
    model: AtmosphereModel,
    sunLightDir: readonly [number, number, number],
    opts: {
      ambientLevel: number;
      exposure: number;
      sunAngularDiameterDeg: number;
      lutBlend: number;
      lutReady: boolean;
      reflectionLevel: number;
      /** Derived from Quality.colorProfile — not an independent sky HDR switch. */
      skyboxHdrColors: boolean;
      nightExposure: number;
      moonAngularDiameterDeg: number;
      moonExposure: number;
      nightBlendStrength: number;
      skyboxGroundColor: readonly [number, number, number];
      skyboxEquatorColor: readonly [number, number, number];
    },
  ): void {
    this.active = true;
    this.probe.cubeTexture.level = opts.reflectionLevel;
    const m = this.material;
    m.setTexture('uSkyViewLUT', this.baker.skyViewLut);
    m.setTexture('uTransmittanceLUT', this.baker.transmittanceLut);
    m.setTexture('uNightSkyMap', this.night.nightSky);
    m.setTexture('uMoonMap', this.night.moon);
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
    const sunRad = (opts.sunAngularDiameterDeg * 0.5 * Math.PI) / 180;
    const moonRad = (opts.moonAngularDiameterDeg * 0.5 * Math.PI) / 180;
    m.setFloat('uSunAngularRadius', sunRad);
    m.setFloat('uMoonAngularRadius', moonRad);
    m.setFloat('uExposure', opts.exposure * (0.55 + opts.ambientLevel * 0.9));
    m.setFloat('uLutBlend', opts.lutReady ? opts.lutBlend : 0.0);
    m.setFloat('uSkyboxHdrColors', opts.skyboxHdrColors ? 1 : 0);
    m.setFloat('uNightExposure', opts.nightExposure);
    m.setFloat('uMoonExposure', opts.moonExposure);
    m.setFloat('uNightBlendStrength', opts.nightBlendStrength);
    m.setVector3(
      'uSkyboxGroundColor',
      new Vector3(
        opts.skyboxGroundColor[0],
        opts.skyboxGroundColor[1],
        opts.skyboxGroundColor[2],
      ),
    );
    m.setVector3(
      'uSkyboxEquatorColor',
      new Vector3(
        opts.skyboxEquatorColor[0],
        opts.skyboxEquatorColor[1],
        opts.skyboxEquatorColor[2],
      ),
    );

    const key = [
      sunLightDir[0].toFixed(4),
      sunLightDir[1].toFixed(4),
      sunLightDir[2].toFixed(4),
      opts.ambientLevel.toFixed(3),
      opts.exposure.toFixed(3),
      opts.sunAngularDiameterDeg.toFixed(3),
      opts.lutBlend.toFixed(2),
      opts.lutReady ? '1' : '0',
      opts.skyboxHdrColors ? '1' : '0',
      opts.nightExposure.toFixed(3),
      opts.moonAngularDiameterDeg.toFixed(3),
      opts.moonExposure.toFixed(3),
      opts.nightBlendStrength.toFixed(2),
      opts.skyboxGroundColor[0].toFixed(3),
      opts.skyboxGroundColor[1].toFixed(3),
      opts.skyboxGroundColor[2].toFixed(3),
      opts.skyboxEquatorColor[0].toFixed(3),
      opts.skyboxEquatorColor[1].toFixed(3),
      opts.skyboxEquatorColor[2].toFixed(3),
      model.planetRadius.toFixed(0),
      model.atmosphereRadius.toFixed(0),
    ].join('|');

    if (key !== this.lastKey && this.material.isReady(this.captureMesh)) {
      this.lastKey = key;
      this.probe.cubeTexture.resetRefreshCounter();
    }

    this.scene.environmentTexture = this.probe.cubeTexture;
  }

  /** Clear IBL when atmosphere is disabled. */
  clear(): void {
    this.active = false;
    this.lastKey = '';
    if (this.scene.environmentTexture === this.probe.cubeTexture) {
      this.scene.environmentTexture = null;
    }
  }

  /**
   * Bind cubemap reflections on a StandardMaterial from metalness/roughness.
   * Shared texture.level stays fixed; only metals / glossy surfaces get a slot.
   */
  applyToMaterial(
    mat: StandardMaterial,
    metalness: number,
    roughness: number,
  ): void {
    const tex = this.texture;
    const strength = Math.min(
      1,
      Math.max(0, metalness) * (1 - Math.max(0, Math.min(1, roughness)) * 0.7),
    );
    if (!tex || strength < 0.15) {
      if (mat.reflectionTexture === this.probe.cubeTexture) {
        mat.reflectionTexture = null;
      }
      return;
    }
    mat.reflectionTexture = this.probe.cubeTexture;
  }

  dispose(): void {
    this.clear();
    this.probe.dispose();
    this.material.dispose();
    this.captureMesh.dispose();
  }
}
