// Pixel-art billboards: upright planes facing the fixed camera yaw, leaned back a little (SPRITE_LEAN), nearest filtering, alpha-tested so
// they write depth like solid objects and cast a REAL shadow (three.js shadow pass reuses the map + alphaTest). One sprite pixel = TEXEL.
// A soft blob shadow is used instead on the low tier. J8: they also receive the shadows (sampled at the feet) and turn with the camera.

import * as THREE from 'three';
import { TEXEL, SPRITE_LEAN } from '../data/params.js';
import { patchMaterial } from './shading.js';

/** RGBA sheet with row 0 at the top -> texture with row 0 at the bottom (uv v = 0 at the bottom of the plane). */
export function sheetTexture(sheet) {
  const { w, h, data } = sheet;
  const flipped = new Uint8ClampedArray(data.length);
  for (let y = 0; y < h; y++) flipped.set(data.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
  const t = new THREE.DataTexture(flipped, w, h, THREE.RGBAFormat);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

let blobTex = null;
function blobTexture() {
  if (blobTex) return blobTex;
  const n = 16;
  const d = new Uint8ClampedArray(n * n * 4);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const r = Math.hypot((x + 0.5 - n / 2) / (n / 2), (y + 0.5 - n / 2) / (n / 2));
      const a = r < 0.55 ? 1 : r < 0.8 ? 0.6 : r < 1 ? 0.25 : 0; // stepped, pixel-like
      d.set([20, 14, 40, Math.round(a * 255)], (y * n + x) * 4);
    }
  blobTex = new THREE.DataTexture(d, n, n, THREE.RGBAFormat);
  blobTex.magFilter = THREE.NearestFilter;
  blobTex.minFilter = THREE.NearestFilter;
  blobTex.needsUpdate = true;
  return blobTex;
}

/**
 * @param {THREE.Texture} base shared sheet texture     @param {{ sheetW, sheetH, cellW, cellH }} grid in pixels
 * @param {{ lean?: number, blob?: number }} [o] blob = radius of the blob shadow in metres
 */
export function createBillboard(base, grid, o = {}) {
  const tex = base.clone(); // own offset / repeat, shared image
  tex.needsUpdate = true;
  tex.repeat.set(grid.cellW / grid.sheetW, grid.cellH / grid.sheetH);
  const w = grid.cellW * TEXEL;
  const h = grid.cellH * TEXEL;
  const geo = new THREE.PlaneGeometry(w, h);
  geo.translate(0, h / 2, 0);
  // normals tilted up: the sprite is lit like the ground it stands on (sun from any side, lamps from above)
  const nrm = geo.attributes.normal;
  for (let i = 0; i < nrm.count; i++) nrm.setXYZ(i, 0, 0.8, 0.6);
  const mat = new THREE.MeshLambertMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide });
  // J8: sprites RECEIVE the shadow sampled at their feet (world/shading.js), lit by the cloud shadows too
  if (o.receive !== false) patchMaterial(mat, { fade: false, wet: 0, sprite: true, key: 'sprite' });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -(o.lean ?? SPRITE_LEAN);
  mesh.castShadow = true;
  mesh.receiveShadow = o.receive !== false;
  const root = new THREE.Group();
  root.add(mesh);
  let blob = null;
  if (o.blob) {
    blob = new THREE.Mesh(new THREE.PlaneGeometry(o.blob * 2, o.blob * 1.3), new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, opacity: 0.45, depthWrite: false }));
    blob.rotation.x = -Math.PI / 2;
    blob.position.y = 0.02;
    blob.renderOrder = 1;
    blob.visible = false;
    root.add(blob);
  }
  return {
    root,
    mesh,
    blob,
    /** Shows cell (col, row) of the sheet; row 0 = top row of the sheet. */
    frame(col, row) {
      tex.offset.set((col * grid.cellW) / grid.sheetW, 1 - ((row + 1) * grid.cellH) / grid.sheetH);
    },
    /** Shows a sub-rectangle of the sheet given in pixels from the top-left (props sheet). */
    rect(x, y) {
      tex.offset.set(x / grid.sheetW, 1 - (y + grid.cellH) / grid.sheetH);
    },
    /** Turns the sprite to face a camera at heading `yaw` (radians); `flip` mirrors it (cat walking right). */
    face(yaw, flip = false) {
      root.rotation.y = yaw;
      mesh.scale.x = flip ? -1 : 1;
    },
    setShadowMode(real) {
      mesh.castShadow = real;
      if (blob) blob.visible = !real;
    },
    dispose() {
      geo.dispose();
      mat.dispose();
      tex.dispose();
      if (blob) {
        blob.geometry.dispose();
        blob.material.dispose();
      }
    },
  };
}
