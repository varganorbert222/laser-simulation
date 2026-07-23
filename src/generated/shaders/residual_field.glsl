float rfResidualDensity(float x, float y, float brCore, float axialT) {
  float w = max(brCore, 1e-5);
  float r = length(vec2(x, y));
  float g1 = (2.0 / 3.14159265) / max((w * 1.55) * (w * 1.55), 1e-10)
    * exp(-2.0 * (r * r) / max((w * 1.55) * (w * 1.55), 1e-10));
  float g2 = (2.0 / 3.14159265) / max((w * 2.55) * (w * 2.55), 1e-10)
    * exp(-2.0 * (r * r) / max((w * 2.55) * (w * 2.55), 1e-10));
  float g3 = (2.0 / 3.14159265) / max((w * 4.2) * (w * 4.2), 1e-10)
    * exp(-2.0 * (r * r) / max((w * 4.2) * (w * 4.2), 1e-10));
  float ghosts = g1 * 0.55 + g2 * 0.30 + g3 * 0.15;
  float halo = (2.0 / 3.14159265) / max((w * 8.0) * (w * 8.0), 1e-10)
    * exp(-2.0 * (r * r) / max((w * 8.0) * (w * 8.0), 1e-10));
  float ring = smoothstep(0.55 * w, 0.95 * w, r) * (1.0 - smoothstep(1.05 * w, 1.85 * w, r));
  float edge = ring * (0.45 / max(w * w, 1e-8));
  float streak = exp(-abs(y) / max(0.28 * w, 1e-5))
    * exp(-(x * x) / max((4.0 * w) * (4.0 * w), 1e-6))
    * (0.18 / max(w * w, 1e-8));
  float dens = 0.50 * ghosts + 0.22 * halo + 0.16 * edge + 0.12 * streak;
  return dens * exp(-0.025 * max(axialT, 0.0));
}
