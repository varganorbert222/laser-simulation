/** Velocity divergence → pressure RHS. Water: air cells (φ ≥ 0) contribute 0. */
precision highp float;

varying vec2 vUV;
uniform sampler2D textureSampler; // velocity
uniform sampler2D uPhi;
uniform float uUseFreeSurface;

// @include ./atlas.glsl

void main(void) {
  vec3 ijk = atlasUvToVoxel(vUV);
  if (!voxelInBounds(ijk)) {
    gl_FragColor = vec4(0.0);
    return;
  }
  if (uUseFreeSurface > 0.5 && texture2D(uPhi, vUV).r >= 0.0) {
    gl_FragColor = vec4(0.0);
    return;
  }
  float n = uGridRes;
  vec3 dx = vec3(1.0, 0.0, 0.0);
  vec3 dy = vec3(0.0, 1.0, 0.0);
  vec3 dz = vec3(0.0, 0.0, 1.0);
  float vx1 = sampleAtlas(textureSampler, clamp(ijk + dx, vec3(0.0), vec3(n - 1.0))).x;
  float vx0 = sampleAtlas(textureSampler, clamp(ijk - dx, vec3(0.0), vec3(n - 1.0))).x;
  float vy1 = sampleAtlas(textureSampler, clamp(ijk + dy, vec3(0.0), vec3(n - 1.0))).y;
  float vy0 = sampleAtlas(textureSampler, clamp(ijk - dy, vec3(0.0), vec3(n - 1.0))).y;
  float vz1 = sampleAtlas(textureSampler, clamp(ijk + dz, vec3(0.0), vec3(n - 1.0))).z;
  float vz0 = sampleAtlas(textureSampler, clamp(ijk - dz, vec3(0.0), vec3(n - 1.0))).z;
  float div = 0.5 * (vx1 - vx0 + vy1 - vy0 + vz1 - vz0);
  gl_FragColor = vec4(div, 0.0, 0.0, 1.0);
}
