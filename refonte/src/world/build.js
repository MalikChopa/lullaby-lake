// Builds the static world from the map data: every prop, building, deck and fence is painted (world/painters.js) into merged builders,
// one per chunk (24 m squares) and per material family, so the whole village is a few dozen meshes. Chunks are frustum culled by three.js
// and hidden beyond the tier's view distance; small props (ferns, mushrooms, reeds, flowers on bushes...) sit in "detail" meshes hidden
// beyond the detail distance (a cheap LOD). Glowing glass (windows, lamps, the spirit tree) is three global meshes.
// J9-B: the build is a generator of small steps (one building, one deck, a batch of props, one chunk's meshes): buildStatic() runs it at
// once (same API and result as J8), buildStaticAsync({ onProgress, signal }) runs it in time slices that yield to the browser (no long
// task), and prebuildStatic() lets a loading screen build it early: the next buildStatic() then returns that prebuilt result.

import { pause } from './pause.js';
import * as THREE from 'three';
import { TERRAIN, BUILDINGS, DECKS, FENCES } from '../data/map.js';
import { LAYOUT } from '../data/params.js';
import { mulberry32 } from '../../../src/core/rng.js';
import { allProps } from '../logic/mapgen.js';
import { heightAt, landDist, deckAt, boundaryDist } from '../logic/terrain.js';
import { createBuilder, pixelTexture } from './geo.js';
import { planks, shingles, stones, bark, plaster, leaves } from '../art/textures.js';
import { signAtlas } from '../art/signs.js';
import { patchMaterial } from './shading.js';
import * as P from './painters.js';
import { drawDecor } from './decor.js';
import { allDecor } from '../logic/decor.js';
import { buildLife } from './life.js';
import { preloadModels } from './models.js';

export const CHUNK = 24;
const FAMILIES = ['flat', 'wood', 'deck', 'roof', 'stone', 'foliage', 'plaster', 'dflat', 'dfoliage', 'mleaf'];

/** Steps of the build; yields the progress (0..1) after each small step, returns the result. */
function* buildSteps() {
  const tex = {
    planks: pixelTexture(planks(11)),
    deck: pixelTexture(planks(12)),
    roof: pixelTexture(shingles(13)),
    stone: pixelTexture(stones(14)),
    bark: pixelTexture(bark(15)),
    plaster: pixelTexture(plaster(16)),
    leaves: pixelTexture(leaves(17)),
    signs: pixelTexture(signAtlas(), false),
  };
  const lam = (o, p) => patchMaterial(new THREE.MeshLambertMaterial({ vertexColors: true, ...o }), p);
  const mats = {
    flat: lam({}, {}),
    wood: lam({ map: tex.planks }, {}),
    deck: lam({ map: tex.deck }, { fade: false }),
    roof: lam({ map: tex.roof, side: THREE.DoubleSide }, {}),
    stone: lam({ map: tex.stone }, {}),
    foliage: lam({ map: tex.leaves, side: THREE.DoubleSide }, { sway: 0.05, wet: 0.2, key: 'leaf' }),
    plaster: lam({ map: tex.plaster }, {}),
    dflat: lam({ side: THREE.DoubleSide }, { sway: 0.06, key: 'dflat' }),
    dfoliage: lam({ side: THREE.DoubleSide }, { sway: 0.05, key: 'dfol' }),
    // art pass: the Kenney models' foliage (trees, pines, bushes): vertex colours, wind sway, double sided like the code-made foliage
    mleaf: lam({ side: THREE.DoubleSide }, { sway: 0.05, wet: 0.2, key: 'mleaf' }),
    glowWindow: new THREE.MeshBasicMaterial({ color: 0xffd890 }),
    glowLamp: new THREE.MeshBasicMaterial({ color: 0xffe2a0 }),
    spirit: new THREE.MeshBasicMaterial({ color: 0xbfe8ff }),
    // J9-B: sign boards (one atlas): lit like the world, plus a little glow of their own at night (emissive = the picture; light.js)
    sign: patchMaterial(new THREE.MeshLambertMaterial({ map: tex.signs, emissiveMap: tex.signs, emissive: 0xffffff, emissiveIntensity: 0, alphaTest: 0.5 }), { key: 'sign', wet: 0.15 }),
  };
  // chunk grid
  const NCX = Math.ceil((TERRAIN.x1 - TERRAIN.x0) / CHUNK);
  const NCZ = Math.ceil((TERRAIN.z1 - TERRAIN.z0) / CHUNK);
  const chunkB = new Map();
  const buildersAt = (x, z) => {
    const ci = Math.max(0, Math.min(NCX - 1, Math.floor((x - TERRAIN.x0) / CHUNK)));
    const cj = Math.max(0, Math.min(NCZ - 1, Math.floor((z - TERRAIN.z0) / CHUNK)));
    const k = cj * NCX + ci;
    if (!chunkB.has(k)) chunkB.set(k, { ci, cj, B: Object.fromEntries(FAMILIES.map((f) => [f, createBuilder(f === 'stone' ? 1 : 2)])) });
    return chunkB.get(k).B;
  };
  const G = { win: createBuilder(1), lamp: createBuilder(1), spirit: createBuilder(1), sign: createBuilder(1) };
  const occluders = [null];
  const out = { lights: [], chimneys: [], piles: [], deckShadows: [] };
  const ctx = {
    h: heightAt,
    land: landDist,
    deckY: (x, z) => {
      const d = deckAt(x, z);
      return d ? d.y : null;
    },
    rng: mulberry32(77),
    out,
    occ(name, c, r) {
      occluders.push({ id: occluders.length, name, c, r });
      return occluders.length - 1;
    },
  };
  const props = allProps();
  // work units: buildings, decks, fences, props (batches of PROP_BATCH), then one unit per chunk for its meshes
  const PROP_BATCH = 40;
  const decor = allDecor(); // round 2: cosmetic decor (camp life, flower beds, hedges...), see logic/decor.js
  const DECOR_BATCH = 12;
  const total = BUILDINGS.length + DECKS.length + 1 + FENCES.length + Math.ceil(props.length / PROP_BATCH) + Math.ceil(decor.length / DECOR_BATCH) + NCX * NCZ + 1;
  let done = 0;
  const tick = () => ++done / total;
  // buildings
  for (const b of BUILDINGS) {
    P.building(buildersAt(b.x, b.z), b, ctx, G);
    yield tick();
  }
  // decks (+ the J7 piles), their shadow on the water
  for (const d of DECKS) {
    P.deck(buildersAt((d.x0 + d.x1) / 2, (d.z0 + d.z1) / 2), d, ctx);
    out.deckShadows.push({ x0: d.x0, z0: d.z0, x1: d.x1, z1: d.z1, y: d.y });
    yield tick();
  }
  P.pierPiles(buildersAt(3, -5), LAYOUT.pier.piles);
  out.piles.push(...LAYOUT.pier.piles);
  yield tick();
  for (const f of FENCES) {
    P.fence(buildersAt(f[0][0], f[0][1]), f, ctx);
    yield tick();
  }
  // props
  const counts = {};
  for (let i = 0; i < props.length; i++) {
    const p = props[i];
    const B = buildersAt(p.x, p.z);
    counts[p.type] = (counts[p.type] || 0) + 1;
    if (p.type === 'pine') P.pine(B, p, ctx, boundaryDist(p.x, p.z) > 4);
    else if (p.type === 'boat') out.deckShadows.push({ x0: p.x - 1.6, x1: p.x + 1.6, z0: p.z - 0.62, z1: p.z + 0.62, y: 0.45, boat: true }); // J12-B: the boat is a moving model (world/boatModel.js); only its water shadow slot is kept here
    else if (P[p.type]) P[p.type](B, p, ctx, G);
    if (i % PROP_BATCH === PROP_BATCH - 1) yield tick();
  }
  if (props.length % PROP_BATCH) yield tick();
  for (let i = 0; i < decor.length; i++) {
    drawDecor(buildersAt(decor[i][1], decor[i][2]), G, ctx, decor[i]);
    if (i % DECOR_BATCH === DECOR_BATCH - 1 || i === decor.length - 1) yield tick();
  }
  // meshes
  const group = new THREE.Group();
  group.name = 'static';
  const chunks = [];
  for (const { ci, cj, B } of chunkB.values()) {
    yield tick();
    const ch = { ci, cj, cx: TERRAIN.x0 + (ci + 0.5) * CHUNK, cz: TERRAIN.z0 + (cj + 0.5) * CHUNK, meshes: [], detail: [] };
    for (const f of FAMILIES) {
      const b = B[f];
      if (!b.count()) continue;
      const m = new THREE.Mesh(b.geometry(), mats[f]);
      m.name = f;
      const detail = f[0] === 'd' && f !== 'deck';
      m.castShadow = !detail || f === 'dflat';
      m.receiveShadow = true;
      (detail ? ch.detail : ch.meshes).push(m);
      group.add(m);
    }
    chunks.push(ch);
  }
  const glow = {};
  for (const [k, mat] of [['win', mats.glowWindow], ['lamp', mats.glowLamp], ['spirit', mats.spirit], ['sign', mats.sign]]) {
    if (!G[k].count()) continue;
    const m = new THREE.Mesh(G[k].geometry(), mat);
    m.name = 'glow-' + k;
    m.castShadow = k === 'spirit' || k === 'sign';
    m.receiveShadow = k === 'sign';
    group.add(m);
    glow[k] = m;
  }
  // J9-B: shafts, lamp pools, butterflies, birds (driven by app/light.js)
  const life = buildLife(out.lights, (x, z) => {
    const d = deckAt(x, z);
    return d ? d.y : heightAt(x, z);
  });
  group.add(life.group);
  done = total - 1;
  yield tick();
  return { group, chunks, mats, glow, occluders, lights: out.lights, chimneys: out.chimneys, piles: out.piles, deckShadows: out.deckShadows, counts, textures: tex, life };
}

let prebuilt = null;

/**
 * Builds the whole static world at once (J8 API). If prebuildStatic() / buildStaticAsync({ keep: true }) already built it, returns that
 * result (once). `fresh: true` always builds a new one.
 * @param {{ fresh?: boolean }} [o]
 */
export function buildStatic(o = {}) {
  if (!o.fresh && prebuilt) {
    const r = prebuilt;
    prebuilt = null;
    return r;
  }
  const it = buildSteps();
  for (;;) {
    const s = it.next();
    if (s.done) return s.value;
  }
}

const AbortErr = () => (typeof DOMException === 'function' ? new DOMException('The build was aborted', 'AbortError') : Object.assign(new Error('The build was aborted'), { name: 'AbortError' }));
const nextSlice = pause;

/**
 * The same build in time slices: runs steps for at most `sliceMs` (default 12 ms), then yields to the browser.
 * @param {{ onProgress?: (f:number)=>void, signal?: AbortSignal, sliceMs?: number, keep?: boolean, fresh?: boolean }} [o]
 *   onProgress(0..1) after every slice (rising, ends at 1); signal: abort -> rejects with an AbortError (nothing kept);
 *   keep: the result is also kept for the next buildStatic() call.
 * @returns {Promise<object>} the same object as buildStatic()
 */
export async function buildStaticAsync(o = {}) {
  const slice = o.sliceMs ?? 12;
  await preloadModels(); // art pass: the shipped models (same origin, tolerant: a missing file = the code-made prop is drawn)
  const it = buildSteps();
  let f = 0;
  for (;;) {
    if (o.signal && o.signal.aborted) throw AbortErr();
    const t0 = performance.now();
    let s;
    do s = it.next();
    while (!s.done && performance.now() - t0 < slice);
    if (s.done) {
      if (o.onProgress) o.onProgress(1);
      if (o.keep) prebuilt = s.value;
      return s.value;
    }
    f = Math.max(f, s.value);
    if (o.onProgress) o.onProgress(Math.min(0.999, f));
    await nextSlice();
  }
}

/** Builds the world early (e.g. behind a start screen) without blocking; the next buildStatic() returns it. */
export function prebuildStatic(o = {}) {
  return buildStaticAsync({ ...o, keep: true });
}

/** Number of work steps of the build (for tests). */
export function buildStepCount() {
  let n = 0;
  const it = buildSteps();
  while (!it.next().done) n++;
  return n;
}
