/**
 * Observer + debug-view transforms on linear HDR (pre-tonemap).
 *
 * uObserverMode:
 *   0 identity / human-eye
 *   1 3×3 RGB matrix (colour-blind, dog, …)
 *   2 digital camera (contrast / saturation / knee)
 *   3 thermal false-colour from luminance
 *   4 infrared false-colour from luminance
 *
 * uDebugViewMode:
 *   0 final (observer → tonemap)
 *   1 radiance-rgb (no observer; debug path still tonemaps)
 *   2 radiance-luminance (log-Y false colour)
 *   3 radiance-split (left physical | right perceptual)
 *   4 observer-bypass (tonemap, no observer)
 */
uniform float uObserverMode;
uniform float uDebugViewMode;
/** Row-major RGB matrix when uObserverMode == 1. */
uniform vec3 uObserverMatR0;
uniform vec3 uObserverMatR1;
uniform vec3 uObserverMatR2;

vec3 observerApplyMatrix(vec3 c) {
  return vec3(
    dot(uObserverMatR0, c),
    dot(uObserverMatR1, c),
    dot(uObserverMatR2, c)
  );
}

vec3 observerDigitalCamera(vec3 c) {
  // Educational sensor: mild contrast, saturation, soft highlight knee.
  float y = dot(c, vec3(0.2126, 0.7152, 0.0722));
  vec3 chroma = c - vec3(y);
  vec3 punched = vec3(y) + chroma * 1.25;
  punched = (punched - 0.5) * 1.15 + 0.5;
  float soft = punched.r + punched.g + punched.b;
  float knee = soft / (1.0 + soft * 0.35);
  float scale = soft > 1e-5 ? knee / soft : 1.0;
  return max(punched * scale, vec3(0.0));
}

vec3 observerThermalFalseColour(vec3 c) {
  float y = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float t = clamp(log(1.0 + y * 4.0) / log(5.0), 0.0, 1.0);
  // Black → blue → cyan → yellow → white
  vec3 cold = vec3(0.02, 0.05, 0.35);
  vec3 mid = vec3(0.05, 0.55, 0.75);
  vec3 hot = vec3(1.0, 0.85, 0.15);
  vec3 white = vec3(1.0);
  if (t < 0.33) return mix(cold, mid, t / 0.33);
  if (t < 0.66) return mix(mid, hot, (t - 0.33) / 0.33);
  return mix(hot, white, (t - 0.66) / 0.34);
}

vec3 observerInfraredFalseColour(vec3 c) {
  float y = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float t = clamp(log(1.0 + y * 5.0) / log(6.0), 0.0, 1.0);
  // Green-phosphor / violet IR camera look
  return mix(vec3(0.02, 0.08, 0.02), vec3(0.55, 1.0, 0.35), t)
    + vec3(0.15, 0.0, 0.25) * t * t;
}

vec3 observerLuminanceFalseColour(vec3 c) {
  float y = max(dot(c, vec3(0.2126, 0.7152, 0.0722)), 0.0);
  float t = clamp(log(1.0 + y * 8.0) / log(9.0), 0.0, 1.0);
  return mix(vec3(0.05, 0.0, 0.2), vec3(1.0, 0.95, 0.2), t);
}

vec3 applyObserverPerception(vec3 hdr) {
  float mode = uObserverMode;
  if (mode < 0.5) return hdr;
  if (mode < 1.5) return max(observerApplyMatrix(hdr), vec3(0.0));
  if (mode < 2.5) return observerDigitalCamera(hdr);
  if (mode < 3.5) return observerThermalFalseColour(hdr);
  return observerInfraredFalseColour(hdr);
}

/**
 * Apply debug view + observer on exposed HDR composite.
 * Returns linear HDR ready for tonemap (except luminance debug which is already display-ish —
 * still tonemapped lightly for consistency).
 */
vec3 applyObserverAndDebugView(vec3 hdrPhysical, vec2 uv) {
  float dbg = uDebugViewMode;

  // radiance-luminance: false-colour physical buffer
  if (dbg > 1.5 && dbg < 2.5) {
    return observerLuminanceFalseColour(hdrPhysical);
  }

  // radiance-rgb / observer-bypass: no species/eye
  if ((dbg > 0.5 && dbg < 1.5) || dbg > 3.5) {
    return hdrPhysical;
  }

  // radiance-split: left physical | right perceptual
  if (dbg > 2.5 && dbg < 3.5) {
    if (uv.x < 0.5) return hdrPhysical;
    return applyObserverPerception(hdrPhysical);
  }

  // final
  return applyObserverPerception(hdrPhysical);
}
