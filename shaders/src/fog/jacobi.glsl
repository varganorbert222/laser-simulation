/** Jacobi pressure iteration: P' = (sum neighbors - div) / 6.
 * Legacy free-surface Dirichlet (uUseFreeSurface) unused for fog/smoke. */
precision highp float;

varying vec2 vUV;
uniform sampler2D textureSampler; // pressure
uniform sampler2D uDivergence;
uniform sampler2D uPhi;
uniform float uUseFreeSurface; // 1 = water level-set Dirichlet air

// @include ./atlas.glsl

void main(void) {
  vec3 ijk = atlasUvToVoxel(vUV);
  if (!voxelInBounds(ijk)) {
    gl_FragColor = vec4(0.0);
    return;
  }
  if (uUseFreeSurface > 0.5 && texture2D(uPhi, vUV).r > 0.0) {
    gl_FragColor = vec4(0.0);
    return;
  }
  float n = uGridRes;
  vec3 dx = vec3(1.0, 0.0, 0.0);
  vec3 dy = vec3(0.0, 1.0, 0.0);
  vec3 dz = vec3(0.0, 0.0, 1.0);
  float pL = sampleAtlas(textureSampler, clamp(ijk - dx, vec3(0.0), vec3(n - 1.0))).r;
  float pR = sampleAtlas(textureSampler, clamp(ijk + dx, vec3(0.0), vec3(n - 1.0))).r;
  float pB = sampleAtlas(textureSampler, clamp(ijk - dy, vec3(0.0), vec3(n - 1.0))).r;
  float pT = sampleAtlas(textureSampler, clamp(ijk + dy, vec3(0.0), vec3(n - 1.0))).r;
  float pD = sampleAtlas(textureSampler, clamp(ijk - dz, vec3(0.0), vec3(n - 1.0))).r;
  float pU = sampleAtlas(textureSampler, clamp(ijk + dz, vec3(0.0), vec3(n - 1.0))).r;
  float div = texture2D(uDivergence, vUV).r;
  float p = (pL + pR + pB + pT + pD + pU - div) / 6.0;
  gl_FragColor = vec4(p, 0.0, 0.0, 1.0);
}
