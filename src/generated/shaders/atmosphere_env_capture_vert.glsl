precision highp float;

// Capture sky into ReflectionProbe cube faces (camera inside inverted box at origin).
attribute vec3 position;
uniform mat4 world;
uniform mat4 worldViewProjection;
varying vec3 vWorldDir;

void main() {
  vec4 worldPos = world * vec4(position, 1.0);
  // Probe is centered at the origin — direction = world position.
  vWorldDir = normalize(worldPos.xyz);
  gl_Position = worldViewProjection * vec4(position, 1.0);
}
