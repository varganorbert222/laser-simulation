/**
 * Subtract pressure gradient from velocity (make divergence-free).
 * Legacy free-surface project path (uUseFreeSurface) unused for fog/smoke.
 */
precision highp float;

varying vec2 vUV;
uniform sampler2D textureSampler; // velocity
uniform sampler2D uPressure;
uniform sampler2D uPhi;
uniform float uUseFreeSurface;

// @include ./atlas.glsl

void main(void) {
  vec3 ijk = atlasUvToVoxel(vUV);
  if (!voxelInBounds(ijk)) {
    gl_FragColor = vec4(0.0);
    return;
  }

  float n = uGridRes;
  vec3 dx = vec3(1.0, 0.0, 0.0);
  vec3 dy = vec3(0.0, 1.0, 0.0);
  vec3 dz = vec3(0.0, 0.0, 1.0);
  vec4 vel = texture2D(textureSampler, vUV);

  if (uUseFreeSurface > 0.5) {
    float phi = texture2D(uPhi, vUV).r;
    if (phi >= 0.0) {
      // Extrapolate from liquid neighbors so the interface can move; light damp.
      vec3 acc = vec3(0.0);
      float w = 0.0;
      vec4 nL = sampleAtlas(textureSampler, clamp(ijk - dx, vec3(0.0), vec3(n - 1.0)));
      vec4 nR = sampleAtlas(textureSampler, clamp(ijk + dx, vec3(0.0), vec3(n - 1.0)));
      vec4 nB = sampleAtlas(textureSampler, clamp(ijk - dy, vec3(0.0), vec3(n - 1.0)));
      vec4 nT = sampleAtlas(textureSampler, clamp(ijk + dy, vec3(0.0), vec3(n - 1.0)));
      vec4 nD = sampleAtlas(textureSampler, clamp(ijk - dz, vec3(0.0), vec3(n - 1.0)));
      vec4 nU = sampleAtlas(textureSampler, clamp(ijk + dz, vec3(0.0), vec3(n - 1.0)));
      float pL = sampleAtlas(uPhi, clamp(ijk - dx, vec3(0.0), vec3(n - 1.0))).r;
      float pR = sampleAtlas(uPhi, clamp(ijk + dx, vec3(0.0), vec3(n - 1.0))).r;
      float pB = sampleAtlas(uPhi, clamp(ijk - dy, vec3(0.0), vec3(n - 1.0))).r;
      float pT = sampleAtlas(uPhi, clamp(ijk + dy, vec3(0.0), vec3(n - 1.0))).r;
      float pD = sampleAtlas(uPhi, clamp(ijk - dz, vec3(0.0), vec3(n - 1.0))).r;
      float pU = sampleAtlas(uPhi, clamp(ijk + dz, vec3(0.0), vec3(n - 1.0))).r;
      if (pL < 0.0) { acc += nL.rgb; w += 1.0; }
      if (pR < 0.0) { acc += nR.rgb; w += 1.0; }
      if (pB < 0.0) { acc += nB.rgb; w += 1.0; }
      if (pT < 0.0) { acc += nT.rgb; w += 1.0; }
      if (pD < 0.0) { acc += nD.rgb; w += 1.0; }
      if (pU < 0.0) { acc += nU.rgb; w += 1.0; }
      if (w > 0.5) {
        vel.rgb = mix(vel.rgb, acc / w, 0.85) * 0.92;
      } else {
        vel.rgb *= 0.85;
      }
      gl_FragColor = vel;
      return;
    }
  }

  float pL = sampleAtlas(uPressure, clamp(ijk - dx, vec3(0.0), vec3(n - 1.0))).r;
  float pR = sampleAtlas(uPressure, clamp(ijk + dx, vec3(0.0), vec3(n - 1.0))).r;
  float pB = sampleAtlas(uPressure, clamp(ijk - dy, vec3(0.0), vec3(n - 1.0))).r;
  float pT = sampleAtlas(uPressure, clamp(ijk + dy, vec3(0.0), vec3(n - 1.0))).r;
  float pD = sampleAtlas(uPressure, clamp(ijk - dz, vec3(0.0), vec3(n - 1.0))).r;
  float pU = sampleAtlas(uPressure, clamp(ijk + dz, vec3(0.0), vec3(n - 1.0))).r;
  vel.rgb -= 0.5 * vec3(pR - pL, pT - pB, pU - pD);
  gl_FragColor = vel;
}
