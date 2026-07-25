/**
 * Log-luminance of scene + volumetrics for HDR auto-exposure metering.
 * R channel = log(luminance + eps); reduce / read back to drive compose uAutoExposure.
 */
precision highp float;

varying vec2 vUV;
uniform sampler2D textureSampler;
uniform sampler2D volumetricTexture;

void main(void) {
  vec3 scene = texture2D(textureSampler, vUV).rgb;
  vec3 vol = texture2D(volumetricTexture, vUV).rgb;
  vec3 combined = scene + vol;
  float y = dot(combined, vec3(0.2126, 0.7152, 0.0722));
  float logY = log(max(y, 1e-6));
  gl_FragColor = vec4(logY, y, 0.0, 1.0);
}
