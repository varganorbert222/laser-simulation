/**
 * Average log-luminance from a small metering RTT into a 1×1 result.
 * textureSampler.r = log(Y); output.r = exp(mean(logY)) = log-average luminance.
 */
precision highp float;

varying vec2 vUV;
uniform sampler2D textureSampler;
/** Texel size of the source metering texture (1/width, 1/height). */
uniform vec2 uTexel;
/** Source resolution (e.g. 32). */
uniform float uSize;

void main(void) {
  float sumLog = 0.0;
  float n = 0.0;
  float size = max(uSize, 1.0);
  for (float y = 0.0; y < 64.0; y++) {
    if (y >= size) break;
    for (float x = 0.0; x < 64.0; x++) {
      if (x >= size) break;
      vec2 uv = (vec2(x, y) + 0.5) * uTexel;
      sumLog += texture2D(textureSampler, uv).r;
      n += 1.0;
    }
  }
  float avgLog = sumLog / max(n, 1.0);
  float avgLum = exp(avgLog);
  gl_FragColor = vec4(avgLum, avgLog, 0.0, 1.0);
}
