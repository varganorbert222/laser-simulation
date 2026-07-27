/**
 * Scalar / vector field advection by velocity atlas (rgb = velocity in cells/s).
 * uAdvectionMode: 0 Semi-Lagrangian, 1 MacCormack, 2 BFECC.
 */
precision highp float;

varying vec2 vUV;
uniform sampler2D textureSampler;
uniform sampler2D uVelocity;
uniform float uDt;
uniform float uDissipation;
uniform float uAdvectionMode;

// @include ./atlas.glsl

vec4 advectSemi(sampler2D field, vec3 ijk, vec3 vel) {
  vec3 back = ijk - vel * uDt;
  return sampleAtlas(field, back);
}

vec4 advectMacCormack(sampler2D field, vec3 ijk, vec3 vel) {
  vec4 phiN = advectSemi(field, ijk, vel);
  vec3 fwd = ijk + vel * uDt;
  vec4 phiHat = sampleAtlas(field, fwd);
  vec3 velF = sampleAtlas(uVelocity, fwd).rgb;
  vec4 phiRev = sampleAtlas(field, fwd - velF * uDt);
  vec4 phi = phiN + 0.5 * (texture2D(field, voxelToAtlasUv(ijk)) - phiRev);
  vec4 lo = min(phiN, phiHat);
  vec4 hi = max(phiN, phiHat);
  return clamp(phi, lo, hi);
}

vec4 advectBfecc(sampler2D field, vec3 ijk, vec3 vel) {
  vec4 phiN = advectSemi(field, ijk, vel);
  vec3 fwd = ijk + vel * uDt;
  vec3 velF = sampleAtlas(uVelocity, fwd).rgb;
  vec4 phiHat = sampleAtlas(field, fwd - velF * uDt);
  vec4 err = texture2D(field, voxelToAtlasUv(ijk)) - phiHat;
  vec4 phi = phiN + 0.5 * err;
  vec4 lo = min(phiN, phiHat);
  vec4 hi = max(phiN, phiHat);
  return clamp(phi, lo, hi);
}

void main(void) {
  vec3 ijk = atlasUvToVoxel(vUV);
  if (!voxelInBounds(ijk)) {
    gl_FragColor = vec4(0.0);
    return;
  }

  vec3 vel = texture2D(uVelocity, vUV).rgb;
  vec4 phi;
  if (uAdvectionMode > 1.5) {
    phi = advectBfecc(textureSampler, ijk, vel);
  } else if (uAdvectionMode > 0.5) {
    phi = advectMacCormack(textureSampler, ijk, vel);
  } else {
    phi = advectSemi(textureSampler, ijk, vel);
  }

  float damp = max(1.0 - uDissipation * uDt, 0.0);
  gl_FragColor = phi * damp;
}
