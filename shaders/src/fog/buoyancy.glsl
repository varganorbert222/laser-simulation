/**
 * Buoyancy + emitter injection into velocity (rgb) and optional density/temp (a / separate).
 * Writes velocity; density/temp updated in inject pass.
 */
precision highp float;

varying vec2 vUV;
uniform sampler2D textureSampler; // velocity
uniform sampler2D uTemperature;
uniform float uDt;
uniform float uBuoyancy;
uniform float uTempAmbient;
uniform vec3 uGravityDir; // usually (0,1,0) in grid space (up)

// @include ./atlas.glsl

void main(void) {
  vec3 ijk = atlasUvToVoxel(vUV);
  if (!voxelInBounds(ijk)) {
    gl_FragColor = vec4(0.0);
    return;
  }
  vec4 vel = texture2D(textureSampler, vUV);
  float T = texture2D(uTemperature, vUV).r;
  float force = uBuoyancy * (T - uTempAmbient);
  vel.rgb += normalize(uGravityDir + vec3(1e-5)) * force * uDt;
  gl_FragColor = vel;
}
