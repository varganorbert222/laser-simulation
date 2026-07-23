import { clamp01, clampRgb, type Rgb01 } from '@engine';

/** Parse a channel string and patch RGB at `index` (0–1). */
export function patchRgbChannel(
  rgb: Rgb01,
  index: 0 | 1 | 2,
  raw: string,
): [number, number, number] | null {
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  const next = clampRgb(rgb);
  next[index] = clamp01(n);
  return next;
}
