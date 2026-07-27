/** No-slip / zero-density at solid walls; optional open-top outflow; level-set solid. */
precision highp float;

varying vec2 vUV;
uniform sampler2D textureSampler;
uniform float uBoundaryPad;
uniform float uMode; // 0 velocity (zero), 1 scalar (zero), 2 level-set (solid → +1)
uniform float uBoundaryOpenTop; // 1 = open top outflow for smoke

// @include ./atlas.glsl

void main(void) {
  vec3 ijk = atlasUvToVoxel(vUV);
  if (!voxelInBounds(ijk)) {
    gl_FragColor = vec4(0.0);
    return;
  }
  vec4 v = texture2D(textureSampler, vUV);
  float solid = solidMask(ijk, uBoundaryPad);
  // Open top: treat max-Y face as outflow (zero scalar, free velocity slip).
  if (uBoundaryOpenTop > 0.5 && ijk.y >= uGridRes - 1.5 - uBoundaryPad) {
    if (uMode < 0.5) {
      // Velocity: keep tangential, damp outward normal if pointing out.
      v.y = min(v.y, 0.0);
      gl_FragColor = v;
    } else if (uMode < 1.5) {
      gl_FragColor = vec4(0.0);
    } else {
      gl_FragColor = v;
    }
    return;
  }
  if (solid > 0.5) {
    if (uMode > 1.5) {
      // Level-set: keep solids non-liquid without forcing φ=+1 (that ate tank mass).
      gl_FragColor = vec4(max(v.r, 0.05), 0.0, 0.0, 1.0);
    } else {
      gl_FragColor = vec4(0.0);
    }
    return;
  }
  gl_FragColor = v;
}
