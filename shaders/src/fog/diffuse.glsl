/**
 * Optional viscosity diffusion (Jacobi-style) for velocity or scalars.
 * Out = (1-a)*self + a*avg(neighbors); a from viscosity*dt.
 */
precision highp float;

varying vec2 vUV;
uniform sampler2D textureSampler;
uniform float uViscosity;
uniform float uDt;

// @include ./atlas.glsl

void main(void) {
  vec3 ijk = atlasUvToVoxel(vUV);
  if (!voxelInBounds(ijk)) {
    gl_FragColor = vec4(0.0);
    return;
  }
  float a = clamp(uViscosity * uDt * 6.0, 0.0, 0.95);
  if (a < 1e-6) {
    gl_FragColor = texture2D(textureSampler, vUV);
    return;
  }
  float n = uGridRes;
  vec3 dx = vec3(1.0, 0.0, 0.0);
  vec3 dy = vec3(0.0, 1.0, 0.0);
  vec3 dz = vec3(0.0, 0.0, 1.0);
  vec4 c = texture2D(textureSampler, vUV);
  vec4 sum =
    sampleAtlas(textureSampler, clamp(ijk - dx, vec3(0.0), vec3(n - 1.0))) +
    sampleAtlas(textureSampler, clamp(ijk + dx, vec3(0.0), vec3(n - 1.0))) +
    sampleAtlas(textureSampler, clamp(ijk - dy, vec3(0.0), vec3(n - 1.0))) +
    sampleAtlas(textureSampler, clamp(ijk + dy, vec3(0.0), vec3(n - 1.0))) +
    sampleAtlas(textureSampler, clamp(ijk - dz, vec3(0.0), vec3(n - 1.0))) +
    sampleAtlas(textureSampler, clamp(ijk + dz, vec3(0.0), vec3(n - 1.0)));
  gl_FragColor = mix(c, sum / 6.0, a);
}
