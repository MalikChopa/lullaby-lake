// The ground field: the terrain sampled once on a 0.5 m grid (data/map.js TERRAIN): height, distance to the water, dirt, cobbles, grass
// density, flower beds, tall grass. The terrain mesh, the grass, the flowers, the water and the particles all read it (the GPU gets it as a
// float texture). Built in slices (a generator) so the page never freezes for long. Pure: no DOM, no three.js.

import { TERRAIN, PATHS, AREAS, DECKS } from '../data/map.js';
import { heightAt, landDist, pathShare, boundaryDist, onIslet } from './terrain.js';
import { allProps, propRadius, buildingBoxes, distToBox } from './mapgen.js';
import { allDecor, decorGround } from './decor.js';

const hash = (x, z) => {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

/** 0..1 share of the apron of a building at (x, z): its footprint grown by APRON metres (and by FRONT metres more in front of the door side, local +z). */
export const APRON = 0.8;
export const FRONT = 0.9;
export function apronShare(x, z, b) {
  const c = Math.cos(b.rot);
  const s = Math.sin(b.rot);
  const dx = x - b.x;
  const dz = z - b.z;
  const lx = dx * c - dz * s;
  const lz = dx * s + dz * c;
  const ox = Math.max(Math.abs(lx) - b.hw, 0);
  const oz = lz > b.hd ? Math.max(lz - b.hd - FRONT, 0) : Math.max(-lz - b.hd, 0);
  return Math.max(0, Math.min(1, (APRON - Math.hypot(ox, oz)) / 0.5));
}

/** Creates the empty field and a generator that fills it, `rows` rows per step. */
export function fieldBuilder(rows = 24) {
  const c = TERRAIN.cell;
  const nx = Math.round((TERRAIN.x1 - TERRAIN.x0) / c) + 1; // vertices
  const nz = Math.round((TERRAIN.z1 - TERRAIN.z0) / c) + 1;
  const N = nx * nz;
  const F = {
    nx,
    nz,
    cell: c,
    x0: TERRAIN.x0,
    z0: TERRAIN.z0,
    h: new Float32Array(N),
    land: new Float32Array(N),
    dirt: new Float32Array(N),
    cobble: new Float32Array(N),
    grass: new Float32Array(N),
    flower: new Float32Array(N),
    tall: new Float32Array(N),
    shade: new Float32Array(N), // forest floor (under pines): darker, fewer blades
    edge: new Float32Array(N), // outside the boundary (cliff / ridge)
    ready: false,
  };
  const X = (i) => F.x0 + i * c;
  const Z = (j) => F.z0 + j * c;
  // raster helper: f(x, z, k) on every vertex within the box
  const raster = (x0, z0, x1, z1, f) => {
    const i0 = Math.max(0, Math.floor((x0 - F.x0) / c));
    const i1 = Math.min(nx - 1, Math.ceil((x1 - F.x0) / c));
    const j0 = Math.max(0, Math.floor((z0 - F.z0) / c));
    const j1 = Math.min(nz - 1, Math.ceil((z1 - F.z0) / c));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) f(X(i), Z(j), j * nx + i);
  };
  function* steps() {
    for (let j0 = 0; j0 < nz; j0 += rows) {
      for (let j = j0; j < Math.min(nz, j0 + rows); j++)
        for (let i = 0; i < nx; i++) {
          const x = X(i);
          const z = Z(j);
          const k = j * nx + i;
          F.h[k] = heightAt(x, z);
          F.land[k] = landDist(x, z);
          const b = onIslet(x, z, 2) ? -5 : boundaryDist(x, z);
          F.edge[k] = Math.max(0, Math.min(1, (b + 0.5) / 2.5));
          // grass on land, thinning at the shore and on the cliffs; patches of tall grass in the meadows
          const g = Math.max(0, Math.min(1, (F.land[k] - 0.45) / 0.8)) * (1 - F.edge[k]);
          F.grass[k] = g;
          const n = 0.5 + 0.5 * Math.sin(x * 0.19 + Math.sin(z * 0.13) * 2.2) * Math.cos(z * 0.17 - x * 0.07);
          F.tall[k] = g * Math.max(0, Math.min(1, (n - 0.55) / 0.2));
          if (hash(Math.floor(x * 1.3), Math.floor(z * 1.3)) > 0.985) F.flower[k] = 0.5 * g;
        }
      yield;
    }
    // paths and areas
    for (const p of PATHS) {
      for (let s = 0; s < p.pts.length - 1; s++) {
        const [ax, az] = p.pts[s];
        const [bx, bz] = p.pts[s + 1];
        const m = p.w * 1.2 + 0.8;
        raster(Math.min(ax, bx) - m, Math.min(az, bz) - m, Math.max(ax, bx) + m, Math.max(az, bz) + m, (x, z, k) => {
          const a = pathShare(x, z, p);
          if (p.kind === 'dirt') F.dirt[k] = Math.max(F.dirt[k], a);
          else F.cobble[k] = Math.max(F.cobble[k], a);
        });
      }
      yield;
    }
    let nAreas = 0;
    for (const a of AREAS) {
      if (++nAreas % 6 === 0) yield;
      raster(a.x - a.r - 1, a.z - a.r - 1, a.x + a.r + 1, a.z + a.r + 1, (x, z, k) => {
        const d = Math.hypot(x - a.x, z - a.z);
        if (a.kind === 'cobble') F.cobble[k] = Math.max(F.cobble[k], Math.max(0, Math.min(1, (a.r - d) / 0.35 + 0.5)));
        else if (a.kind === 'flowers') F.flower[k] = Math.max(F.flower[k], Math.max(0, Math.min(1, (a.r - d) / 0.6 + 0.3)) * (0.75 + 0.25 * hash(x, z)));
        else if (a.kind === 'clearing') F.tall[k] *= Math.min(1, d / a.r);
      });
    }
    yield;
    // no grass under the decks, the buildings and the props; forest floor in the shade of the pines
    for (const d of DECKS) raster(d.x0 - 0.4, d.z0 - 0.4, d.x1 + 0.4, d.z1 + 0.4, (x, z, k) => (F.grass[k] = 0));
    const boxes = buildingBoxes();
    yield;
    for (const b of boxes) {
      raster(b.x - 6, b.z - 6, b.x + 6, b.z + 6, (x, z, k) => {
        const d = distToBox(x, z, b);
        if (d < 0.5) {
          F.grass[k] *= d / 0.5;
          F.flower[k] = 0;
          F.tall[k] = 0;
        }
        // round 2: an apron around every building (the walls no longer sink into the grass): packed earth round the cabin, cobbles round the
        // village houses (a wider band in front of the door), the grass thinned out beyond it
        const a = apronShare(x, z, b);
        if (a > 0) {
          if (b.kind === 'cabin') F.dirt[k] = Math.max(F.dirt[k], a * 0.9);
          else F.cobble[k] = Math.max(F.cobble[k], a * (b.kind === 'workshop' ? 0.62 : 0.78));
        }
      });
      yield; // one step per building (J9-C: no step longer than a few ms)
    }
    const props = allProps(); // the first call generates the whole list of props: a step of its own
    yield;
    // round 2: a patch of packed earth under the camp, the cart and the firewood (the decor stands on the ground, not in the grass)
    for (const d of allDecor()) {
      const g = decorGround(d);
      if (!g) continue;
      raster(d[1] - g.r - 0.5, d[2] - g.r - 0.5, d[1] + g.r + 0.5, d[2] + g.r + 0.5, (x, z, k) => {
        const dd = Math.hypot(x - d[1], z - d[2]);
        F.dirt[k] = Math.max(F.dirt[k], g.a * Math.max(0, Math.min(1, (g.r - dd) / 0.7)) * (0.82 + 0.18 * hash(x * 1.7, z * 1.7)));
      });
    }
    yield;
    let nProps = 0;
    for (const p of props) {
      if (++nProps % 60 === 0) yield;
      const r = propRadius(p);
      if (p.type === 'pine' || p.type === 'tree') {
        const R = 1.8 * p.s;
        raster(p.x - R, p.z - R, p.x + R, p.z + R, (x, z, k) => {
          const d = Math.hypot(x - p.x, z - p.z);
          F.shade[k] = Math.max(F.shade[k], Math.max(0, 1 - d / R));
        });
      }
      if (!r) continue;
      raster(p.x - r - 0.3, p.z - r - 0.3, p.x + r + 0.3, p.z + r + 0.3, (x, z, k) => {
        const d = Math.hypot(x - p.x, z - p.z);
        if (d < r * 0.8) {
          F.grass[k] = Math.min(F.grass[k], 0.3);
          F.flower[k] = 0;
          F.tall[k] = 0;
        }
      });
    }
    yield;
    for (let k = 0; k < N; k++) {
      const path = Math.max(F.dirt[k], F.cobble[k]);
      F.grass[k] *= Math.max(0, 1 - path * 1.35) * (1 - 0.45 * F.shade[k]);
      F.flower[k] *= Math.max(0, 1 - path * 2) * (F.land[k] > 0.8 ? 1 : 0);
      F.tall[k] *= Math.max(0, 1 - path * 2);
    }
    F.ready = true;
  }
  return { field: F, steps: steps() };
}

/** Builds the whole field at once (tests, tools). */
export function buildField() {
  const b = fieldBuilder(1e9);
  for (const _ of b.steps) void _;
  return b.field;
}

/** Bilinear sample of one channel of the field at (x, z). */
export function sampleField(F, arr, x, z) {
  const fx = Math.max(0, Math.min(F.nx - 1.001, (x - F.x0) / F.cell));
  const fz = Math.max(0, Math.min(F.nz - 1.001, (z - F.z0) / F.cell));
  const i = Math.floor(fx);
  const j = Math.floor(fz);
  const u = fx - i;
  const v = fz - j;
  const k = j * F.nx + i;
  return (arr[k] * (1 - u) + arr[k + 1] * u) * (1 - v) + (arr[k + F.nx] * (1 - u) + arr[k + F.nx + 1] * u) * v;
}
