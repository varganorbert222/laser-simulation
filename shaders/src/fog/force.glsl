/**
 * External forces on velocity: gravity, wind, container fictitious accel.
 * Smoke density scales gravity; water uses densityScale ≈ 1 inside liquid.
 * Fictitious: -a - ω×(ω×r) - 2ω×v (linear + centrifugal + Coriolis).
 */
precision highp float;

varying vec2 vUV;
uniform sampler2D textureSampler; // velocity
uniform sampler2D uDensity; // smoke density or water φ (r)
uniform float uDt;
uniform float uDensityScaleMode; // 0 = use density.r, 1 = water φ
uniform float uWindCoupling;
uniform float uInertiaCoupling;
uniform float uBoundaryPad;
uniform vec3 uGravity; // grid-local accel
uniform vec3 uWind;
uniform vec3 uContainerLinearAccel;
uniform vec3 uContainerAngularVel;
uniform vec3 uContainerCom;

// @include ./atlas.glsl

void main(void) {
  vec3 ijk = atlasUvToVoxel(vUV);
  if (!voxelInBounds(ijk) || solidMask(ijk, uBoundaryPad) > 0.5) {
    gl_FragColor = vec4(0.0);
    return;
  }
  vec4 vel = texture2D(textureSampler, vUV);
  float dens = texture2D(uDensity, vUV).r;
  float densScale = uDensityScaleMode > 0.5
    ? (dens < 0.0 ? 1.0 : 0.0)
    : clamp(dens, 0.0, 4.0);

  vec3 r = ijk - uContainerCom;
  vec3 omega = uContainerAngularVel;
  vec3 centrifugal = cross(omega, cross(omega, r));
  vec3 coriolis = 2.0 * cross(omega, vel.rgb);
  vec3 fict = -uContainerLinearAccel - centrifugal - coriolis;

  vec3 force =
    uGravity * densScale +
    uWind * uWindCoupling +
    fict * uInertiaCoupling;
  vel.rgb += force * uDt;
  gl_FragColor = vel;
}
