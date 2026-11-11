// Art pass: the 3D models (Kenney CC0 packs, baked to lean GLBs by refonte/tools/art-bake.mjs and shipped in refonte/assets/models/).
//   - parseGlb(bytes): reads a lean GLB (one mesh: float32 positions, uint16 colours, uint16 indices) into plain typed arrays. Pure, no three.js.
//     It throws on a corrupt file (the loader then simply does without that model).
//   - preloadModels(ids, { fetchFn, base }): loads from the SAME ORIGIN only, in parallel, tolerant: a missing, blocked or corrupt file is
//     recorded as failed and the code-made prop is drawn instead (the game never breaks). Results live in a small store (getModel).
//   - harmonize(rgb): the palette grade that makes the flat Kenney colours sit with the pixel-art sprites (a little desaturated, a little
//     warm, quantised to a few levels like a pixel palette). Deterministic.
//   - stamp(builder, model, placement): pushes the triangles of a model, transformed, into a world builder (world/geo.js) so the models are
//     MERGED with the rest of the chunk (no extra draw call): flat shaded, vertex coloured, same occluder fade and wind as the code-made props.

import { MODEL_FILES, INTERIOR_MODEL_FILES, HARMONY } from '../data/models.js';

/** The folder of the shipped models (same origin as this file). */
export const MODEL_BASE = typeof import.meta !== 'undefined' && import.meta.url ? new URL('../../assets/models/', import.meta.url).href : './assets/models/';

const lin2s = (v) => (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055);
const s2lin = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const clamp01 = (v) => Math.min(1, Math.max(0, v));

/** sRGB [r, g, b] (0..1) -> [hue degrees 0..360, saturation, lightness] */
export function toHsl(r, g, b) {
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  const d = mx - mn;
  if (d < 1e-6) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  if (h < 0) h += 360;
  return [h, s, l];
}
/** [hue degrees, saturation, lightness] -> sRGB [r, g, b] (0..1) */
export function fromHsl(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const k = Math.floor((((h % 360) + 360) % 360) / 60);
  const [r, g, b] = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][k % 6];
  return [r + m, g + m, b + m];
}
/** The material class of a LINEAR colour from its hue: wood (salmon, tan, orange), leaf (teal and greens), water (cyan), stone (lavender grey and neutrals), red, purple. */
export function classOf(c) {
  const [h, s] = toHsl(lin2s(clamp01(c[0])), lin2s(clamp01(c[1])), lin2s(clamp01(c[2])));
  if (s < 0.1) return 'stone';
  if (h >= 205 && h < 300) return 'stone';
  if (h >= 170 && h < 205) return lin2s(clamp01(c[1])) > 0.8 && lin2s(clamp01(c[0])) > 0.6 ? 'stone' : 'water';
  if (h >= 60 && h < 170) return 'leaf';
  if (h >= 300 && h < 335) return 'purple';
  if (h >= 335 || h < 6) return 'red';
  return 'wood';
}
const hueAt = (anchors, h) => {
  // piecewise linear over the circular anchor list [srcHue, dstHue, satMul, lightMul] sorted by srcHue
  const n = anchors.length;
  let i = n - 1;
  for (let k = 0; k < n; k++) if (anchors[k][0] <= h) i = k;
  const a = anchors[i];
  const b = anchors[(i + 1) % n];
  let span = b[0] - a[0];
  if (span <= 0) span += 360;
  let off = h - a[0];
  if (off < 0) off += 360;
  const t = off / span;
  let dd = b[1] - a[1];
  if (dd > 180) dd -= 360;
  if (dd < -180) dd += 360;
  return [(a[1] + dd * t + 360) % 360, a[2] + (b[2] - a[2]) * t, a[3] + (b[3] - a[3]) * t];
};

/**
 * Palette grade of a LINEAR colour [r, g, b] (0..1) -> linear colour. The Kenney packs use stylised colours (salmon wood, teal leaves, lavender
 * stone): the hue anchors of HARMONY pull them to the game's palette (brown wood, green leaves, warm grey stone), then a light desaturation
 * (`sat`), a warm tint, a small lift and a quantisation to `steps` levels per channel (like a pixel palette). `h` overrides HARMONY.
 */
export function harmonize(c, h = HARMONY) {
  const sr = lin2s(clamp01(c[0]));
  const sg = lin2s(clamp01(c[1]));
  const sb = lin2s(clamp01(c[2]));
  let [hue, sat, light] = toHsl(sr, sg, sb);
  if (sat > 0.001 && hue >= 170 && hue < 205 && light > 0.62) {
    // the pale cyan of the packs' "stone" material: a warm-cool grey rock
    hue = 255;
    sat *= 0.1;
    light *= 0.82;
  } else if (sat > 0.001) {
    const [nh, sm, lm] = hueAt(h.anchors, hue);
    hue = nh;
    sat = clamp01(sat * sm);
    light = clamp01(light * lm);
  }
  let [r, g, b] = fromHsl(hue, sat, light);
  const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  r = l + (r - l) * h.sat;
  g = l + (g - l) * h.sat;
  b = l + (b - l) * h.sat;
  r = r * h.warm[0] + h.lift;
  g = g * h.warm[1] + h.lift;
  b = b * h.warm[2] + h.lift;
  const q = (v) => clamp01(Math.round(v * h.steps) / h.steps);
  return [s2lin(q(r)), s2lin(q(g)), s2lin(q(b))];
}

/** '#rrggbb' -> linear [r, g, b] */
export function hexLin(hex) {
  const v = parseInt(hex.slice(1), 16);
  return [s2lin(((v >> 16) & 255) / 255), s2lin(((v >> 8) & 255) / 255), s2lin((v & 255) / 255)];
}

const CT = { 5121: [Uint8Array, 1, 255], 5123: [Uint16Array, 2, 65535], 5125: [Uint32Array, 4, 1], 5126: [Float32Array, 4, 1] };
const NC = { SCALAR: 1, VEC3: 3 };

/**
 * Parses a lean GLB (ArrayBuffer or typed array).
 * @returns {{ pos: Float32Array, col: Float32Array, idx: Uint16Array, tris: number, min: number[], max: number[] }}
 */
export function parseGlb(bytes) {
  const u8 = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (u8.length < 28) throw new Error('GLB too short');
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  if (dv.getUint32(0, true) !== 0x46546c67 || dv.getUint32(4, true) !== 2) throw new Error('not a GLB 2');
  const jl = dv.getUint32(12, true);
  if (dv.getUint32(16, true) !== 0x4e4f534a || 20 + jl + 8 > u8.length) throw new Error('bad JSON chunk');
  const json = JSON.parse(new TextDecoder().decode(u8.subarray(20, 20 + jl)));
  const bo = 20 + jl;
  const bl = dv.getUint32(bo, true);
  if (dv.getUint32(bo + 4, true) !== 0x004e4942 || bo + 8 + bl > u8.length) throw new Error('bad BIN chunk');
  const binStart = u8.byteOffset + bo + 8;
  const prim = json.meshes?.[0]?.primitives?.[0];
  if (!prim || prim.mode !== 4 || prim.attributes?.POSITION === undefined || prim.indices === undefined) throw new Error('unsupported GLB');
  const read = (ai, want) => {
    const a = json.accessors[ai];
    const bv = json.bufferViews[a.bufferView];
    const [Ctor, size, norm] = CT[a.componentType];
    const n = NC[a.type];
    const off = (bv.byteOffset || 0) + (a.byteOffset || 0);
    if (off + a.count * n * size > bl || bv.byteStride) throw new Error('bad accessor');
    if (want && n !== want) throw new Error('bad accessor type');
    const raw = new Ctor(u8.buffer.slice(binStart + off, binStart + off + a.count * n * size));
    if (a.normalized) {
      const f = new Float32Array(raw.length);
      for (let i = 0; i < raw.length; i++) f[i] = raw[i] / norm;
      return { a, data: f };
    }
    return { a, data: raw };
  };
  const P = read(prim.attributes.POSITION, 3);
  const C = prim.attributes.COLOR_0 !== undefined ? read(prim.attributes.COLOR_0, 3) : null;
  const I = read(prim.indices, 1);
  const nv = P.a.count;
  const idx = I.data instanceof Uint16Array ? I.data : Uint16Array.from(I.data);
  if (idx.length % 3 || !idx.length) throw new Error('bad indices');
  for (let i = 0; i < idx.length; i++) if (idx[i] >= nv) throw new Error('index out of range');
  const pos = P.data instanceof Float32Array ? P.data : Float32Array.from(P.data);
  for (let i = 0; i < pos.length; i++) if (!Number.isFinite(pos[i])) throw new Error('bad position');
  const col = C ? Float32Array.from(C.data) : new Float32Array(nv * 3).fill(1);
  const min = P.a.min || [0, 0, 0];
  const max = P.a.max || [0, 0, 0];
  return { pos, col, idx, tris: idx.length / 3, min, max };
}

// ------------------------------------------------------------------ store
const store = new Map(); // id -> prepared model
const failed = new Set();
let inflight = null;

/** Prepared model: parsed arrays + the harmonised colours + the bounding data used to place it (base centre, height, width). */
function prepare(id, raw) {
  const spec = MODEL_FILES[id] || INTERIOR_MODEL_FILES[id] || {};
  const nv = raw.col.length / 3;
  const col = new Float32Array(raw.col.length);
  const cls = new Array(nv);
  const lum = new Float32Array(nv);
  for (let i = 0; i < nv; i++) {
    const c = [raw.col[i * 3], raw.col[i * 3 + 1], raw.col[i * 3 + 2]];
    const h = harmonize(c, spec.harmony || HARMONY);
    col[i * 3] = h[0];
    col[i * 3 + 1] = h[1];
    col[i * 3 + 2] = h[2];
    cls[i] = classOf(c);
    lum[i] = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  const [x0, y0, z0] = raw.min;
  const [x1, y1, z1] = raw.max;
  return { id, pos: raw.pos, col, cls, lum, idx: raw.idx, tris: raw.tris, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, minY: y0, w: x1 - x0, h: y1 - y0, d: z1 - z0, min: raw.min, max: raw.max };
}

/** Registers a model without loading it (tests, the contact sheet). */
export function setModel(id, raw) {
  store.set(id, prepare(id, raw));
  failed.delete(id);
}
export const getModel = (id) => store.get(id) || null;
export const hasModel = (id) => store.has(id);
export const failedModels = () => [...failed];
export function resetModels() {
  store.clear();
  failed.clear();
  inflight = null;
}
export function modelStats() {
  let tris = 0;
  for (const m of store.values()) tris += m.tris;
  return { loaded: store.size, failed: failed.size, tris };
}

/**
 * Loads the models (default: all of MODEL_FILES) from the same origin, `limit` requests at a time. Never throws: failures are recorded.
 * @param {string[]} [ids]
 * @param {{ fetchFn?: Function, base?: string, limit?: number, signal?: AbortSignal }} [o]
 * @returns {Promise<{ loaded: string[], failed: string[] }>}
 */
export function preloadModels(ids = Object.keys(MODEL_FILES), o = {}) {
  const fetchFn = o.fetchFn || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
  const base = o.base || MODEL_BASE;
  // debug: ?nomodel=pine_a,bush_a (prefix match with a trailing *: ?nomodel=pine_*) leaves some models out, to see what the code-made prop looked like
  const off = (typeof location !== 'undefined' && location.search ? new URLSearchParams(location.search).get('nomodel') || '' : '').split(',').filter(Boolean);
  const skipped = (id) => off.some((k) => (k.endsWith('*') ? id.startsWith(k.slice(0, -1)) : k === id));
  const todo = ids.filter((id) => (MODEL_FILES[id] || INTERIOR_MODEL_FILES[id]) && !store.has(id) && !skipped(id));
  const out = { loaded: [], failed: [] };
  if (!fetchFn) {
    for (const id of todo) failed.add(id);
    out.failed.push(...todo);
    return Promise.resolve(out);
  }
  let next = 0;
  const worker = async () => {
    while (next < todo.length) {
      const id = todo[next++];
      try {
        if (o.signal && o.signal.aborted) throw new Error('aborted');
        const res = await fetchFn(base + (INTERIOR_MODEL_FILES[id] ? 'interior/' : '') + id + '.glb', { signal: o.signal });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        store.set(id, prepare(id, parseGlb(await res.arrayBuffer())));
        failed.delete(id);
        out.loaded.push(id);
      } catch {
        failed.add(id);
        out.failed.push(id);
      }
    }
  };
  const p = Promise.all(Array.from({ length: Math.min(o.limit || 8, todo.length) }, worker)).then(() => out);
  inflight = p;
  return p;
}
/** The promise of the last preload (the build waits for it). */
export const modelsReady = () => inflight || Promise.resolve({ loaded: [], failed: [] });

/** Per-vertex flag (1) of the biggest connected piece of a model (the hull of a boat, without its loose oars). */
export function largestPiece(model) {
  const n = model.pos.length / 3;
  const parent = Int32Array.from({ length: n }, (_, i) => i);
  const find = (i) => {
    while (parent[i] !== i) i = parent[i] = parent[parent[i]];
    return i;
  };
  const { idx } = model;
  for (let t = 0; t < idx.length; t += 3) {
    parent[find(idx[t + 1])] = find(idx[t]);
    parent[find(idx[t + 2])] = find(idx[t]);
  }
  // vertices at the same place belong to the same piece (the baked meshes may duplicate vertices along the seams)
  const at = new Map();
  for (let i = 0; i < n; i++) {
    const k = model.pos[i * 3].toFixed(3) + ',' + model.pos[i * 3 + 1].toFixed(3) + ',' + model.pos[i * 3 + 2].toFixed(3);
    if (at.has(k)) parent[find(i)] = find(at.get(k));
    else at.set(k, i);
  }
  const size = new Map();
  for (let t = 0; t < idx.length; t += 3) size.set(find(idx[t]), (size.get(find(idx[t])) || 0) + 1);
  let best = -1;
  let bestN = -1;
  for (const [r, c] of size) if (c > bestN) [best, bestN] = [r, c];
  const flag = new Uint8Array(n);
  for (let i = 0; i < n; i++) flag[i] = find(i) === best ? 1 : 0;
  return flag;
}

// ------------------------------------------------------------------ placement
/**
 * Pushes a model into a builder (world/geo.js createBuilder). Placement:
 *   x, y, z      world position of the BASE CENTRE of the model (y = the ground under it)
 *   rot          turn about y (radians, same convention as builder.box: local +x goes to (cos rot, -sin rot))
 *   s            uniform scale, or h = target height in metres, or w = target width in metres (the longer horizontal side); sx / sy / sz multiply on top
 *   tint         [r, g, b] linear multiplier of the harmonised colours
 *   vary         0..1 amount of a deterministic brightness variation per model instance (from its position)
 *   sway         [y0, h]: wind weight 0 at y0 rising to 1 at y0 + h (foliage), else rigid
 *   lift         raises the base (m) after scaling
 *   swap         { stone|wood|leaf|water|red|purple: '#rrggbb' } replaces every triangle of that material class by that colour (keeping the model's own light/dark variation): house walls, roofs, doors...
 *   only         (pos, i0, i1, i2) => boolean: keep only some triangles (the hull of a boat without its oars)
 *   lean         tilt (radians) about the model's local x axis through its base (an oar leaning on a wall); applied before the turn about y
 *   anchor       'base' (default: bottom centre at the position) | 'origin' (the model's own origin at the position) | 'center' (the middle of the box at the position: hanging things)
 *   roll         turn (radians) about the model's local z axis through its anchor, applied first (a fish lying along x hung head-down: roll = +-pi/2)
 * @returns {{ minX, maxX, minZ, maxZ, minY, topY }} the world bounds of the placed model
 */
export function stamp(b, model, o = {}) {
  if (!model) return null;
  let s = o.s ?? 1;
  if (o.h) s = o.h / model.h;
  else if (o.w) s = o.w / Math.max(model.w, model.d);
  const sx = s * (o.sx ?? 1);
  const sy = s * (o.sy ?? 1);
  const sz = s * (o.sz ?? 1);
  const rot = o.rot || 0;
  const c = Math.cos(rot);
  const sn = Math.sin(rot);
  const ox = o.anchor === 'origin' ? 0 : model.cx;
  const oz = o.anchor === 'origin' ? 0 : model.cz;
  const oy = o.anchor === 'origin' ? 0 : o.anchor === 'center' ? model.minY + model.h / 2 : model.minY;
  const rc = Math.cos(o.roll || 0);
  const rs = Math.sin(o.roll || 0);
  const X = o.x || 0;
  const Y = (o.y || 0) + (o.lift || 0);
  const Z = o.z || 0;
  const tint = o.tint || null;
  const vk = o.vary ? 1 + (Math.sin(X * 12.9898 + Z * 78.233) * 43758.5453 % 1) * o.vary * 0.5 - o.vary * 0.25 : 1;
  const { pos, col, idx } = model;
  const sway = o.sway || null;
  const swap = o.swap || null;
  const swapCol = {};
  const clsLum = {};
  if (swap) {
    for (const k of Object.keys(swap)) swapCol[k] = hexLin(swap[k]); // already in the game palette: no hue grade
    for (let t = 0; t < idx.length; t += 3) {
      const k = model.cls[idx[t]];
      if (swap[k]) (clsLum[k] ||= []).push(model.lum[idx[t]]);
    }
    for (const k of Object.keys(clsLum)) clsLum[k] = clsLum[k].reduce((a, v) => a + v, 0) / clsLum[k].length || 1;
  }
  const prevSway = b.swayOf;
  const lc = Math.cos(o.lean || 0);
  const ls = Math.sin(o.lean || 0);
  const world = (i) => {
    const px = (pos[i * 3] - ox) * sx;
    const py = (pos[i * 3 + 1] - oy) * sy;
    const lx = px * rc - py * rs;
    const ly0 = px * rs + py * rc;
    const lz0 = (pos[i * 3 + 2] - oz) * sz;
    const ly = ly0 * lc - lz0 * ls;
    const lz = ly0 * ls + lz0 * lc;
    return [X + lx * c + lz * sn, Y + ly, Z - lx * sn + lz * c];
  };
  if (sway) b.swayOf = (p) => Math.max(0, Math.min(1, (p[1] - sway[0]) / sway[1]));
  const bounds = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity, minY: Infinity, topY: -Infinity };
  const W = new Array(model.pos.length / 3);
  const used = new Uint8Array(W.length);
  for (let t = 0; t < idx.length; t += 3) {
    if (o.only && !o.only(pos, idx[t], idx[t + 1], idx[t + 2])) continue;
    const i0 = idx[t];
    const i1 = idx[t + 1];
    const i2 = idx[t + 2];
    for (const i of [i0, i1, i2]) {
      if (!used[i]) {
        used[i] = 1;
        W[i] = world(i);
        const w = W[i];
        if (w[0] < bounds.minX) bounds.minX = w[0];
        if (w[0] > bounds.maxX) bounds.maxX = w[0];
        if (w[2] < bounds.minZ) bounds.minZ = w[2];
        if (w[2] > bounds.maxZ) bounds.maxZ = w[2];
        if (w[1] > bounds.topY) bounds.topY = w[1];
        if (w[1] < bounds.minY) bounds.minY = w[1];
      }
    }
    // the colour of a triangle = the mean of its three vertex colours (flat shading, like the code-made props)
    let r = (col[i0 * 3] + col[i1 * 3] + col[i2 * 3]) / 3;
    let g = (col[i0 * 3 + 1] + col[i1 * 3 + 1] + col[i2 * 3 + 1]) / 3;
    let bl = (col[i0 * 3 + 2] + col[i1 * 3 + 2] + col[i2 * 3 + 2]) / 3;
    const sk = swap ? model.cls[i0] : null;
    if (sk && swap[sk]) {
      const k = Math.max(0.55, Math.min(1.5, ((model.lum[i0] + model.lum[i1] + model.lum[i2]) / 3 || 1e-3) / (clsLum[sk] || 1)));
      r = swapCol[sk][0] * k;
      g = swapCol[sk][1] * k;
      bl = swapCol[sk][2] * k;
    }
    if (tint) {
      r *= tint[0];
      g *= tint[1];
      bl *= tint[2];
    }
    // a collapsed (zero-area) triangle has no normal: the shader would divide by zero (NaN pixels that the bloom smears over the screen)
    const [a, bb, c2] = [W[i0], W[i1], W[i2]];
    const cx = (bb[1] - a[1]) * (c2[2] - a[2]) - (bb[2] - a[2]) * (c2[1] - a[1]);
    const cy = (bb[2] - a[2]) * (c2[0] - a[0]) - (bb[0] - a[0]) * (c2[2] - a[2]);
    const cz = (bb[0] - a[0]) * (c2[1] - a[1]) - (bb[1] - a[1]) * (c2[0] - a[0]);
    if (cx * cx + cy * cy + cz * cz < 1e-12) continue;
    b.tri(a, bb, c2, [r * vk, g * vk, bl * vk]);
  }
  b.swayOf = prevSway;
  if (stampTap) stampTap(model.id, o, bounds);
  return bounds;
}

let stampTap = null;
/** Audit hook (tests/tools): fn(modelId, options, worldBounds) is called after every stamp; null removes it. */
export function setStampTap(fn) {
  stampTap = fn;
}
