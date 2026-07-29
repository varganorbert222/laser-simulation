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

/** 3D grid ↔ 2D slice-atlas helpers. CPU twin: engine/physics/fog/atlas.ts */

uniform float uGridRes;
uniform float uTilesX;
uniform float uTilesY;
uniform vec2 uAtlasSize;

vec3 atlasUvToVoxel(vec2 uv) {
  float n = max(uGridRes, 1.0);
  float px = uv.x * uAtlasSize.x;
  float py = uv.y * uAtlasSize.y;
  float ix = floor(mod(px, n));
  float iy = floor(mod(py, n));
  float tileX = floor(px / n);
  float tileY = floor(py / n);
  float iz = tileY * uTilesX + tileX;
  return vec3(ix, iy, iz);
}

vec2 voxelToAtlasUv(vec3 ijk) {
  float n = max(uGridRes, 1.0);
  float iz = clamp(floor(ijk.z + 0.5), 0.0, n - 1.0);
  float tileX = mod(iz, uTilesX);
  float tileY = floor(iz / uTilesX);
  float px = tileX * n + ijk.x + 0.5;
  float py = tileY * n + ijk.y + 0.5;
  return vec2(px / uAtlasSize.x, py / uAtlasSize.y);
}

/** Trilinear sample of a scalar/vector field stored in an atlas. */
vec4 sampleAtlas(sampler2D tex, vec3 ijk) {
  vec3 p = ijk;
  vec3 i0 = floor(p);
  vec3 f = fract(p);
  vec4 c000 = texture2D(tex, voxelToAtlasUv(i0 + vec3(0.0, 0.0, 0.0)));
  vec4 c100 = texture2D(tex, voxelToAtlasUv(i0 + vec3(1.0, 0.0, 0.0)));
  vec4 c010 = texture2D(tex, voxelToAtlasUv(i0 + vec3(0.0, 1.0, 0.0)));
  vec4 c110 = texture2D(tex, voxelToAtlasUv(i0 + vec3(1.0, 1.0, 0.0)));
  vec4 c001 = texture2D(tex, voxelToAtlasUv(i0 + vec3(0.0, 0.0, 1.0)));
  vec4 c101 = texture2D(tex, voxelToAtlasUv(i0 + vec3(1.0, 0.0, 1.0)));
  vec4 c011 = texture2D(tex, voxelToAtlasUv(i0 + vec3(0.0, 1.0, 1.0)));
  vec4 c111 = texture2D(tex, voxelToAtlasUv(i0 + vec3(1.0, 1.0, 1.0)));
  vec4 c00 = mix(c000, c100, f.x);
  vec4 c10 = mix(c010, c110, f.x);
  vec4 c01 = mix(c001, c101, f.x);
  vec4 c11 = mix(c011, c111, f.x);
  vec4 c0 = mix(c00, c10, f.y);
  vec4 c1 = mix(c01, c11, f.y);
  return mix(c0, c1, f.z);
}

bool voxelInBounds(vec3 ijk) {
  float n = uGridRes;
  return ijk.x >= 0.0 && ijk.y >= 0.0 && ijk.z >= 0.0 &&
         ijk.x < n && ijk.y < n && ijk.z < n;
}

float solidMask(vec3 ijk, float boundaryPad) {
  float n = uGridRes;
  float pad = max(boundaryPad, 0.0);
  if (ijk.x < pad || ijk.y < pad || ijk.z < pad) return 1.0;
  if (ijk.x >= n - pad || ijk.y >= n - pad || ijk.z >= n - pad) return 1.0;
  return 0.0;
}

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
