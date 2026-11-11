// The boat model (J12-B): a code-made rowing boat as a REPLACEABLE MODULE. A later art pass swaps this function for a loaded model (e.g. a Kenney Pirate Kit boat) as long as
// the small interface below is kept. The rest of the game only uses:
//   group        THREE.Group, bow toward local +x, its origin at the middle of the hull on the water line
//   size         { length, beam } in metres
//   mooring      [x, y, z] local point where the mooring rope ties on (the bow)
//   seat         [x, y, z] local point where the angler stands/sits
//   oarPoints    [[x, y, z], ...] the local points of the oar locks
//   lanternHook  [x, y, z] local point of the lantern hook (the lantern glow sits there)
//   setPose(x, z, rot, waterY)   rot = rotation about y (the bow points to (cos rot, -sin rot))
//   update(dt, { speed, reduced })   oar swing and a gentle bob (none in reduced motion)
//   setLantern(on)                   the glow of the hook
//   dispose()
// Draw calls: 5 (hull, two oars, lantern post, lantern glow). Colours are vertex colours of the hull (one mesh).
// Art pass: the hull is the Kenney Pirate Kit rowing boat (models.js id 'boat_row', its own oars left out: the rowing oars below swing); when the model is
// not loaded the code-made hull below is used.

/** The hull of the Kenney boat: bow toward +x, its keel a little under the water line, scaled to BOAT_SIZE. null when the model is missing. */
function modelHullGeometry() {
  const m = getModel('boat_row');
  if (!m) return null;
  const b = createBuilder(2);
  // the oars of the model are loose pieces: only the biggest connected piece (the hull and its seats) is drawn here
  const hull = largestPiece(m);
  let x0 = Infinity;
  let x1 = -Infinity;
  let z0 = Infinity;
  let z1 = -Infinity;
  for (let i = 0; i < hull.length; i++) {
    if (!hull[i]) continue;
    x0 = Math.min(x0, m.pos[i * 3]);
    x1 = Math.max(x1, m.pos[i * 3]);
    z0 = Math.min(z0, m.pos[i * 3 + 2]);
    z1 = Math.max(z1, m.pos[i * 3 + 2]);
  }
  // length and beam of BOAT_SIZE (a gently stubby rowing boat), keel a little below the water line
  stamp(b, m, { x: 0, y: -0.12, z: 0, anchor: 'origin', sx: BOAT_SIZE.length / (x1 - x0), sy: 0.8, sz: (BOAT_SIZE.beam * 1.18) / (z1 - z0), only: (pos, a) => hull[a] === 1, tint: [1.08, 1.0, 0.95] });
  return b.geometry();
}

import * as THREE from 'three';
import { BOAT_SIZE } from '../data/boat.js';
import { getModel, stamp, largestPiece } from './models.js';
import { createBuilder } from './geo.js';

const L = BOAT_SIZE.length / 2; // half length
const W = BOAT_SIZE.beam / 2; // half beam

function hullGeometry() {
  const pos = [];
  const col = [];
  const c = new THREE.Color();
  const tri = (a, b, d, color) => {
    c.set(color);
    for (const p of [a, b, d]) {
      pos.push(...p);
      col.push(c.r, c.g, c.b);
    }
  };
  const quad = (a, b, d, e, color) => {
    tri(a, b, d, color);
    tri(a, d, e, color);
  };
  const hull = '#8a5a3a';
  const inside = '#b08058';
  const rim = '#e8dcc0';
  const bench = '#c49a68';
  const sideL = [[-L, 0, -W], [L * 0.75, 0, -W * 0.7], [L, 0.5, 0], [L * 0.75, 0.55, -W * 0.9], [-L, 0.5, -W]];
  const sideR = sideL.map(([x, y, z]) => [x, y, -z]);
  quad(sideL[0], sideL[1], sideL[3], sideL[4], hull);
  tri(sideL[1], sideL[2], sideL[3], hull);
  quad(sideR[1], sideR[0], sideR[4], sideR[3], hull);
  tri(sideR[2], sideR[1], sideR[3], hull);
  quad([-L, 0.02, -W], [-L, 0.02, W], [L * 0.75, 0.02, W * 0.7], [L * 0.75, 0.02, -W * 0.7], inside);
  tri([L * 0.75, 0.02, -W * 0.7], [L * 0.75, 0.02, W * 0.7], [L, 0.45, 0], inside);
  quad([-L, 0, W], [-L, 0, -W], [-L, 0.5, -W], [-L, 0.5, W], hull);
  // two benches
  for (const x of [-0.9, 0.2]) quad([x - 0.15, 0.3, -W * 0.95], [x + 0.15, 0.3, -W * 0.95], [x + 0.15, 0.3, W * 0.95], [x - 0.15, 0.3, W * 0.95], bench);
  // the rim (thin strips along the top edge)
  for (const s of [-1, 1]) {
    quad([-L, 0.5, s * W], [L * 0.75, 0.55, s * W * 0.9], [L * 0.75, 0.58, s * (W * 0.9 - 0.07)], [-L, 0.53, s * (W - 0.07)], rim);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

export function createBoatModel() {
  const group = new THREE.Group();
  group.name = 'boat';
  group.rotation.order = 'YXZ'; // yaw first, then roll about the bow axis (local x)
  const hull = new THREE.Mesh(modelHullGeometry() || hullGeometry(), new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  hull.castShadow = true;
  hull.receiveShadow = true;
  group.add(hull);
  // oars: a thin blade on a pivot at each oar lock; the pivots swing while rowing
  const oarMat = new THREE.MeshLambertMaterial({ color: 0xc49a68 });
  const oarGeo = new THREE.BoxGeometry(1.5, 0.05, 0.09);
  const oarPoints = [[-0.35, 0.55, -W * 0.95], [-0.35, 0.55, W * 0.95]];
  const pivots = oarPoints.map(([x, y, z], i) => {
    const p = new THREE.Group();
    p.position.set(x, y, z);
    const m = new THREE.Mesh(oarGeo, oarMat);
    m.position.set(0, 0, i === 0 ? -0.55 : 0.55);
    m.rotation.y = Math.PI / 2;
    m.castShadow = true;
    p.add(m);
    group.add(p);
    return p;
  });
  // the lantern hook: a short post at the bow and a glow (the glow shows when the lantern is the player's)
  const hook = [L * 0.6, 0.6, 0];
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.5, 0.06), new THREE.MeshLambertMaterial({ color: 0x6a4a34 }));
  post.position.set(hook[0], hook[1] - 0.05, 0);
  group.add(post);
  const glow = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffe2a0 }));
  glow.position.set(hook[0], hook[1] + 0.28, 0);
  glow.visible = false;
  group.add(glow);

  let phase = 0;
  let t = 0;
  let baseY = 0;
  return {
    group,
    size: { length: BOAT_SIZE.length, beam: BOAT_SIZE.beam },
    mooring: [L, 0.4, 0],
    seat: [0, BOAT_SIZE.seatY, 0],
    oarPoints,
    lanternHook: hook,
    setPose(x, z, rot, waterY) {
      group.position.x = x;
      group.position.z = z;
      group.rotation.y = rot;
      baseY = waterY + 0.07; // the floor sits just above the water (the water is drawn over anything below its surface)
      group.position.y = baseY;
    },
    update(dt, { speed = 0, reduced = false } = {}) {
      t += dt;
      phase += speed * dt * 2.4;
      const sw = reduced ? 0 : Math.sin(phase) * Math.min(1, speed / 1.2) * 0.45;
      pivots.forEach((p, i) => {
        p.rotation.y = (i === 0 ? 1 : -1) * sw;
        p.rotation.z = reduced ? 0.15 : 0.15 + Math.cos(phase) * Math.min(1, speed / 1.2) * 0.1;
      });
      group.position.y = baseY + (reduced ? 0 : Math.sin(t * 1.6) * 0.022);
      group.rotation.x = reduced ? 0 : Math.sin(t * 1.1) * 0.025;
    },
    setLantern(on) {
      glow.visible = !!on;
    },
    dispose() {
      hull.geometry.dispose();
      hull.material.dispose();
      oarGeo.dispose();
      oarMat.dispose();
    },
  };
}
