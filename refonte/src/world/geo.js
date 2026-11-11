// Merged low-poly geometry made by code: a builder collects flat-shaded triangles (position, face normal, vertex colour, uv in metres)
// in WORLD space, so a whole family of props becomes ONE mesh = one draw call. uv = metres / tile size, so the code-made textures keep
// the same pixel density everywhere (16 px per metre).

import * as THREE from 'three';

const srgb = new THREE.Color();
/** '#rrggbb' -> linear [r, g, b] (vertex colours are linear in three.js). */
export function lin(hex, mul = 1) {
  srgb.set(hex);
  return [srgb.r * mul, srgb.g * mul, srgb.b * mul];
}

export function createBuilder(tile = 2) {
  const P = [];
  const N = [];
  const Col = [];
  const U = [];
  const O = []; // occluder id per vertex (0 = none): the renderer dithers that occluder when it hides the angler
  const Sw = []; // sway weight per vertex (0 = rigid, 1 = moves most in the wind)
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = (v) => {
    const l = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / l, v[1] / l, v[2] / l];
  };
  /** uv of a point projected on the face's dominant plane, in tiles */
  const uvOf = (p, n) => {
    const ax = Math.abs(n[0]);
    const ay = Math.abs(n[1]);
    const az = Math.abs(n[2]);
    if (ay >= ax && ay >= az) return [p[0] / tile, p[2] / tile];
    if (ax >= az) return [p[2] / tile, p[1] / tile];
    return [p[0] / tile, p[1] / tile];
  };
  const api = {
    occ: 0,
    swayOf: null,
    tri(a, b, c, col, n0, uvs = null) {
      const n = n0 || norm(cross(sub(b, a), sub(c, a)));
      const pts = [a, b, c];
      for (let k = 0; k < 3; k++) {
        const p = pts[k];
        P.push(p[0], p[1], p[2]);
        N.push(n[0], n[1], n[2]);
        Col.push(col[0], col[1], col[2]);
        const uv = uvs ? uvs[k] : uvOf(p, n);
        U.push(uv[0], uv[1]);
        O.push(api.occ);
        Sw.push(api.swayOf ? api.swayOf(p) : 0);
      }
    },
    quad(a, b, c, d, col) {
      api.tri(a, b, c, col);
      api.tri(a, c, d, col);
    },
    /** Quad with explicit uv per corner (a picture: signs). a b c d counter-clockwise seen from the front. */
    quadUV(a, b, c, d, col, ua, ub, uc, ud) {
      api.tri(a, b, c, col, null, [ua, ub, uc]);
      api.tri(a, c, d, col, null, [ua, uc, ud]);
    },
    /** Box centred at (x, z), bottom at y, rotated by ry around y. `top` = optional colour of the top face. */
    box(x, y, z, w, h, d, col, ry = 0, top = null, bottomFace = false) {
      const c = Math.cos(ry);
      const s = Math.sin(ry);
      const v = (dx, dy, dz) => [x + dx * c + dz * s, y + dy, z - dx * s + dz * c];
      const hw = w / 2;
      const hd = d / 2;
      const p = [v(-hw, 0, -hd), v(hw, 0, -hd), v(hw, 0, hd), v(-hw, 0, hd), v(-hw, h, -hd), v(hw, h, -hd), v(hw, h, hd), v(-hw, h, hd)];
      api.quad(p[4], p[7], p[6], p[5], top || col); // top
      api.quad(p[3], p[2], p[6], p[7], col); // +z (front)
      api.quad(p[1], p[0], p[4], p[5], col); // -z
      api.quad(p[2], p[1], p[5], p[6], col); // +x
      api.quad(p[0], p[3], p[7], p[4], col); // -x
      if (bottomFace) api.quad(p[0], p[1], p[2], p[3], col);
    },
    /** Cone / pyramid with n sides (radius r at y0, apex at y1), optional rotation, colours side and slightly darker. */
    cone(x, y0, z, r, h, n, col, rot = 0, colB = null) {
      const apex = [x, y0 + h, z];
      for (let i = 0; i < n; i++) {
        const a0 = rot + (i / n) * Math.PI * 2;
        const a1 = rot + ((i + 1) / n) * Math.PI * 2;
        const p0 = [x + Math.cos(a0) * r, y0, z + Math.sin(a0) * r];
        const p1 = [x + Math.cos(a1) * r, y0, z + Math.sin(a1) * r];
        api.tri(p1, p0, apex, i % 2 && colB ? colB : col);
        api.tri(p0, p1, [x, y0, z], col);
      }
    },
    /** Cylinder with n sides (no caps when open). */
    cyl(x, y0, z, r, h, n, col, open = false) {
      for (let i = 0; i < n; i++) {
        const a0 = (i / n) * Math.PI * 2;
        const a1 = ((i + 1) / n) * Math.PI * 2;
        const b0 = [x + Math.cos(a0) * r, y0, z + Math.sin(a0) * r];
        const b1 = [x + Math.cos(a1) * r, y0, z + Math.sin(a1) * r];
        const t0 = [b0[0], y0 + h, b0[2]];
        const t1 = [b1[0], y0 + h, b1[2]];
        api.quad(b1, b0, t0, t1, col);
        if (!open) api.tri(t1, t0, [x, y0 + h, z], col);
      }
    },
    /** Lumpy low-poly rock: an octahedron-ish shell with jittered points (deterministic from the given rng). */
    rock(x, y, z, s, col, rng) {
      const n = 7;
      const ring = [];
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const rr = s * (0.8 + rng() * 0.4);
        ring.push([x + Math.cos(a) * rr, y + s * (0.25 + rng() * 0.15), z + Math.sin(a) * rr * 0.85]);
      }
      const top = [x + (rng() - 0.5) * s * 0.3, y + s * (0.7 + rng() * 0.2), z];
      const base = ring.map((p) => [x + (p[0] - x) * 0.85, y - 0.15, z + (p[2] - z) * 0.85]);
      const colTop = col.map((v) => v * 1.12);
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        api.tri(ring[j], ring[i], top, colTop);
        api.quad(base[j], base[i], ring[i], ring[j], col);
      }
    },
    count: () => P.length / 3,
    geometry() {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(Col, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
      g.setAttribute('aOcc', new THREE.Float32BufferAttribute(O, 1));
      g.setAttribute('aSway', new THREE.Float32BufferAttribute(Sw, 1));
      g.computeBoundingSphere();
      g.computeBoundingBox();
      return g;
    },
  };
  return api;
}

/** RGBA bytes -> a nearest-filtered, repeating sRGB DataTexture. */
export function pixelTexture(img, repeat = true) {
  const t = new THREE.DataTexture(img.data, img.w, img.h, THREE.RGBAFormat);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) {
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
  }
  t.flipY = false;
  t.needsUpdate = true;
  return t;
}
