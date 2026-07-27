/** Vorticity confinement — restores swirling detail. */
precision highp float;

varying vec2 vUV;
uniform sampler2D textureSampler; // velocity
uniform float uDt;
uniform float uVorticityStrength;

// @include ./atlas.glsl

vec3 curlAt(vec3 ijk) {
  float n = uGridRes;
  vec3 dx = vec3(1.0, 0.0, 0.0);
  vec3 dy = vec3(0.0, 1.0, 0.0);
  vec3 dz = vec3(0.0, 0.0, 1.0);
  vec3 vp = sampleAtlas(textureSampler, clamp(ijk + dx, vec3(0.0), vec3(n - 1.0))).rgb;
  vec3 vm = sampleAtlas(textureSampler, clamp(ijk - dx, vec3(0.0), vec3(n - 1.0))).rgb;
  vec3 up = sampleAtlas(textureSampler, clamp(ijk + dy, vec3(0.0), vec3(n - 1.0))).rgb;
  vec3 um = sampleAtlas(textureSampler, clamp(ijk - dy, vec3(0.0), vec3(n - 1.0))).rgb;
  vec3 wp = sampleAtlas(textureSampler, clamp(ijk + dz, vec3(0.0), vec3(n - 1.0))).rgb;
  vec3 wm = sampleAtlas(textureSampler, clamp(ijk - dz, vec3(0.0), vec3(n - 1.0))).rgb;
  float cx = (up.z - um.z) - (wp.y - wm.y);
  float cy = (wp.x - wm.x) - (vp.z - vm.z);
  float cz = (vp.y - vm.y) - (up.x - um.x);
  return vec3(cx, cy, cz) * 0.5;
}

void main(void) {
  vec3 ijk = atlasUvToVoxel(vUV);
  if (!voxelInBounds(ijk)) {
    gl_FragColor = vec4(0.0);
    return;
  }
  vec4 vel = texture2D(textureSampler, vUV);
  if (uVorticityStrength < 1e-5) {
    gl_FragColor = vel;
    return;
  }
  float n = uGridRes;
  vec3 dx = vec3(1.0, 0.0, 0.0);
  vec3 dy = vec3(0.0, 1.0, 0.0);
  vec3 dz = vec3(0.0, 0.0, 1.0);
  float wL = length(curlAt(clamp(ijk - dx, vec3(0.0), vec3(n - 1.0))));
  float wR = length(curlAt(clamp(ijk + dx, vec3(0.0), vec3(n - 1.0))));
  float wB = length(curlAt(clamp(ijk - dy, vec3(0.0), vec3(n - 1.0))));
  float wT = length(curlAt(clamp(ijk + dy, vec3(0.0), vec3(n - 1.0))));
  float wD = length(curlAt(clamp(ijk - dz, vec3(0.0), vec3(n - 1.0))));
  float wU = length(curlAt(clamp(ijk + dz, vec3(0.0), vec3(n - 1.0))));
  vec3 eta = vec3(wR - wL, wT - wB, wU - wD);
  float el = length(eta) + 1e-5;
  vec3 N = eta / el;
  vec3 w = curlAt(ijk);
  vel.rgb += uVorticityStrength * cross(N, w) * uDt;
  gl_FragColor = vel;
}
