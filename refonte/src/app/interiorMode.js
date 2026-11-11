// The interior mode (brief 29): pressing a door fades to dark, the small 3D room of data/interiors.js takes the place of the world, the angler walks inside, uses its things, and
// leaves by the door. The rules are in interior/actions.js and interior/sleep.js (pure); here is the glue: the fade, the render swap (the world is NOT drawn while inside: this is
// the only reason the interior is cheap on a phone), walking with the same keys / stick / taps as outside, the context button and the hint line, the HUD room name, the sleep.
// The game clock, the weather, the fishing core (idle), the villagers' wander and the shell tick keep running while inside; the villagers' sprites just stay out of sight.

import * as THREE from 'three';
import { WALK_SPEED } from '../data/params.js';
import { BUILDINGS } from '../data/map.js';
import { ROOMS } from '../data/interiors.js';
import { createInterior } from '../interior/room.js';
import { snap, findPath, atExit } from '../interior/logic.js';
import { pickUse, residentsOf, catTarget, catIsHome, isHome, actionOf, btnKey, lineKey, ambientKeys, pickLine, doorPoint, awayFrom, roomStep, walkingOut, roomOf } from '../interior/actions.js';
import { sleepPlan } from '../interior/sleep.js';
import { roomPick } from './roomTap.js';
import { roomFacts } from './roomFacts.js';
import { MODEL_BASE } from '../world/models.js';
import { INTERIOR_MODEL_FILES } from '../data/models.js';
import { createPost } from '../world/post.js';
import { viewSize } from './viewport.js';
import { screenDir } from './walk.js';
import { ANGLER_COLS, WALK_CYCLE } from '../art/sheets.js';
import { fork } from '../../../src/core/rng.js';

const DIR_ROW = { down: 0, up: 1, left: 2, right: 3 };
const YAW = Math.PI / 4; // the diorama camera: fixed at 45 degrees (data of interior/room.js CAM)
const FADE_MS = { out: 350, in: 350, rm: 120 }; // reduced motion: a very short cross-fade, no camera motion
const AMBIENT_EVERY = [45, 75]; // seconds between two small lines (never a timer that presses: only colour)
const PHASE_LOOK = { dawn: 'aube', day: 'jour', dusk: 'crepuscule', night: 'nuit' };
const WEATHER_LOOK = { clear: 'soleil', cloudy: 'nuages', rain: 'pluie', mist: 'brume' };

const wait = (ms) => new Promise((res) => setTimeout(res, ms));
const nextFrame = () =>
  new Promise((res) => {
    let done = false;
    const fin = () => {
      if (!done) {
        done = true;
        res();
      }
    };
    requestAnimationFrame(fin);
    setTimeout(fin, 120); // a hidden tab has no frames: never stuck
  });

export function createInteriorMode(ctx, { view, tiers, input, hud, walk, rig, fishing, shell }) {
  const { game, $, story, eco, chal } = ctx;
  const renderer = view.renderer;
  const fadeEl = $('fade');
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const tagV = new THREE.Vector3();
  const rng = fork(ctx.seed, 'interior#' + ctx.boot.sessions);
  const rngSleep = fork(ctx.seed, 'sleep#' + ctx.boot.sessions);
  const lastLines = {}; // the last ambient line of each room (never twice in a row, even after leaving and coming back)
  const preloaded = new Set();
  let cur = null;
  let busy = false;
  let zoomSaved = input.zoomGoal;
  let lastSleep = null;
  let lastLevels = null;
  let fadeLog = []; // the debug trace of the last fades

  const fadeTo = (on, instant) => {
    const ms = instant ? 0 : ctx.reduced ? FADE_MS.rm : on ? FADE_MS.out : FADE_MS.in;
    fadeLog.push({ on, ms });
    if (fadeLog.length > 10) fadeLog.shift();
    fadeEl.style.transitionDuration = ms + 'ms';
    fadeEl.classList.toggle('on', on);
    return ms ? wait(ms) : Promise.resolve();
  };
  const say = (text) => shell.announcer.say(text);
  const line = (text, s = 4) => {
    hud.showToast(text, s, true); // what you just touched answers at once (the waiting small lines are dropped)
    say(text);
  };
  const lang = () => ctx.lang;
  const nameOf = (room) => ctx.tx['int.room.' + room.id];

  function roomOfArg(x) {
    return ROOMS[x] ? x : roomOf(x);
  }
  const buildingOf = (id) => BUILDINGS.find((b) => b.id === ROOMS[id].building);
  const storyNow = () => {
    const st = story.get();
    return { couplet: st.couplets.length, finale: !!st.flags['finale.done'] };
  };

  function rebuildPost() {
    if (!cur) return;
    if (cur.post) cur.post.dispose();
    const vs = viewSize();
    cur.post = createPost(renderer, cur.room.scene, cur.room.camera, tiers.tier, vs.w, vs.h);
    if (cur.post) cur.post.set({ bloom: cur.room.look.bloom, grade: cur.room.look.grade, sat: cur.room.look.sat });
    cur.room.fit(vs.w / vs.h);
  }
  function refreshLook() {
    const W = game.getState().world;
    const key = W.phase + '|' + W.weather;
    if (key !== cur.lookKey) {
      cur.lookKey = key;
      cur.room.setLook(PHASE_LOOK[W.phase] || 'jour', WEATHER_LOOK[W.weather] || 'soleil');
      if (cur.post) cur.post.set({ bloom: cur.room.look.bloom, grade: cur.room.look.grade, sat: cur.room.look.sat });
      refreshFolk();
    }
    const st = storyNow();
    const sk = st.couplet + '|' + st.finale;
    if (sk !== cur.storyKey) {
      cur.storyKey = sk;
      cur.room.setStory(st);
    }
  }
  /** The residents show when their schedule says they are home; the keeper of a shop and the cat follow their own rule. */
  function refreshFolk() {
    const c = cur;
    const phase = game.getState().world.phase;
    const list = [c.room.room.shopkeeper, c.room.room.resident].filter(Boolean);
    list.forEach((v, i) => {
      const f = c.room.folk[i];
      if (f) f.root.visible = isHome(v.id, phase);
    });
    if (c.room.cat && c.room.room.id === 'cabin') c.room.cat.root.visible = catIsHome(c.room.room, walk.cat);
  }

  async function enter(target, o = {}) {
    const id = roomOfArg(target);
    if (!id || cur || busy) return false;
    if (!o.force && !shell.playing()) return false;
    busy = true;
    input.frozen = true;
    input.reset();
    walk.cancelRoute();
    const b = buildingOf(id);
    try {
      await fadeTo(true, o.instant);
      // the angler stands at the door outside: a reload while inside comes back here (the save keeps the outside place, no format change)
      const dp = doorPoint(b);
      walk.teleport(dp.x, dp.z);
      walk.pl.face = awayFrom(b);
      zoomSaved = input.zoomGoal;
      const W = game.getState().world;
      const room = await createInterior(id, {
        get reduced() {
          return ctx.reduced;
        },
        story: storyNow(),
        phase: PHASE_LOOK[W.phase] || 'jour',
        weather: WEATHER_LOOK[W.weather] || 'soleil',
        lang: ctx.lang,
      });
      const [x, z] = room.spawn;
      cur = { id, room, nav: room.nav, post: null, near: null, openOn: null, route: null, goal: null, pl: { x, z, dir: 'down', face: [0, 1], moving: false, walkT: 0 }, lookKey: '', storyKey: '', ambT: 25 + rng() * 20 };
      rebuildPost();
      refreshLook();
      refreshFolk();
      room.angler.place(x, z, 'down');
      room.update(0);
      try {
        await renderer.compileAsync(room.scene, room.camera);
      } catch {
        /* compiled on the first frame instead */
      }
      shell.act('enterRoom');
      shell.setIndoor(true);
      hud.setRoom(nameOf(room.room));
      story.event('room-entered', { room: id });
      await nextFrame();
      await nextFrame();
      const placeName = nameOf(room.room);
      say(ctx.fmt('int.aria.enter', { place: placeName }));
      // a small line on entering: the room says hello, or tells you the resident is out (FR/EN; never the same line twice in a row)
      const c = room.room.resident;
      if (c && !isHome(c.id, W.phase) && ctx.tx['int.out.' + id]) hud.showToast(ctx.tx['int.out.' + id], 4);
      else {
        const k = pickLine(ambientKeys(ctx.tx, id), lastLines[id], rng());
        if (k) {
          lastLines[id] = k;
          hud.showToast(ctx.tx[k], 4);
        }
      }
      await fadeTo(false, o.instant);
      return true;
    } catch (e) {
      console.error('interior: ' + (e && e.message));
      if (cur) disposeRoom();
      hud.showToast(ctx.tx['int.err'], 3);
      await fadeTo(false, true);
      return false;
    } finally {
      busy = false;
      input.frozen = false;
    }
  }
  function disposeRoom() {
    const c = cur;
    cur = null;
    if (c.post) c.post.dispose();
    c.room.dispose();
  }
  async function leave(o = {}) {
    if (!cur || busy) return false;
    busy = true;
    input.frozen = true;
    input.reset();
    const room = cur.room.room;
    try {
      await fadeTo(true, o.instant);
      const b = buildingOf(room.id);
      disposeRoom();
      shell.act('leaveRoom');
      shell.setIndoor(false);
      hud.setRoom(null);
      const dp = doorPoint(b);
      walk.teleport(dp.x, dp.z);
      walk.pl.face = awayFrom(b);
      input.zoomGoal = zoomSaved;
      rig.snap();
      await nextFrame();
      await nextFrame();
      say(ctx.tx['int.aria.leave']);
      await fadeTo(false, o.instant);
      return true;
    } catch (e) {
      console.error('interior: ' + (e && e.message));
      hud.setRoom(null);
      await fadeTo(false, true);
      return false;
    } finally {
      busy = false;
      input.frozen = false;
    }
  }

  async function sleep(target) {
    if (!cur || cur.id !== 'cabin' || busy || (target !== 'dawn' && target !== 'dusk')) return null;
    busy = true;
    input.frozen = true;
    input.reset();
    const before = game.getState().world;
    try {
      await fadeTo(true);
      const w0 = game.exportWorld();
      const plan = sleepPlan({ clock: w0.clock, weather: w0.weather, config: ctx.data.config, weatherList: ctx.data.weatherList, target, rng: rngSleep });
      const s = game.getState();
      game.loadSave({ book: s.book, pity: s.pity, clock: plan.clock, weather: plan.weather });
      refreshLook();
      lastSleep = { target, before: { day: before.day, frac: before.dayFrac, weather: before.weather }, after: { day: plan.clock.day, frac: plan.clock.dayFrac, weather: plan.weather.id, phase: plan.phase }, slept: plan.slept };
      shell.scheduleSave();
      await wait(ctx.reduced ? 80 : 420);
      await fadeTo(false);
      line(ctx.tx['int.sleep.done.' + target], 5);
      return lastSleep;
    } finally {
      busy = false;
      input.frozen = false;
    }
  }

  // ---- what the action key does
  function useTarget(t) {
    if (!cur || busy) return;
    if (t.kind === 'exit') {
      leave();
      return;
    }
    if (t.kind === 'talk') {
      shell.openDialogue(t.char);
      return;
    }
    const a = actionOf(t.id);
    if (!a) return;
    const facts = roomFacts(eco.get(), chal.get()); // (app/roomFacts.js: every rod of the shop, not 3)
    switch (a.do) {
      case 'sleep':
        shell.openDialogue('bed');
        break;
      case 'letters':
        shell.openLetters();
        break;
      case 'lullaby':
        shell.openDialogue('seat');
        break;
      case 'book':
        shell.act('book');
        break;
      case 'counter':
        shell.openDialogue('ondine');
        break;
      case 'repair':
        shell.openRepair('workshop');
        break;
      case 'rods':
        if (facts.worn) shell.openRepair('cabin');
        else line(ctx.tx[lineKey(t.id, facts)]);
        break;
      default:
        line(ctx.tx[lineKey(t.id, facts)]);
    }
  }
  function walkTo(x, z) {
    const c = cur;
    if (!c) return false;
    const p = snap(c.nav, x, z, 1.5);
    if (!p) return false;
    const r = findPath(c.nav, [c.pl.x, c.pl.z], p);
    if (!r) return false;
    c.route = r.slice();
    c.goal = p;
    return true;
  }
  /** A click or tap in the room (cx, cy in the picture box): on a person or an object = go there and use it; on the door = leave; on the floor = walk there. */
  function tap(cx, cy) {
    const c = cur;
    if (!c || busy) return;
    const vs = viewSize();
    // a person or the cat first (within 48 px of the sprite's body)
    const phase = game.getState().world.phase;
    const r = c.room.room;
    const px = (x, z, y = 0.9) => {
      tagV.set(x, y, z).project(c.room.camera);
      return [((tagV.x + 1) / 2) * vs.w, ((1 - tagV.y) / 2) * vs.h];
    };
    let tgt = null;
    let best = 48;
    const who = [...residentsOf(r, phase), ...(catTarget(r, walk.cat) ? [catTarget(r, walk.cat)] : []), ...(r.shopkeeper ? [{ id: 'shop.counter', x: r.shopkeeper.x, z: r.shopkeeper.z, resident: true }] : [])];
    for (const w of who) {
      const [sx, sy] = px(w.x, w.z);
      const d = Math.hypot(sx - cx, sy - cy);
      if (d < best) [best, tgt] = [d, w];
    }
    if (tgt && tgt.id === 'shop.counter') tgt = r.interactables.find((it) => it.id === 'shop.counter') || null;
    if (!tgt) {
      ndc.set((cx / vs.w) * 2 - 1, -(cy / vs.h) * 2 + 1);
      ray.setFromCamera(ndc, c.room.camera);
      const hits = ray.intersectObject(c.room.root, true);
      const hit = hits.find((h) => ['pieces', 'floor', 'walls', 'trims'].includes(h.object.name));
      if (!hit) return;
      const hx = hit.point.x;
      const hz = hit.point.z;
      const name = hit.object.name;
      // the door itself: a click on its frame or leaf
      if ((name === 'trims' || name === 'walls') && hz < 0.35 && Math.abs(hx - r.door.x) <= r.door.w / 2 + 0.1 && hit.point.y <= r.door.h + 0.05) {
        c.openOn = { id: 'exit', kind: 'exit' };
        if (atExit(r, c.pl.x, c.pl.z)) useTarget(c.openOn), (c.openOn = null);
        else walkTo(r.door.x, 0.6);
        return;
      }
      // brief 33 (app/roomTap.js): a click on the furniture reaches the things around it; on the label shown, that thing; on the bare floor, a WALK (only a tap right
      // under an object's own spot uses it: a tap just in front of a tall piece - the carnet stand - walked nowhere and used the piece before)
      const near = c.near && c.near.kind !== 'talk' && c.near.kind !== 'exit' ? c.near : null;
      const lp = near ? px(near.x, near.z, 1.45) : null;
      const pick = roomPick({ kind: name === 'pieces' ? 'pieces' : 'floor', x: hx, z: hz }, r.interactables, { label: lp ? { id: near.id, sx: lp[0], sy: lp[1] } : null, cx, cy });
      if (pick && pick.use) tgt = pick.use;
      if (!tgt) {
        c.openOn = null;
        if (!walkTo(hx, hz)) hud.showToast(ctx.tx['r.noPath'], 1.6);
        return;
      }
    }
    if (pickUse(r, phase, c.pl.x, c.pl.z, walk.cat) === tgt || Math.hypot(c.pl.x - tgt.x, c.pl.z - tgt.z) < (tgt.r || 0.7) + 0.2) {
      c.openOn = null;
      useTarget(tgt);
      return;
    }
    if (walkTo(tgt.x, tgt.z)) c.openOn = tgt;
    else hud.showToast(ctx.tx['r.noPath'], 1.6);
  }
  /** Escape inside: the door is offered only when the angler stands near it (Escape asks nothing). Returns true when it left. */
  function escape() {
    if (!cur || busy) return false;
    if (atExit(cur.room.room, cur.pl.x, cur.pl.z)) {
      leave();
      return true;
    }
    return false;
  }

  function tagList(c) {
    const out = [];
    const vs = viewSize();
    const add = (id, text, x, y, z) => {
      if (!text) return;
      tagV.set(x, y, z).project(c.room.camera);
      if (tagV.z > 1) return;
      out.push({ id, text, x: ((tagV.x + 1) / 2) * vs.w, y: ((1 - tagV.y) / 2) * vs.h });
    };
    const r = c.room.room;
    const phase = game.getState().world.phase;
    const { x, z } = c.pl;
    add('room-door', ctx.tx['int.tag.exit'], r.door.x, r.door.h + 0.35, 0.05);
    for (const w of residentsOf(r, phase)) if (Math.hypot(w.x - x, w.z - z) < 3.5) add('r-' + w.char, ctx.tx['story.char.' + w.char], w.x, 2.0, w.z);
    if (r.shopkeeper && Math.hypot(r.shopkeeper.x - x, r.shopkeeper.z - z) < 3.5) add('r-ondine', ctx.tx['story.char.ondine'], r.shopkeeper.x, 2.0, r.shopkeeper.z);
    const near = c.near;
    if (near && near.kind !== 'talk' && near.kind !== 'exit') add('near', c.room.interactables.find((it) => it.id === near.id).label[lang()], near.x, 1.45, near.z);
    return out;
  }
  function hintFor(near) {
    const tx = ctx.tx;
    const touch = input.touchUsed;
    if (!near) return { h: tx[touch ? 'int.hint.walkTouch' : 'int.hint.walk'], kind: 'walk' };
    if (near.kind === 'exit') return { h: tx[touch ? 'int.hint.exitTouch' : 'int.hint.exit'], kind: 'near' };
    if (near.kind === 'talk') return { h: ctx.fmt(touch ? 'int.hint.talkTouch' : 'int.hint.talk', { name: tx['story.char.' + near.char] }), kind: 'near' };
    const it = cur.room.interactables.find((q) => q.id === near.id);
    const label = it ? it.label[lang()] : '';
    const a = actionOf(near.id);
    if (near.id === 'shop.counter') return { h: ctx.fmt(touch ? 'int.hint.talkTouch' : 'int.hint.talk', { name: tx['story.char.ondine'] }), kind: 'near' };
    const key = a && a.btn === 'use' ? 'use' : 'look';
    return { h: ctx.fmt(`int.hint.${key}${touch ? 'Touch' : ''}`, { what: label }), kind: 'near' };
  }

  /** Each frame while inside. Replaces the outdoor step: the clock, the shell, the HUD; the world's look and camera are left alone (the world is not drawn). */
  function step(dt, elapsed) {
    const c = cur;
    if (!c) return;
    refreshLook();
    hud.setRoom(nameOf(c.room.room)); // the name stays, in the language of the moment
    ctx.spotId = null;
    ctx.place = null;
    const st = game.getState();
    const W = st.world;
    const pl = c.pl;
    const canWalk = !busy && shell.playing();
    let [ix0, iz0] = canWalk ? input.axes() : [0, 0];
    const co = Math.cos(YAW);
    const si = Math.sin(YAW);
    let ix = ix0 * co + iz0 * si;
    let iz = -ix0 * si + iz0 * co;
    let il = Math.hypot(ix, iz);
    if (il > 0.1) {
      c.route = null;
      c.openOn = null;
    } else if (c.route && canWalk) {
      let [gx, gz] = c.route[0];
      if (Math.hypot(gx - pl.x, gz - pl.z) < 0.06) {
        c.route.shift();
        if (!c.route.length) c.route = null;
      }
      if (c.route) {
        [gx, gz] = c.route[0];
        const dd = Math.hypot(gx - pl.x, gz - pl.z) || 1;
        const k = Math.min(1, dd / (WALK_SPEED * dt));
        ix = ((gx - pl.x) / dd) * k;
        iz = ((gz - pl.z) / dd) * k;
        il = Math.hypot(ix, iz);
      } else {
        ix = 0;
        iz = 0;
        il = 0;
      }
    } else {
      ix = 0;
      iz = 0;
      il = 0;
    }
    pl.moving = canWalk && il > 0.01;
    if (pl.moving) {
      const k = Math.min(1, il) / il;
      const dx = ix * k * WALK_SPEED * dt;
      const dz = iz * k * WALK_SPEED * dt;
      if (walkingOut(c.room.room, pl.x, pl.z, dz) && !c.route) {
        leave();
      } else {
        const r = roomStep(c.nav, pl.x, pl.z, dx, dz);
        pl.x = r.x;
        pl.z = r.z;
        if (r.blocked && c.route) c.route = null;
      }
      pl.face = [ix / il, iz / il];
      pl.dir = screenDir(ix, iz, YAW);
      pl.walkT += dt * Math.min(1, il);
    } else pl.dir = screenDir(pl.face[0], pl.face[1], YAW);
    c.room.angler.place(pl.x, pl.z, pl.dir);
    let col = ANGLER_COLS.stand;
    if (pl.moving) {
      const cyc = ctx.reduced ? [1, 0, 3, 0] : WALK_CYCLE;
      col = cyc[Math.floor(pl.walkT * 7) % 4];
    } else if (!ctx.reduced && Math.floor(elapsed / 1.6) % 3 === 2) col = ANGLER_COLS.breath;
    c.room.angler.sprite.frame(col, DIR_ROW[pl.dir]);
    c.room.update(dt);
    c.near = busy ? null : pickUse(c.room.room, W.phase, pl.x, pl.z, walk.cat);
    if (canWalk && c.near && (input.pending.down || input.pending.up)) {
      const open = input.pending.down;
      input.pending.down = false;
      input.pending.up = false;
      if (open) useTarget(c.near);
    }
    if (canWalk && c.openOn) {
      const t = c.openOn;
      if (c.near && c.near.id === t.id) {
        c.openOn = null;
        useTarget(t);
      } else if (!c.route) c.openOn = null;
    }
    // the core runs for the clock and the weather only (idle: no spot, no cast)
    const events = fishing.stepCore(dt, false, (u, out) => out);
    shell.onEvents(events);
    shell.afterCore();
    shell.tick(dt);
    ctx.finale && ctx.finale.tick(dt);
    walk.stepFolk(dt, rig.yaw);
    // hint and HUD
    const nearNow = cur ? cur.near : null;
    const { h, kind } = hintFor(nearNow);
    hud.setHint(h, kind);
    hud.setAction(nearNow ? btnKey(nearNow) : 'r.fish');
    hud.update(st, dt);
    if (cur) hud.tags(tagList(cur));
    // a small line now and then (only when it is quiet)
    c.ambT -= dt;
    if (c.ambT <= 0 && !busy && shell.playing() && !hud.toastShown()) {
      c.ambT = AMBIENT_EVERY[0] + rng() * (AMBIENT_EVERY[1] - AMBIENT_EVERY[0]);
      const k = pickLine(ambientKeys(ctx.tx, c.id), lastLines[c.id], rng());
      if (k) {
        lastLines[c.id] = k;
        line(ctx.tx[k], 4);
      }
    }
  }

  return {
    get active() {
      return !!cur;
    },
    get busy() {
      return busy;
    },
    enter,
    leave,
    sleep,
    step,
    tap,
    escape,
    useTarget,
    walkTo,
    /** The loop calls this instead of drawing the world: returns true when a room was drawn. */
    draw() {
      if (!cur) return false;
      if (cur.post) cur.post.render();
      else renderer.render(cur.room.scene, cur.room.camera);
      return true;
    },
    resize() {
      if (!cur) return;
      const vs = viewSize();
      cur.room.fit(vs.w / vs.h);
      if (cur.post) cur.post.setSize(vs.w, vs.h, renderer.getPixelRatio());
    },
    retier() {
      if (cur) rebuildPost();
    },
    /** Photo mode: the room at 1920 x 1080 (the room's own camera, the room's post chain). */
    photoView() {
      if (!cur) return null;
      const c = cur;
      return {
        view: { renderer, camera: c.room.camera, canvas: view.canvas },
        tiers: { post: c.post },
        draw() {
          const vs = viewSize();
          c.room.fit(16 / 9);
          if (c.post) c.post.render();
          else renderer.render(c.room.scene, c.room.camera);
          c.room.fit(vs.w / vs.h);
        },
      };
    },
    /** The door the angler is walking toward outside: its models are fetched ahead (quietly: no visible hitch). */
    preload(id) {
      if (preloaded.has(id)) return;
      preloaded.add(id);
      // only the room's own models: an outdoor model reused inside (e.g. the cabin's log stack) is already loaded by the world
      const ids = [...new Set(ROOMS[id].props.filter((q) => q.m && INTERIOR_MODEL_FILES[q.m]).map((q) => q.m))];
      // the files only go to the HTTP cache here (a fetch costs no main-thread time): they are parsed behind the fade when the room opens, never while walking
      const go = () => {
        for (const m of ids) fetch(MODEL_BASE + (INTERIOR_MODEL_FILES[m] ? 'interior/' : '') + m + '.glb', { credentials: 'same-origin' }).catch(() => {});
      };
      if (typeof requestIdleCallback === 'function') requestIdleCallback(go, { timeout: 2000 });
      else setTimeout(go, 200);
    },
    state() {
      return cur
        ? { id: cur.id, inside: true, busy, pos: { x: cur.pl.x, z: cur.pl.z, dir: cur.pl.dir }, near: cur.near ? cur.near.id : null, name: nameOf(cur.room.room), spawn: cur.room.spawn, route: cur.route ? cur.route.length : 0, targets: pickAllTargets(), missing: cur.room.problems.missing, look: cur.lookKey, folk: cur.room.folk.map((f) => f.root.visible), cat: cur.room.cat ? cur.room.cat.root.visible : null, stats: cur.room.stats() }
        : { id: null, inside: false, busy };
    },
    camera: () => (cur ? cur.room.camera : null),
    lastSleep: () => lastSleep,
    fadeLog: () => fadeLog.slice(),
    screenOf(x, z, y = 0) {
      if (!cur) return null;
      tagV.set(x, y, z).project(cur.room.camera);
      const vs = viewSize();
      return { x: ((tagV.x + 1) / 2) * vs.w, y: ((1 - tagV.y) / 2) * vs.h };
    },
    roomOf: () => (cur ? cur.room : null),
    levels: () => lastLevels,
    setLevels: (l) => (lastLevels = l),
  };
  function pickAllTargets() {
    const W = game.getState().world;
    return [...cur.room.interactables.map((it) => ({ id: it.id, x: it.x, z: it.z })), ...residentsOf(cur.room.room, W.phase).map((w) => ({ id: w.id, x: w.x, z: w.z })), ...(catTarget(cur.room.room, walk.cat) ? [{ id: 'talk:biscotte', x: catTarget(cur.room.room, walk.cat).x, z: catTarget(cur.room.room, walk.cat).z }] : [])];
  }
}
