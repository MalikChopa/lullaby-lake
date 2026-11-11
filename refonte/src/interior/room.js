// An interior room as a small 3D diorama (brief 28): a floor, the BACK and WEST walls (front wall and roof left out), a door that matches the exterior one,
// windows that show the real sky colour of the moment, furniture from the Kenney models (Furniture / Survival / Pirate / Fantasy Town kits, loaded when the room
// is entered), warm lamps, the angler and the characters as the same pixel-art billboards as outside. It lives in ITS OWN scene and camera: the shell renders it
// through the same renderer and post pipeline (world/post.js createPost(renderer, room.scene, room.camera, tier, w, h)) INSTEAD of the world while a room is
// open (the exterior is not drawn: no frame time spent on it). The room is at the origin of its own scene, so nothing to offset.
//
//   const room = await createInterior('cabin', { reduced, story: { couplet: 3 }, phase: 'jour', weather: 'soleil', lang: 'fr', base })
//   room.scene / room.camera / room.fit(aspect) / room.update(dt) / room.setLook(phase, weather) / room.setStory(st) / room.dispose()
//   room.nav, room.spawn, room.exit, room.interactables [{ id, kind, x, z, r, label: { fr, en } }], room.angler.place(x, z, dir), room.problems.missing (models)

import * as THREE from 'three';
import { ROOMS } from '../data/interiors.js';
import S from '../data/strings-interior.js';
import { VILLAGERS } from '../data/map.js';
import { createBuilder, pixelTexture, lin } from '../world/geo.js';
import { createBillboard, sheetTexture } from '../world/sprites.js';
import { getModel, stamp, preloadModels } from '../world/models.js';
import { planks, plaster } from '../art/textures.js';
import { anglerSheet, catSheet, ANGLER, CAT } from '../art/sheets.js';
import { folkSheet, FOLK } from '../art/folk.js';
import { buildInteriorNav, activeProps, activeLights } from './logic.js';
import { interiorLook } from './lighting.js';
import { CODE_PIECES, stampOptions } from './layout.js';

export const CAM = Object.freeze({ fov: 30, pitchDeg: 38, yawDeg: 45 });

const T = Math.PI / 4;
const WALL_T = 0.2;

/** A wall along the back (axis 'n': x from 0 to len, z = -t/2) or the west side (axis 'w': z from 0 to len, x = -t/2) with openings { c, w, y0, y1 } cut out. */
function wall(b, axis, len, H, holes, col, top) {
  const box = (c0, c1, y0, y1) => {
    if (c1 - c0 < 1e-3 || y1 - y0 < 1e-3) return;
    const mid = (c0 + c1) / 2;
    if (axis === 'n') b.box(mid, y0, -WALL_T / 2, c1 - c0, y1 - y0, WALL_T, col, 0, top);
    else b.box(-WALL_T / 2, y0, mid, WALL_T, y1 - y0, c1 - c0, col, 0, top);
  };
  const hs = holes.map((h) => ({ a: h.c - h.w / 2, b: h.c + h.w / 2, y0: h.y0, y1: h.y1 })).sort((p, q) => p.a - q.a);
  let x = 0;
  for (const h of hs) {
    box(x, h.a, 0, H);
    box(h.a, h.b, 0, h.y0);
    box(h.a, h.b, h.y1, H);
    x = h.b;
  }
  box(x, len, 0, H);
}

/**
 * @param {string} id room id (data/interiors.js)
 * @param {{ reduced?: boolean, story?: { couplet?: number, finale?: boolean }, phase?: string, weather?: string, lang?: 'fr'|'en', base?: string, markers?: boolean, load?: boolean }} [ctx]
 */
export async function createInterior(id, ctx = {}) {
  const room = ctx.data || ROOMS[id];
  if (!room) throw new Error('unknown room ' + id);
  const lang = ctx.lang || 'fr';
  let story = { couplet: 0, finale: false, ...(ctx.story || {}) };
  const ids = [...new Set(room.props.filter((q) => q.m).map((q) => q.m))];
  if (ctx.load !== false) await preloadModels(ids, ctx.base ? { base: ctx.base } : {});
  const missing = ids.filter((m) => !getModel(m));

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#1b1728');
  const root = new THREE.Group();
  scene.add(root);
  const camera = new THREE.PerspectiveCamera(CAM.fov, 16 / 9, 0.5, 80);
  const target = new THREE.Vector3(room.w * 0.46, 0.7, room.d * 0.46);

  const texFloor = pixelTexture(planks(21));
  const texWall = pixelTexture(plaster(22));
  const mFloor = new THREE.MeshLambertMaterial({ vertexColors: true, map: texFloor });
  const mWall = new THREE.MeshLambertMaterial({ vertexColors: true, map: texWall });
  const mFlat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const mSky = new THREE.MeshBasicMaterial({ color: 0xbfe0f4 });
  const mLampGlow = new THREE.MeshBasicMaterial({ color: 0xffe2a0 });

  // ---- floor and walls
  const Bf = createBuilder(2);
  const Bw = createBuilder(2);
  const Bx = createBuilder(2); // flat pieces: trims, door, window frames
  const Gs = createBuilder(1); // the sky behind the windows
  const floorCol = lin(room.floor.hex);
  Bf.box(room.w / 2, -0.12, room.d / 2, room.w, 0.12, room.d, floorCol, 0, floorCol);
  const wallCol = lin(room.wall.hex);
  const trim = lin(room.wall.trim);
  const holes = { n: [], w: [] };
  const door = room.door;
  holes.n.push({ c: door.x, w: door.w, y0: 0, y1: door.h });
  for (const w of room.windows) holes[w.wall].push({ c: w.at, w: w.w, y0: w.y, y1: w.y + w.h });
  wall(Bw, 'n', room.w, room.wallH, holes.n, wallCol, trim);
  wall(Bw, 'w', room.d, room.wallH, holes.w, wallCol, trim);
  Bx.box(room.w / 2, 0, 0.05, room.w, 0.14, 0.1, trim);
  Bx.box(0.05, 0, room.d / 2, 0.1, 0.14, room.d, trim);
  Bx.box(room.w / 2, room.wallH - 0.1, 0.04, room.w, 0.1, 0.12, trim);
  Bx.box(0.04, room.wallH - 0.1, room.d / 2, 0.12, 0.1, room.d, trim);
  Bx.box(0.06, 0, 0.06, 0.16, room.wallH, 0.16, trim);
  // the door: a frame and the leaf in the colour of the exterior door, a handle, a sliver of daylight behind
  const dc = lin(door.hex);
  Bx.box(door.x - door.w / 2 - 0.05, 0, 0.06, 0.1, door.h + 0.08, 0.14, trim);
  Bx.box(door.x + door.w / 2 + 0.05, 0, 0.06, 0.1, door.h + 0.08, 0.14, trim);
  Bx.box(door.x, door.h, 0.06, door.w + 0.2, 0.1, 0.14, trim);
  Bx.box(door.x, 0, -0.02, door.w, door.h, 0.06, dc);
  Bx.box(door.x + door.w * 0.32, 0.95, 0.04, 0.07, 0.07, 0.05, lin('#f2d488'));
  // windows: a frame, a cross, the sky behind
  const frame = lin('#f2e6c8');
  for (const w of room.windows) {
    const y0 = w.y;
    if (w.wall === 'n') {
      Bx.box(w.at, y0 - 0.08, 0.08, w.w + 0.24, 0.08, 0.16, frame);
      Bx.box(w.at, y0 + w.h, 0.06, w.w + 0.2, 0.08, 0.12, frame);
      Bx.box(w.at - w.w / 2 - 0.04, y0, 0.06, 0.08, w.h, 0.12, frame);
      Bx.box(w.at + w.w / 2 + 0.04, y0, 0.06, 0.08, w.h, 0.12, frame);
      Bx.box(w.at, y0, 0.03, 0.05, w.h, 0.05, frame);
      Bx.box(w.at, y0 + w.h / 2 - 0.025, 0.03, w.w, 0.05, 0.05, frame);
      Gs.box(w.at, 0, -0.5, w.w + 0.6, y0 + w.h + 0.3, 0.02, [1, 1, 1]);
    } else {
      Bx.box(0.08, y0 - 0.08, w.at, 0.16, 0.08, w.w + 0.24, frame);
      Bx.box(0.06, y0 + w.h, w.at, 0.12, 0.08, w.w + 0.2, frame);
      Bx.box(0.06, y0, w.at - w.w / 2 - 0.04, 0.12, w.h, 0.08, frame);
      Bx.box(0.06, y0, w.at + w.w / 2 + 0.04, 0.12, w.h, 0.08, frame);
      Bx.box(0.03, y0, w.at, 0.05, w.h, 0.05, frame);
      Bx.box(0.03, y0 + w.h / 2 - 0.025, w.at, 0.05, 0.05, w.w, frame);
      Gs.box(-0.5, 0, w.at, 0.02, y0 + w.h + 0.3, w.w + 0.6, [1, 1, 1]);
    }
  }
  // the daylight in the doorway (an opening onto the outside)
  Gs.box(door.x, 0, -0.5, door.w + 0.3, door.h + 0.1, 0.02, [1, 1, 1]);

  const bodies = new THREE.Group();
  root.add(bodies);
  const meshes = [];
  let lampSpots = [];
  const mkMesh = (b, mat, name, cast, recv, parent) => {
    if (!b.count()) return null;
    const m = new THREE.Mesh(b.geometry(), mat);
    m.name = name;
    m.castShadow = cast;
    m.receiveShadow = recv;
    parent.add(m);
    return m;
  };
  /** (Re)builds the pieces that depend on the story: furniture, lights, bulbs. */
  function build() {
    for (const m of meshes) {
      m.geometry.dispose();
      bodies.remove(m);
    }
    meshes.length = 0;
    const Bm = createBuilder(2);
    const Bl = createBuilder(1);
    for (const q of activeProps(room, story)) {
      if (q.kind) {
        if (CODE_PIECES[q.kind]) CODE_PIECES[q.kind](Bm, q, lin);
        continue;
      }
      const m = getModel(q.m);
      if (m) stamp(Bm, m, stampOptions(q));
      else if (q.fp) Bm.box(q.x, q.y || 0, q.z, q.fp[0], q.h || 0.7, q.fp[1], lin('#9a7a5a'), q.rot || 0); // a model that failed to load: a plain stand-in
    }
    lampSpots = activeLights(room, story);
    // the glow of each light sits IN its source (brief 31): a lamp lights the opening at the top of its shade (l.y = that height, l.r its radius),
    // a candle a small flame on its wick (l.y = the top of the wax), a hearth a bed of embers hidden in the stove or the forge
    for (const l of lampSpots) {
      if (l.kind === 'candle') Bl.cone(l.x, l.y, l.z, 0.022, 0.06, 6, [1, 1, 1]);
      else if (l.kind === 'hearth') Bl.box(l.x, l.y - 0.05, l.z, 0.16, 0.1, 0.16, [1, 1, 1]);
      else Bl.cyl(l.x, l.y - 0.03, l.z, l.r || 0.06, 0.02, 8, [1, 1, 1]);
    }
    for (const m of [mkMesh(Bm, mFlat, 'pieces', true, true, bodies), mkMesh(Bl, mLampGlow, 'glow-lamps', false, false, bodies)]) if (m) meshes.push(m);
  }
  mkMesh(Bf, mFloor, 'floor', false, true, root);
  mkMesh(Bw, mWall, 'walls', true, true, root);
  mkMesh(Bx, mFlat, 'trims', true, true, root);
  mkMesh(Gs, mSky, 'sky', false, false, root);
  build();

  // ---- lights: the window light (a sun / a moon with a shadow), the sky fill, a pool of 4 lamps
  const sun = new THREE.DirectionalLight(0xffffff, 2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.bias = -0.0008;
  sun.shadow.normalBias = 0.03;
  Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 1, far: 30 });
  sun.position.set(-4.5, 7, -3.5).add(target);
  sun.target.position.copy(target);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
  scene.add(sun, sun.target, hemi);
  const pool = [];
  for (let i = 0; i < 4; i++) {
    const L = new THREE.PointLight(0xffc070, 0, 7.5, 1.7);
    L.position.set(0, -20, 0);
    scene.add(L);
    pool.push(L);
  }

  // ---- sprites
  const bases = []; // the sheet textures of the billboards (each sprite has a clone with its own offset): disposed with the room
  const bb = (sheet, grid) => {
    const base = sheetTexture(sheet);
    bases.push(base);
    return createBillboard(base, grid, { receive: false, blob: 0.4 });
  };
  const actors = [];
  const place = (s, x, z) => {
    s.root.position.set(x, 0, z);
    s.face(T);
  };
  const angler = bb(anglerSheet(), { sheetW: ANGLER.cellW * ANGLER.cols, sheetH: ANGLER.cellH * ANGLER.rows, cellW: ANGLER.cellW, cellH: ANGLER.cellH });
  angler.setShadowMode(true);
  angler.frame(0, 0);
  place(angler, ...room.spawn);
  root.add(angler.root);
  actors.push(angler);
  const dirRow = { down: 0, up: 1, left: 2, right: 3 };
  const folk = [];
  for (const c of [room.shopkeeper, room.resident]) {
    if (!c) continue;
    const v = VILLAGERS.find((q) => q.id === c.id);
    const b = bb(folkSheet(v.look), { sheetW: FOLK.cellW * FOLK.cols, sheetH: FOLK.cellH * FOLK.rows, cellW: FOLK.cellW, cellH: FOLK.cellH });
    b.setShadowMode(true);
    b.frame(0, 0);
    place(b, c.x, c.z);
    root.add(b.root);
    folk.push(b);
    actors.push(b);
  }
  let cat = null;
  if (room.cat) {
    cat = bb(catSheet(), { sheetW: CAT.cellW * CAT.cols, sheetH: CAT.cellH, cellW: CAT.cellW, cellH: CAT.cellH });
    cat.setShadowMode(true);
    cat.frame(4, 0);
    place(cat, room.cat.x, room.cat.z);
    root.add(cat.root);
    actors.push(cat);
  }
  if (ctx.markers) {
    const mm = new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.7 });
    for (const it of room.interactables) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(it.r * 0.35, it.r * 0.45, 20), mm);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(it.x, 0.02, it.z);
      root.add(ring);
    }
  }

  // ---- decorative life: dust motes in the window light, steam over the cooking: both still when reduced motion is asked
  const rnd = (i, k) => {
    const v = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
    return v - Math.floor(v);
  };
  const mkPoints = (n, size, color, opacity) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(n * 3), 3));
    const pts = new THREE.Points(g, new THREE.PointsMaterial({ size, color, transparent: true, opacity, depthWrite: false }));
    pts.frustumCulled = false;
    root.add(pts);
    return pts;
  };
  const dust = room.life.includes('dust') ? mkPoints(36, 0.05, 0xfff2c8, 0.55) : null;
  const steamAt = room.life.includes('steam') ? room.props.find((q) => q.kind === 'stove') || room.props.find((q) => q.m === 'i_stove') || room.props.find((q) => q.m === 'i_cab') : null;
  const steam = steamAt ? mkPoints(14, 0.16, 0xffffff, 0.22) : null;
  const moveLife = (time) => {
    if (dust) {
      const a = dust.geometry.attributes.position;
      for (let i = 0; i < 36; i++) a.setXYZ(i, 0.8 + rnd(i, 1) * room.w * 0.45 + Math.sin(time * 0.25 + i) * 0.12, 0.4 + ((rnd(i, 2) * 2 + time * 0.03 * (0.5 + rnd(i, 3))) % 1) * 1.6, 0.6 + rnd(i, 4) * room.d * 0.5 + Math.cos(time * 0.2 + i * 2) * 0.12);
      a.needsUpdate = true;
    }
    if (steam) {
      const a = steam.geometry.attributes.position;
      for (let i = 0; i < 14; i++) {
        const k = (rnd(i, 5) + time * 0.12) % 1;
        a.setXYZ(i, steamAt.x + 0.05 + Math.sin(k * 6 + i) * 0.12, (steamAt.kind ? 0.78 : 0.95) + k * 0.9, steamAt.z + Math.cos(k * 5 + i) * 0.1);
      }
      a.needsUpdate = true;
    }
  };
  moveLife(3);

  // ---- look: the light of the moment
  let look = interiorLook(ctx.phase || 'jour', ctx.weather || 'soleil');
  const setLook = (phase, weather) => {
    look = interiorLook(phase, weather);
    sun.color.set(look.sun);
    sun.intensity = look.sunI;
    hemi.color.set(look.hemiSky);
    hemi.groundColor.set(look.hemiGround);
    hemi.intensity = look.hemiI;
    mSky.color.set(look.sky);
    mLampGlow.color.setScalar(0.35 + 0.65 * look.lamp).multiply(new THREE.Color(1, 0.9, 0.6));
    if (dust) dust.material.opacity = (0.6 * look.sunI) / 2.6;
  };
  setLook(ctx.phase || 'jour', ctx.weather || 'soleil');

  const fit = (aspect = camera.aspect) => {
    camera.aspect = aspect;
    const R = Math.hypot(room.w, room.d, room.wallH * 0.8) * 0.41 + 0.7;
    const half = (CAM.fov / 2) * (Math.PI / 180);
    const hf = Math.min(half, Math.atan(Math.tan(half) * aspect));
    const dist = R / Math.sin(hf);
    const pit = (CAM.pitchDeg * Math.PI) / 180;
    camera.position.set(target.x + dist * Math.cos(pit) * Math.sin(T), target.y + dist * Math.sin(pit), target.z + dist * Math.cos(pit) * Math.cos(T));
    camera.lookAt(target);
    camera.far = dist + 40;
    camera.updateProjectionMatrix();
    return dist;
  };
  fit(16 / 9);

  let t = 0;
  let anglerPos = [...room.spawn];
  const apply = (dt) => {
    t += dt;
    for (let i = 0; i < pool.length; i++) {
      const L = pool[i];
      const s = lampSpots[i];
      if (!s) {
        L.intensity = 0;
        continue;
      }
      const flick = ctx.reduced || s.kind === 'lamp' ? 1 : 0.85 + 0.15 * Math.sin(t * 7 + i * 3) * Math.sin(t * 3.1 + i);
      const k = s.kind === 'hearth' ? Math.max(look.lamp, 0.6) : look.lamp;
      L.position.set(s.x, s.y, s.z);
      L.color.set(s.kind === 'candle' ? 0xffc070 : s.kind === 'hearth' ? 0xff9a50 : 0xffd08a);
      L.intensity = k * (s.kind === 'hearth' ? 4.5 : s.kind === 'candle' ? 1.6 : 3.2) * (s.i ?? 1) * flick; // s.i: a softer lamp (a night light)
    }
    if (!ctx.reduced) moveLife(t);
  };
  apply(0);

  return {
    id,
    room,
    scene,
    root,
    camera,
    fit,
    nav: buildInteriorNav(room),
    spawn: [...room.spawn],
    /** Where the angler leaves: the point in front of the door (x, z) and the door itself. */
    exit: { x: room.door.x, z: 0.6, door: { x: room.door.x, z: 0, w: room.door.w } },
    interactables: room.interactables.map((it) => ({ ...it, label: { fr: S.fr['int.obj.' + it.id], en: S.en['int.obj.' + it.id] } })),
    name: { fr: S.fr['int.room.' + id], en: S.en['int.room.' + id] },
    lang,
    angler: {
      sprite: angler,
      place(x, z, dir = 'down') {
        anglerPos = [x, z];
        angler.root.position.set(x, 0, z);
        angler.frame(0, dirRow[dir] ?? 0);
      },
      get pos() {
        return anglerPos;
      },
    },
    folk,
    cat,
    problems: { missing },
    get look() {
      return look;
    },
    update: apply,
    setLook,
    setStory(st) {
      story = { ...story, ...st };
      build();
    },
    stats: () => ({ meshes: meshes.length + 4, actors: actors.length, lights: lampSpots.length }),
    dispose() {
      scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
      });
      for (const a of actors) a.dispose();
      for (const t of bases) t.dispose();
      if (sun.shadow.map) sun.shadow.map.dispose();
      for (const m of [mFloor, mWall, mFlat, mSky, mLampGlow]) m.dispose();
      texFloor.dispose();
      texWall.dispose();
    },
  };
}
