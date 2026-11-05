// Tiny software raster: a Uint32Array of packed RGBA pixels (little-endian: 0xAABBGGRR, the layout of canvas ImageData)
// plus colour helpers. No DOM, no clock, no random. Pure.
// Two families of drawing calls, as in the approved mock-up:
//   px / rc    : colour goes through the preset "grade" (decor colours)
//   pxr / rcr  : raw colour (sky, lights)
// A colour is '#rrggbb' or [r, g, b] (0..255, fractions allowed, truncated like the mock-up did).

import { clamp, hx, pack, gradeColor } from './palette.js';
export { clamp, lerp, hx, hexs, mixc, pack, unpack, gradeColor, gradStops } from './palette.js';

const IDENTITY = { mul: [1, 1, 1], add: [0, 0, 0], sat: 1 };

/** @param {Uint32Array} [existing] draws into this buffer instead of a new one (the per-frame picture) */
export function createRaster(w, h, existing) {
  const buf = existing || new Uint32Array(w * h);
  let grade = IDENTITY;
  const cache = new Map();

  const rawPack = (c) => {
    if (typeof c === 'string') {
      const a = hx(c);
      return pack(a[0], a[1], a[2]);
    }
    return pack(c[0] | 0, c[1] | 0, c[2] | 0);
  };
  const gradedPack = (c) => {
    if (typeof c === 'string') {
      let r = cache.get(c);
      if (r === undefined) {
        r = rawPack(gradeColor(hx(c), grade));
        cache.set(c, r);
      }
      return r;
    }
    return rawPack(gradeColor(c, grade));
  };

  function put(x, y, p) {
    x |= 0;
    y |= 0;
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    buf[y * w + x] = p;
  }
  function fill(x, y, ww, hh, p) {
    x |= 0;
    y |= 0;
    ww |= 0;
    hh |= 0;
    const x0 = Math.max(0, x);
    const x1 = Math.min(w, x + ww);
    const y1 = Math.min(h, y + hh);
    for (let yy = Math.max(0, y); yy < y1; yy++) buf.fill(p, yy * w + x0, yy * w + Math.max(x0, x1));
  }
  /** Source-over blend of rgb (0..255) with opacity a (0..1) on one pixel; works on transparent and opaque destinations. */
  function blend(i, r, g, b, a) {
    const d = buf[i];
    if (d >>> 24 === 255) {
      // opaque destination (almost always): the same result as below without the alpha bookkeeping
      const k = 1 - a;
      buf[i] = (0xff000000 | (((b * a + ((d >>> 16) & 255) * k) | 0) << 16) | (((g * a + ((d >>> 8) & 255) * k) | 0) << 8) | ((r * a + (d & 255) * k) | 0)) >>> 0;
      return;
    }
    const da = (d >>> 24) / 255;
    if (da === 0) {
      buf[i] = pack(r | 0, g | 0, b | 0, Math.round(a * 255));
      return;
    }
    const k = da * (1 - a);
    const oa = a + k;
    const dr = d & 255;
    const dg = (d >>> 8) & 255;
    const db = (d >>> 16) & 255;
    buf[i] = pack(((r * a + dr * k) / oa) | 0, ((g * a + dg * k) / oa) | 0, ((b * a + db * k) / oa) | 0, Math.round(oa * 255));
  }
  function blendRect(x, y, ww, hh, rgb, a) {
    x |= 0;
    y |= 0;
    ww |= 0;
    hh |= 0;
    const x0 = Math.max(0, x);
    const x1 = Math.min(w, x + ww);
    const y1 = Math.min(h, y + hh);
    for (let yy = Math.max(0, y); yy < y1; yy++) for (let xx = x0; xx < x1; xx++) blend(yy * w + xx, rgb[0], rgb[1], rgb[2], a);
  }

  return {
    w,
    h,
    buf,
    setGrade(g) {
      grade = g || IDENTITY;
      cache.clear();
    },
    px: (x, y, c) => put(x, y, gradedPack(c)),
    rc: (x, y, ww, hh, c) => fill(x, y, ww, hh, gradedPack(c)),
    pxr: (x, y, c) => put(x, y, rawPack(c)),
    rcr: (x, y, ww, hh, c) => fill(x, y, ww, hh, rawPack(c)),
    /** Translucent raw colour over a rectangle / one pixel (rgb array, opacity 0..1). */
    rcA: (x, y, ww, hh, rgb, a) => blendRect(x, y, ww, hh, rgb, a),
    pxA(x, y, rgb, a) {
      x |= 0;
      y |= 0;
      if (x < 0 || y < 0 || x >= w || y >= h) return;
      blend(y * w + x, rgb[0], rgb[1], rgb[2], a);
    },
    blend,
    clear() {
      buf.fill(0);
    },
  };
}
