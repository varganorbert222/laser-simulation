/** Inject density + temperature near emitter (cone + maxDensity clamp). */
precision highp float;

varying vec2 vUV;
uniform sampler2D textureSampler; // density or temperature (scalar in .r)
uniform float uDt;
uniform float uEmissionRate;
uniform float uInjectTemp;
uniform float uMode; // 0 density, 1 temperature
uniform vec3 uEmitterOrigin; // voxel coords
uniform vec3 uEmitterDir; // unit, grid space
uniform float uEmitterRadius;
uniform float uConeCos;
uniform float uPlumeLength;
uniform float uMaxDensity;

// @include ./atlas.glsl

void main(void) {
  vec3 ijk = atlasUvToVoxel(vUV);
  if (!voxelInBounds(ijk)) {
    gl_FragColor = vec4(0.0);
    return;
  }
  float field = texture2D(textureSampler, vUV).r;
  vec3 d = ijk - uEmitterOrigin;
  float along = dot(d, uEmitterDir);
  float radial = length(d - uEmitterDir * along);
  float mask = 0.0;
  float plumeLen = max(uPlumeLength, 1.0);
  if (along > -0.5 && along < plumeLen) {
    vec3 dir = length(d) > 1e-4 ? normalize(d) : uEmitterDir;
    float cosA = dot(dir, uEmitterDir);
    float cone = smoothstep(uConeCos - 0.05, uConeCos + 0.05, cosA);
    mask = exp(-radial * radial / max(uEmitterRadius * uEmitterRadius, 0.25)) * cone;
  }
  float add = uEmissionRate * mask * uDt * 8.0;
  if (uMode > 0.5) {
    field = max(field, mix(field, uInjectTemp, mask * clamp(uEmissionRate, 0.0, 1.0)));
    field += add * 0.5;
  } else {
    field += add;
    field = min(field, max(uMaxDensity, 0.05));
  }
  gl_FragColor = vec4(field, 0.0, 0.0, 1.0);
}
