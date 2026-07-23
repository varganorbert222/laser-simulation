precision highp float;

// Babylon mesh attribute is vec3; plane lies in XY with |xy| <= 1 for size=2.
attribute vec3 position;
uniform mat4 uInvViewProj;
varying vec3 vWorldDir;

void main() {
  // Fullscreen NDC; view ray = unproject(far) − unproject(near) (same as volumetric).
  vec2 ndc = position.xy;
  vec4 nearH = uInvViewProj * vec4(ndc, -1.0, 1.0);
  vec4 farH = uInvViewProj * vec4(ndc, 1.0, 1.0);
  vec3 nearW = nearH.xyz / max(nearH.w, 1e-8);
  vec3 farW = farH.xyz / max(farH.w, 1e-8);
  vWorldDir = normalize(farW - nearW);
  // Far-plane depth so LEQUAL only fills empty background.
  gl_Position = vec4(ndc, 0.9999, 1.0);
}
