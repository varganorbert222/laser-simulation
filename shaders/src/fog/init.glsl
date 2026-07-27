/** Initialize / clear fog solver fields (smoke density / velocity / temperature). */
precision highp float;

varying vec2 vUV;
uniform float uMode; // reserved (always clear)
uniform float uFillHeight;
uniform float uBoundaryPad;
uniform vec3 uGravityDirLocal;

// @include ./atlas.glsl

void main(void) {
  vec3 ijk = atlasUvToVoxel(vUV);
  if (!voxelInBounds(ijk)) {
    gl_FragColor = vec4(0.0);
    return;
  }
  gl_FragColor = vec4(0.0);
}
