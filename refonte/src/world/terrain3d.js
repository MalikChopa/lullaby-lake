// Ground mesh of the world, from the ground field (logic/field.js), in square chunks (frustum culled, hidden beyond the view distance).
// Vertex colours: bright meadow greens with a slow patchwork, darker forest floor, dirt paths, sand at the water, lake bed, rock on the
// cliffs. Cobbles (plaza, street) are drawn in the shader from a per-vertex share and a code-made stone pattern.

import * as THREE from 'three';
import { lin, pixelTexture } from './geo.js';
import { groundDetail, cobbles } from '../art/textures.js';
import { patchMaterial } from './shading.js';

const GRASS = [lin('#6fb04f'), lin('#5fa24a'), lin('#82bc58'), lin('#79ad46')];
const FOREST = lin('#3f6a3a');
const DIRT = lin('#a27a52');
const DIRT_D = lin('#82603f');
const SAND = lin('#d4bc90');
const WET_SAND = lin('#9c8a66'); // J9-B: the wet band at the water's edge
const BED = lin('#5a6a58');
const DEEP = lin('#2a3848');
const ROCK = lin('#8a8290');
const ROCK_D = lin('#6a6070');
const COBBLE = lin('#b8aa9a');

const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const hash = (x, z) => {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

function colourAt(F, k, x, z, slope) {
  const y = F.h[k];
  const d = F.land[k];
  const n = 0.5 + 0.5 * Math.sin(x * 0.45 + Math.sin(z * 0.3) * 2) * Math.cos(z * 0.38 - x * 0.12);
  const q = Math.floor(n * 3.99);
  let c = mix(GRASS[q], GRASS[(q + 1) % 4], 0.35 + 0.3 * hash(Math.floor(x * 2), Math.floor(z * 2)));
  c = mix(c, FOREST, F.shade[k] * 0.55);
  if (F.dirt[k] > 0) c = mix(c, hash(Math.floor(x * 4), Math.floor(z * 4)) > 0.8 ? DIRT_D : DIRT, F.dirt[k]);
  if (F.cobble[k] > 0) c = mix(c, COBBLE, F.cobble[k]);
  if (d < 0.9) c = mix(c, SAND, Math.min(1, (0.9 - d) / 0.6));
  if (d < 0.38 && y >= -0.02) c = mix(c, WET_SAND, Math.min(1, (0.38 - d) / 0.22) * (0.75 + 0.25 * hash(Math.floor(x * 3), Math.floor(z * 3))));
  if (y < 0) c = mix(SAND, BED, Math.min(1, -y / 0.4));
  if (y < -0.4) c = mix(BED, DEEP, Math.min(1, (-y - 0.4) / 0.6));
  const rock = Math.max(F.edge[k] * Math.min(1, slope * 1.6), Math.min(1, Math.max(0, slope - 0.9) * 2));
  if (rock > 0) c = mix(c, hash(Math.floor(x * 1.5), Math.floor(y * 2)) > 0.5 ? ROCK : ROCK_D, Math.min(1, rock));
  return c;
}

/**
 * @param {object} F the ground field
 * @param {number} chunk vertices per chunk side
 * @returns {{ group: THREE.Group, chunks: THREE.Mesh[], material, dispose() }}
 */
/** The terrain in steps (one per chunk of the ground): a generator, so a loading screen can yield to the browser between chunks. */
function* terrainSteps(F, chunk = 48) {
  const mat = patchMaterial(new THREE.MeshLambertMaterial({ vertexColors: true, map: pixelTexture(groundDetail()) }), { fade: false, wet: 0.3, key: 'ground' });
  const cobTex = pixelTexture(cobbles());
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader) => {
    prev(shader);
    shader.uniforms.uCobTex = { value: cobTex };
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nattribute float aCob; varying float vCob; varying vec2 vCobUv;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvCob = aCob; vCobUv = position.xz / 2.0;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uCobTex; varying float vCob; varying vec2 vCobUv;')
      .replace('#include <map_fragment>', 'vec4 sampledDiffuseColor = texture2D( map, vMapUv );\nif ( vCob > 0.02 ) sampledDiffuseColor.rgb = mix( sampledDiffuseColor.rgb, texture2D( uCobTex, vCobUv ).rgb, smoothstep( 0.2, 0.6, vCob ) );\ndiffuseColor *= sampledDiffuseColor;');
  };
  const group = new THREE.Group();
  group.name = 'terrain';
  const chunks = [];
  const nx = F.nx;
  for (let cj = 0; cj < F.nz - 1; cj += chunk)
    for (let ci = 0; ci < nx - 1; ci += chunk) {
      const w = Math.min(chunk, nx - 1 - ci) + 1;
      const h = Math.min(chunk, F.nz - 1 - cj) + 1;
      const pos = new Float32Array(w * h * 3);
      const col = new Float32Array(w * h * 3);
      const nrm = new Float32Array(w * h * 3);
      const uv = new Float32Array(w * h * 2);
      const cob = new Float32Array(w * h);
      for (let j = 0; j < h; j++)
        for (let i = 0; i < w; i++) {
          const gi = ci + i;
          const gj = cj + j;
          const k = gj * nx + gi;
          const x = F.x0 + gi * F.cell;
          const z = F.z0 + gj * F.cell;
          const v = j * w + i;
          pos.set([x, F.h[k], z], v * 3);
          const hx = F.h[gj * nx + Math.min(nx - 1, gi + 1)] - F.h[gj * nx + Math.max(0, gi - 1)];
          const hz = F.h[Math.min(F.nz - 1, gj + 1) * nx + gi] - F.h[Math.max(0, gj - 1) * nx + gi];
          const nl = Math.hypot(hx, 4 * F.cell, hz);
          nrm.set([-hx / nl, (4 * F.cell) / nl, -hz / nl], v * 3);
          const slope = Math.hypot(hx, hz) / (2 * F.cell);
          col.set(colourAt(F, k, x, z, slope), v * 3);
          uv.set([x / 2, z / 2], v * 2);
          cob[v] = F.cobble[k];
        }
      const idx = [];
      for (let j = 0; j < h - 1; j++)
        for (let i = 0; i < w - 1; i++) {
          const a = j * w + i;
          idx.push(a, a + w, a + 1, a + 1, a + w, a + w + 1);
        }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      g.setAttribute('aCob', new THREE.BufferAttribute(cob, 1));
      g.setIndex(idx);
      g.computeBoundingSphere();
      const m = new THREE.Mesh(g, mat);
      m.receiveShadow = true;
      m.castShadow = true; // the cliffs and ridges throw shadows too
      m.name = 'terrain';
      m.userData.centre = [g.boundingSphere.center.x, g.boundingSphere.center.z];
      m.userData.radius = g.boundingSphere.radius; // round 2: radius of the chunk (bounding sphere), used by the distance culling
      group.add(m);
      chunks.push(m);
      yield;
    }
  return { group, chunks, material: mat };
}

/** The whole terrain at once (tests, tools). */
export function buildTerrain(F, chunk = 48) {
  const it = terrainSteps(F, chunk);
  for (;;) {
    const s = it.next();
    if (s.done) return s.value;
  }
}

/** The terrain chunk by chunk: `await pause()` between two chunks. */
export async function buildTerrainAsync(F, pause, chunk = 48) {
  const it = terrainSteps(F, chunk);
  for (;;) {
    const s = it.next();
    if (s.done) return s.value;
    await pause();
  }
}
