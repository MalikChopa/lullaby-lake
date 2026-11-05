// Colour maths shared by every painter: hex parsing, mixing, packing into 32-bit RGBA, the preset "grade", gradient stops. Pure.
// A colour is '#rrggbb' or [r, g, b] (0..255, fractions allowed).

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const hx = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
export const hexs = (list) => list.map(hx);
export const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
/** Packs 0..255 channels (already clamped) into one 32-bit pixel (little-endian RGBA = canvas ImageData layout). */
export const pack = (r, g, b, a = 255) => ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
export const unpack = (p) => [p & 255, (p >>> 8) & 255, (p >>> 16) & 255, p >>> 24];

/** Grade: saturation around the luminance, then channel multiply and add. Returns a new [r,g,b]. */
export function gradeColor(a, g) {
  const l = 0.3 * a[0] + 0.59 * a[1] + 0.11 * a[2];
  return [0, 1, 2].map((i) => clamp((l + (a[i] - l) * g.sat) * g.mul[i] + g.add[i], 0, 255));
}

/** Picks the two stops around f (0..1) in a list of stops: [stopA, stopB, local t]. */
export function gradStops(stops, f) {
  const n = stops.length - 1;
  const p = clamp(f, 0, 1) * n;
  const i = Math.min(n - 1, Math.floor(p));
  return [stops[i], stops[i + 1], p - i];
}
