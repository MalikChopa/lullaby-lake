// Lullaby Lake HD-2D: wires the app modules together. start({ ctx, shell }) is the only entry (called by main.js, J9-A: the context and the shell
// - start screen, sound, save, settings, journal, photo - exist before the world; the world is joined to the shell with shell.attach()).
//   app/settings.js  URL + saved settings + the EXISTING game core      app/view.js     renderer, scene, lights, world, sprites
//   app/tiers.js     quality tiers (auto / fixed low, mid, high)         app/input.js    keyboard, mouse, touch, gamepad, buttons
//   app/hud.js       HUD, menu, tags, catch card                       app/fishing.js  core stepping + rod, float, line
//   app/walk.js      walking, tap-to-walk, cat, villagers              app/camera.js   follow, turns, shadows, lights, occluders
//   app/light.js     clock and weather light -> three.js               app/loop.js     frame loop, timing, context loss
//   app/hooks.js     window.__j7 / __j8 for the checks
// The pure maths live in logic/*.js (tested with node --test); the world is data (data/map.js).

import * as THREE from 'three';
import { WATER_Y } from './data/params.js';
import { ZONES, BUILDINGS, VILLAGERS, LAKE } from './data/map.js';
import { spotAt, castLanding, reelPoint } from './logic/spots.js';
import { lightAt } from './logic/daylight.js';
import { feetHeight, landDist } from './logic/terrain.js';
import { blockedBy } from './logic/collide.js';
import { allProps } from './logic/mapgen.js';
import { findPath } from './logic/nav.js';
import { shared } from './world/shading.js';
import { MAX_RIPPLES, MAX_LAMPS } from './world/water.js';
import { createView } from './app/view.js';
import { createTiers } from './app/tiers.js';
import { createInput } from './app/input.js';
import { createHud } from './app/hud.js';
import { createFishing } from './app/fishing.js';
import { createWalk, screenDir } from './app/walk.js';
import { createCameraRig } from './app/camera.js';
import { createLight } from './app/light.js';
import { createLoop } from './app/loop.js';
import { createHooks } from './app/hooks.js';
import { viewSize } from './app/viewport.js';
import { pause } from './world/pause.js';
import { warmChunks } from './app/warm.js';
import { CAMERA } from './data/params.js';
import { SHOP, LOOK, LANTERN } from './data/economy.js';
import { POINTS } from './data/challenge.js';
import { reachMul } from './challenge/wear.js';
import { createFightFlow } from './app/fightFlow.js';
import { betterHere, gearOf, gearMods, effectiveSpecies } from './economy/draw.js';
import { CHARACTERS, COUPLETS } from './data/story.js';
import { catSeat, dormeurLine } from './story/env.js';
import { DOCKS, DOCK_REACH } from './data/boat.js';
import { boardingDock, landingDock, boatSpotAt, edgeOf, rotOf } from './boat/boat.js';
import { createLakeLights } from './world/lakeLights.js';
import { placeName } from './logic/placeName.js';
import { createInteriorMode } from './app/interiorMode.js';
import { ROOMS } from './data/interiors.js';
import { doorPoint, doorRadius, roomOf } from './interior/actions.js';

export async function start({ ctx, shell }) {
  const { game, query } = ctx;
  const view = await createView(ctx);
  view.sky.mesh.layers.set(1);
  performance.mark('j9-view-done');
  const tiers = createTiers(ctx, view);
  tiers.rain.mesh.layers.set(1);
  const input = createInput(ctx, view);
  const hud = createHud(ctx, view, tiers);
  ctx.onTier = (name) => {
    if (tiers.rain) tiers.rain.mesh.layers.set(1);
  };
  ctx.onTier(tiers.name);
  const light = createLight(ctx, view, tiers);
  ctx.onLoad && ctx.onLoad(0.9);
  performance.mark('j9-tiers-hud-light');
  ctx.catHint = () => catSeat(ctx.story.get());
  const walk = await createWalk(ctx, view, input);
  const lakeLights = createLakeLights();
  view.scene.add(lakeLights.points);
  performance.mark('j9-walk');
  const pl = walk.pl;
  const rig = createCameraRig(ctx, view, tiers, input, walk);

  const rip = view.water.uniforms.uRipples.value;
  let rippleNext = 0;
  const ripples = {
    add(x, z, s = 1) {
      rip[rippleNext].set(x, z, 0, s);
      rippleNext = (rippleNext + 1) % MAX_RIPPLES;
    },
  };
  ctx.addRipple = (x, z, s) => ripples.add(x, z, s); // the boat's wake
  const boatShadow = view.world.deckShadows.findIndex((d) => d.boat); // the water shader's shadow slot of the boat (moved every frame)
  const fightFlow = createFightFlow(ctx, { input, ui: shell.fightUi });
  const fishing = createFishing(ctx, view, hud, input, ripples, fightFlow, (n) => shell.sfx(n));
  let castSpot = null; // the spot of the line that is out
  const boatSpotOf = () => {
    const b = boatSpotAt(pl.x, pl.z);
    const s = walk.boat.st;
    return { id: b.id, name: b.name, water: 'deep', x: pl.x, z: pl.z, r: 1, face: [Math.round(s.hx * 100) / 100, Math.round(s.hz * 100) / 100], boat: true };
  };
  const castTarget = (u, out, near) => {
    const s = castSpot || spotAt(pl.x, pl.z);
    if (!s) return out.set(pl.x, WATER_Y + 0.02, pl.z - 1);
    const [x, z] = near ? reelPoint(pl.x, pl.z, s) : castLanding(pl.x, pl.z, s, u, gearMods(ctx.eco.get()).reach * reachMul(ctx.chal.get().wear));
    return out.set(x, WATER_Y + 0.02, z);
  };
  const nearV = { x: 0, z: 0 };

  // ---- turning and tapping
  input.onTurn = (dir) => {
    if (!interior.active) rig.turn(dir); // brief 29: the diorama of a room has a fixed camera
  };
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  /** The ground point under a screen point (march along the view ray over the terrain / the water / the decks). */
  function groundPick(cx, cy) {
    const vs = viewSize();
    ndc.set((cx / vs.w) * 2 - 1, -(cy / vs.h) * 2 + 1);
    ray.setFromCamera(ndc, view.camera);
    const o = ray.ray.origin;
    const d = ray.ray.direction;
    const above = (t) => {
      const x = o.x + d.x * t;
      const z = o.z + d.z * t;
      return o.y + d.y * t - Math.max(feetHeight(x, z), WATER_Y);
    };
    let a = 0;
    for (let t = 0.5; t < 220; t += 0.5) {
      if (above(t) <= 0) {
        let lo = a;
        let hi = t;
        for (let i = 0; i < 20; i++) {
          const m = (lo + hi) / 2;
          if (above(m) > 0) lo = m;
          else hi = m;
        }
        return [o.x + d.x * hi, o.z + d.z * hi];
      }
      a = t;
    }
    return null;
  }
  let openOnArrival = null; // a tap on a door / board marker walks there, then opens its panel
  const q2 = (q) => q.tapR || 2.2;
  /** The active marker with the smallest `dist(q)` below `max` (a villager standing at a door does not hide it, and the other way round). */
  const nearest = (dist, max) => {
    let best = null;
    let bd = max;
    for (const q of points) {
      if (!q.active()) continue;
      const d = dist(q);
      if (d < bd) {
        bd = d;
        best = q;
      }
    }
    return best;
  };
  input.onTap = (cx, cy) => {
    if (interior.active) {
      interior.tap(cx, cy);
      return;
    }
    if (interior.busy || game.getState().fishing.phase !== 'idle') return;
    const p = groundPick(cx, cy);
    if (!p) return;
    if (walk.boat.aboard) {
      // rowing: a tap on the water steers there (the nearest water when it is on the land); nothing else answers
      if (!walk.rowTo(p[0], p[1])) hud.showToast(ctx.tx['boat.noWater'], 1.6);
      return;
    }
    // a tap ON a character (its body on the screen, within 48 px) talks to it, whatever the ground under the tap is; else the nearest marker on the ground
    let pt = null;
    let bestPx = 48;
    const vs = viewSize();
    for (const q of points) {
      if (!q.sprite || !q.active()) continue;
      tagV.set(q.x, feetHeight(q.x, q.z) + 0.9, q.z).project(view.camera);
      const d = Math.hypot(cx - ((tagV.x + 1) / 2) * vs.w, cy - ((1 - tagV.y) / 2) * vs.h);
      if (tagV.z < 1 && d < bestPx) {
        bestPx = d;
        pt = q;
      }
    }
    // brief 29: a door under the finger wins when it is nearer to the tapped ground than the character (a cat sitting at a door never hides it)
    if (pt) {
      const dc = Math.hypot(p[0] - pt.x, p[1] - pt.z);
      const dr = nearest((q) => (q.door ? Math.hypot(p[0] - q.x, p[1] - q.z) : Infinity), Math.min(q2(pt), dc));
      if (dr) pt = dr;
    }
    if (!pt) pt = nearest((q) => {
      const d = Math.hypot(p[0] - q.x, p[1] - q.z);
      return d < (q.tapR || 2.2) ? d : Infinity; // doors and the board: 2.2 m; a walking character or a prop of the cabin: only a tap right on it (a tap near it still walks)
    }, Infinity);
    if (pt) {
      if (Math.hypot(pl.x - pt.x, pl.z - pt.z) < pt.r) {
        pt.open();
        return;
      }
      if (walk.walkTo(pt.x, pt.z)) {
        openOnArrival = pt;
        return;
      }
    }
    openOnArrival = null;
    if (!walk.walkTo(p[0], p[1])) hud.showToast(ctx.tx['r.noPath'], 1.6);
  };
  // keyboard label of the turn keys (the physical Q / E keys: A / E on AZERTY), read from the layout when the browser tells it
  let turnKeys = ctx.lang === 'fr' ? 'A / E' : 'Q / E';
  try {
    if (navigator.keyboard && navigator.keyboard.getLayoutMap) navigator.keyboard.getLayoutMap().then((m) => (turnKeys = (m.get('KeyQ') || 'q').toUpperCase() + ' / ' + (m.get('KeyE') || 'e').toUpperCase())).catch(() => {});
  } catch {
    /* no layout map: the default label stays */
  }

  // ---- name tags: villagers, the Boutique and the Atelier doors, the islet
  const tagV = new THREE.Vector3();
  // brief 29: every building has a door marker (a name tag near the door, an interaction radius); the door leads inside (the panels open from the counter and the bench)
  const doors = BUILDINGS.map((b) => {
    const p = doorPoint(b);
    return { id: b.id, key: b.type === 'shop' ? 'r.shop' : b.type === 'workshop' ? 'r.workshop' : 'int.tag.' + b.id, x: p.x, z: p.z, y: b.type === 'shop' || b.type === 'workshop' ? 3.2 : 2.7 };
  });
  doors.push({ id: 'board', key: 'r.board', x: POINTS.board.x, z: POINTS.board.z, y: 2.6 });
  const shopDoor = doors.find((d) => d.id === SHOP.doorBuilding);
  const workDoor = doors.find((d) => d.id === 'workshop');
  // the places where the action key does something: the seven doors (each leads into its room), the notice board
  const doorMark = (b) => {
    const p = doorPoint(b);
    return {
      id: b.id,
      door: true,
      x: p.x,
      z: p.z,
      r: b.type === 'shop' ? SHOP.useDistance : b.type === 'workshop' ? POINTS.workshopR : b.type === 'cabin' ? POINTS.cabinR : doorRadius(b),
      // a tap on the ground answers a house or the cabin only right at its doorstep: the village paths run past those doors, walking there must never go inside by accident
      tapR: b.type === 'house' || b.type === 'cabin' ? 1.0 : undefined,
      text: (touch) => ctx.fmt(touch ? 'int.door.touch' : 'int.door.enter', { place: ctx.tx['int.room.' + roomOf(b.id)] }),
      btn: 'int.btn.enter',
      active: () => true,
      open: () => interior.enter(b.id),
    };
  };
  const points = [
    doorMark(BUILDINGS.find((b) => b.id === SHOP.doorBuilding)),
    doorMark(BUILDINGS.find((b) => b.type === 'workshop')),
    { id: 'board', x: POINTS.board.x, z: POINTS.board.z, r: POINTS.board.useDistance, hint: 'r.boardDoor', touch: 'r.boardDoorTouch', btn: 'r.boardBtn', active: () => true, open: () => shell.openQuests('board') },
    doorMark(BUILDINGS.find((b) => b.type === 'cabin')),
    ...BUILDINGS.filter((b) => b.type === 'house').map(doorMark),
  ];
  // the desk and the window seat of the cabin moved inside: the crate and the bench outside are plain props again (no duplicate interaction); data/story.js CABIN_POINTS stays as data (the clear zone of the decor)
  // J12-A: talking to Mme Ondine, Capitaine Roseau, Pomme and the cat (they walk: their marker follows them), and the two places of the cabin (the desk with the letters, the window seat)
  const villagerState = (char) => walk.wanderers[VILLAGERS.findIndex((v) => v.id === CHARACTERS[char].villager)].state;
  for (const char of ['ondine', 'roseau', 'pomme', 'biscotte']) {
    const pos = char === 'biscotte' ? () => walk.cat : () => villagerState(char);
    const nm = () => ctx.tx['story.char.' + char];
    points.push({
      id: 'talk:' + char,
      get x() {
        return pos().x;
      },
      get z() {
        return pos().z;
      },
      r: CHARACTERS[char].talkR,
      tapR: 1.1,
      sprite: true,
      text: (touch) => ctx.fmt(touch ? 'story.talkTouch' : 'story.talk', { name: nm() }),
      btn: 'story.talkBtn',
      active: () => true,
      open: () => shell.openDialogue(char),
    });
  }
  // J12-B: climbing into the boat (at the dock where it lies) and stepping off (at the dock it is close to)
  const dockName = (id) => DOCKS[id].name[ctx.lang];
  const flagsNow = () => ctx.story.get().flags;
  points.push({
    id: 'boat-board',
    get x() {
      return DOCKS[ctx.boat.get().at].stand[0];
    },
    get z() {
      return DOCKS[ctx.boat.get().at].stand[1];
    },
    get r() {
      return DOCKS[ctx.boat.get().at].r;
    },
    onSpot: true,
    text: (touch) => ctx.tx[touch ? 'boat.boardTouch' : 'boat.board'],
    btn: 'boat.boardBtn',
    active: () => !walk.boat.aboard && !!boardingDock(ctx.boat.get(), pl.x, pl.z, flagsNow()),
    open: () => {
      if (walk.board()) shell.announcer.say(ctx.tx['boat.aria.on']);
    },
  });
  points.push({
    id: 'boat-land',
    get x() {
      const d = landingDock(walk.boat.st, flagsNow());
      return d ? DOCKS[d].boat[0] : walk.boat.st.x;
    },
    get z() {
      const d = landingDock(walk.boat.st, flagsNow());
      return d ? DOCKS[d].boat[1] : walk.boat.st.z;
    },
    r: DOCK_REACH + 0.05,
    onSpot: true,
    text: (touch) => ctx.fmt(touch ? 'boat.landTouch' : 'boat.land', { dock: dockName(landingDock(walk.boat.st, flagsNow()) || 'landing') }),
    btn: 'boat.landBtn',
    active: () => walk.boat.aboard && !!landingDock(walk.boat.st, flagsNow()),
    open: () => {
      const d = landingDock(walk.boat.st, flagsNow());
      if (walk.disembark(d)) shell.announcer.say(ctx.fmt('boat.aria.off', { dock: dockName(d) }));
    },
  });
  for (const p of points) {
    if (p.id.startsWith('boat-')) continue;
    const a = p.active;
    p.active = () => !walk.boat.aboard && a(); // J12-B: on the boat only the boat's own markers answer
  }
  let noteKey = '';
  let noteText = '';
  /** A gentle line about the gear at a fishing spot: nothing bites with this gear here, or a better rod / bait would help (never a block). */
  function gearNote(s) {
    const key = s.id + '|' + ctx.eco.rev() + '|' + ctx.lang;
    if (key !== noteKey) {
      noteKey = key;
      const g = gearOf(ctx.eco.get(), s.water);
      if (effectiveSpecies(ctx.data.species, g).length === 0) noteText = ctx.tx['eco.hint.nothing'];
      else {
        const b = betterHere(ctx.data.species, g);
        noteText = b ? ctx.tx['eco.hint.' + b] : '';
      }
    }
    return noteText;
  }
  function tagList() {
    const out = [];
    const vs = viewSize();
    const add = (id, text, x, y, z, cls) => {
      tagV.set(x, y, z).project(view.camera);
      if (tagV.z > 1) return;
      out.push({ id, text, cls, x: ((tagV.x + 1) / 2) * vs.w, y: ((1 - tagV.y) / 2) * vs.h });
    };
    // Le Dormeur: a floating poetic line over the water near the place of the current couplet, at dusk and at night (a new line each time you come back, never the same twice in a row)
    const dl = dormeurLine(ctx.story.get(), lastWorld, pl, dormeurLast, (Math.sin(performance.now() * 0.001) + 1) / 2 * 0.999);
    if (dl) {
      if (!dormeurNow) dormeurNow = dl; // the line chosen when the player comes near stays until the player leaves
      add('dormeur', ctx.tx['story.dormeur.tag'] + ' ' + ctx.tx[dormeurNow.key], dl.x, 1.6, dl.z, 'dormeur');
    } else if (dormeurNow) {
      dormeurLast = dormeurNow.id;
      dormeurNow = null;
    }
    walk.wanderers.forEach((w, i) => {
      const s = w.state;
      if (Math.hypot(s.x - pl.x, s.z - pl.z) < 4) add('v' + i, VILLAGERS[i].name[ctx.lang], s.x, feetHeight(s.x, s.z) + 2.3, s.z);
    });
    for (const d of doors) if (Math.hypot(d.x - pl.x, d.z - pl.z) < 5) add(d.id, ctx.tx[d.key], d.x, feetHeight(d.x, d.z) + d.y, d.z);
    const I = LAKE.islet;
    if (Math.hypot(I.x - pl.x, I.z - pl.z) < 20) add('islet', ctx.tx[ctx.story.flag('islet.open') ? 'r.isletOpen' : 'r.islet'], I.x, 5.5, I.z);
    const mb = ctx.boat.get();
    if (mb.owned && !walk.boat.aboard) {
      const at = DOCKS[mb.at];
      if (Math.hypot(at.boat[0] - pl.x, at.boat[1] - pl.z) < 6) add('boat', ctx.tx['boat.tag'], at.boat[0], 1.5, at.boat[1]);
    }
    return out;
  }

  const interior = createInteriorMode(ctx, { view, tiers, input, hud, walk, rig, fishing, shell });
  ctx.interior = interior;
  let finaleCam = false; // the finale scene moved the camera (put back when it ends)
  let lastWorld = game.getState().world;
  let lastSpotSeen = null;
  let dormeurLast = null; // the id of the last floating line of Le Dormeur (never twice in a row)
  let dormeurNow = null;
  const HOME_VIEW = { target: [-1, 1.3, -2], zoom: 25, pitch: 24, yaw: 0.55 }; // behind the start screen: the lake and the pier, a slow sway (a still view in reduced motion)
  let wasHome = shell.screen() === 'home';
  if (wasHome) {
    rig.override = HOME_VIEW.target;
    rig.zoom = HOME_VIEW.zoom;
    rig.pitchGoal = HOME_VIEW.pitch;
    rig.yawBias = HOME_VIEW.yaw;
    input.zoomGoal = HOME_VIEW.zoom;
  }
  function step(dt, elapsed) {
    input.pollPad();
    if (interior.active) {
      interior.step(dt, elapsed); // the room: the clock, the shell and the HUD keep going, the world is not drawn
      return;
    }
    // ---- fishing core (the button counts only on a spot, or while a line is out)
    const before = game.getState().fishing.phase;
    // J12-B: on the boat the spot is the named deep spot under it, facing where the bow points
    const spot = walk.boat.aboard ? (before === 'idle' || !castSpot ? boatSpotOf() : castSpot) : spotAt(pl.x, pl.z);
    if (before === 'idle') castSpot = spot;
    ctx.place = castSpot ? castSpot.water : null; // the water-zone tag the core draws for (the species feed reads it)
    ctx.spotId = castSpot ? castSpot.id : null; // J12-A: the dream fish bite at some spots only
    if (spot && spot.id !== lastSpotSeen) ctx.story.event('spot-entered', { spot: spot.id });
    lastSpotSeen = spot ? spot.id : null;
    // a door / board: the action key / the touch button / a tap on the marker opens its panel (not on a fishing spot, not with a line out, not in a fight)
    const near = before === 'idle' && !interior.busy ? nearest((q) => (spot && !q.onSpot ? Infinity : Math.hypot(pl.x - q.x, pl.z - q.z) < q.r ? Math.hypot(pl.x - q.x, pl.z - q.z) : Infinity), Infinity) : null;
    if (near && (input.pending.down || input.pending.up)) {
      const open = input.pending.down;
      input.pending.down = false;
      input.pending.up = false;
      if (open) near.open();
    }
    for (const b of BUILDINGS) {
      const dp = doorPoint(b);
      if (Math.hypot(pl.x - dp.x, pl.z - dp.z) < 9) interior.preload(roomOf(b.id)); // the room's models are fetched when the door is near
    }
    if (openOnArrival) {
      if (near === openOnArrival) {
        const pt = openOnArrival;
        openOnArrival = null;
        pt.open();
      } else if (!pl.route || pl.route.length === 0) openOnArrival = null;
    }
    const events = fishing.stepCore(dt, !!spot, castTarget);
    shell.onEvents(events);
    shell.afterCore();
    shell.tick(dt);
    if (spot && shell.playing()) shell.hint('cast', 'r.first.cast'); // shown once per save
    const st = game.getState();
    const F = st.fishing;
    if (F.phase !== 'idle' && castSpot) {
      pl.face = castSpot.face.slice();
      walk.cancelRoute();
    }
    // ---- walking (not while a line is out), cat, villagers
    const fy = walk.step(dt, elapsed, F.phase, rig.yaw);
    if (F.phase !== 'idle' && castSpot) pl.dir = screenDir(castSpot.face[0], castSpot.face[1], rig.yaw);
    // ---- rod, float, line, bubble
    const fs = castSpot || spot;
    if (fs) {
      const [rx, rz] = reelPoint(pl.x, pl.z, fs);
      nearV.x = rx;
      nearV.z = rz;
    }
    const face = fs ? fs.face : pl.face;
    const eq = ctx.eco.get().equipped;
    const fk = eq.float || 'none';
    fishing.draw(dt, elapsed, { x: pl.x, y: fy, z: pl.z, ax: face[0], az: face[1], showRod: F.phase !== 'idle' || !!spot, rodLen: LOOK.rodLen[eq.rod - 1], rodColor: LOOK.rodColors[eq.rod - 1], floatStyle: { key: fk, ...LOOK.floats[fk] } }, nearV);
    for (const r of rip) r.z += dt;

    // ---- HUD
    const tx = ctx.tx;
    let h;
    let hk = 'near'; // the kind of line, for the HUD's context hint (shell/ui/hintState.js): it shows only when useful, then fades
    if (fightFlow.active) {
      h = tx['chal.fight.help'];
      hk = 'urgent';
    } else if (F.phase === 'bite') {
      h = st.holdS == null ? tx['hud.biteForever'] : tx['hud.biteTimed'];
      hk = 'urgent';
    } else if (F.phase === 'waiting') {
      h = tx['r.waiting'];
      hk = 'phase';
    } else if (F.phase === 'reeling') {
      h = tx['r.reeling'];
      hk = 'phase';
    } else if (F.phase === 'caught') {
      h = tx['r.release'];
      hk = 'phase';
    } else if (F.phase === 'charging' || F.phase === 'casting') {
      h = tx['hud.hintIdle'];
      hk = 'phase';
    } else if (near) h = near.text ? near.text(input.touchUsed) : input.touchUsed ? tx[near.touch] : tx[near.hint];
    else if (spot) {
      h = ctx.fmt(input.touchUsed ? 'r.castTouch' : 'r.cast', { spot: placeName(spot, ctx.lang), water: tx['eco.zone.' + spot.water] });
      hk = 'spot';
      const note = gearNote(spot);
      if (note) h += ' · ' + note;
      if (walk.boat.aboard) h += ' · ' + tx[input.touchUsed ? 'boat.rowTouch' : 'boat.row'];
    } else {
      h = (input.touchUsed ? tx['r.walkTouch'] : ctx.fmt('r.walk', { turn: turnKeys })) + ' · ' + tx['r.toSpot'];
      hk = 'walk';
    }
    hud.setHint(h, hk);
    hud.setAction(near ? near.btn : 'r.fish');
    hud.update(st, dt);
    hud.setZone(ZONES.find((z) => Math.hypot(pl.x - z.x, pl.z - z.z) < z.r) || null);
    hud.tags(tagList());
    lastWorld = st.world;

    // ---- J12-B: the boat's hints (once per save), the finale scene, the soft lights of the lake, the boat's shadow on the water
    if (shell.playing() && !walk.boat.aboard) {
      const dl = Math.hypot(pl.x - DOCKS.landing.stand[0], pl.z - DOCKS.landing.stand[1]);
      if (dl < 7 && !ctx.boat.get().owned && ctx.story.get().step < 6) shell.hint('boatSeen', 'boat.first');
      if (dl < 9 && ctx.boat.get().owned) shell.hint('boatReady', 'boat.ready.hint');
    }
    const fin = ctx.finale;
    fin.tick(dt);
    if (fin.active) {
      rig.override = fin.camera();
      input.zoomGoal = 24;
      rig.pitchGoal = 32;
      rig.drift = ctx.reduced ? 0 : 0.35 * Math.sin(fin.t * 0.07);
      finaleCam = true;
    } else if (finaleCam) {
      finaleCam = false;
      rig.override = null;
      input.zoomGoal = CAMERA.distance;
      rig.pitchGoal = CAMERA.pitchDeg;
      rig.drift = 0;
    }
    lakeLights.update(elapsed, ctx.story.get().couplets, { lit: fin.active ? fin.lit() : null, bloom: fin.bloom, reduced: ctx.reduced, low: tiers.name === 'low', afterFinale: ctx.story.flag('finale.done') });
    if (boatShadow >= 0) {
      const bs = walk.boat.aboard ? walk.boat.st : DOCKS[ctx.boat.get().at];
      const bx = walk.boat.aboard ? bs.x : bs.boat[0];
      const bz = walk.boat.aboard ? bs.z : bs.boat[1];
      const hx = walk.boat.aboard ? bs.hx : bs.heading[0];
      const hz = walk.boat.aboard ? bs.hz : bs.heading[1];
      const ex = Math.abs(hx) * 1.6 + Math.abs(hz) * 0.62;
      const ez = Math.abs(hz) * 1.6 + Math.abs(hx) * 0.62;
      view.water.uniforms.uShadows.value[boatShadow].set(bx - ex, bz - ez, bx + ex, bz + ez);
    }

    // ---- light (from the clock and the weather mix), wind, water, rain
    const W = st.world;
    light.apply(lightAt(W.dayFrac, W.mix, ctx.data.config, ctx.data.skyData), dt, elapsed);
    const L = light.last;
    shared.uTime.value = elapsed;
    shared.uWind.value = ctx.reduced ? 0 : 1 + 0.8 * L.rain;
    view.water.uniforms.uTime.value = elapsed;
    view.water.uniforms.uWave.value = ctx.reduced ? 0 : 1;
    const rain = tiers.rain;
    rain.uniforms.uTime.value = elapsed;
    rain.uniforms.uAmount.value = L.rain;
    rain.mesh.visible = L.rain > 0.02;

    // ---- camera, shadows, lights, occluders (behind the start screen the view sways slowly; reduced motion = still)
    const atHome = shell.screen() === 'home';
    if (atHome !== wasHome) {
      wasHome = atHome;
      rig.override = atHome ? HOME_VIEW.target : null;
      input.zoomGoal = atHome ? HOME_VIEW.zoom : CAMERA.distance; // the start screen shows the cabin and the pier in a soft 3/4 view; the game starts at the usual view
      rig.pitchGoal = atHome ? HOME_VIEW.pitch : CAMERA.pitchDeg;
      rig.yawBias = atHome ? HOME_VIEW.yaw : 0;
    }
    rig.drift = atHome && !ctx.reduced ? 0.4 * Math.sin(elapsed * 0.09) : 0;
    const ecoNow = ctx.eco.get();
    rig.carried = ecoNow.equipped.lantern && ecoNow.gear.lantern ? { x: pl.x, y: fy + 1.3, z: pl.z, k: LANTERN.light } : null;
    rig.step(dt, fy, L);
    const lamps = view.water.uniforms.uLamps.value;
    for (let i = 0; i < MAX_LAMPS; i++) {
      const e = rig.lightsOn[i];
      if (e && e.s.kind !== 'window' && landDist(e.s.x, e.s.z) < 4) lamps[i].set(e.s.x, e.s.y, e.s.z, e.k);
      else lamps[i].set(0, -100, 0, 0);
    }
    view.dust.step(dt);
  }

  const loop = createLoop(ctx, view, tiers, {
    step,
    drawRoom: () => interior.draw(),
    onResize: () => interior.resize(),
    debugLines: () => [`pos ${pl.x.toFixed(2)} ${pl.z.toFixed(2)}  ${game.getState().fishing.phase}  frac ${lastWorld.dayFrac.toFixed(3)}  yaw ${Math.round((rig.yaw * 180) / Math.PI)}`],
  });
  // the saved place comes back (not in debug runs, not with ?at=)
  const sw = shell.saved().world;
  if (sw && !ctx.debug && !query.get('at')) walk.teleport(sw.x, sw.z, sw.dir);
  rig.snap();
  // compile the shaders in parallel (KHR_parallel_shader_compile when the browser has it) before the first frame: shorter freeze
  try {
    rig.step(0, feetHeight(pl.x, pl.z), lightAt(lastWorld.dayFrac, lastWorld.mix, ctx.data.config, ctx.data.skyData));
    await view.renderer.compileAsync(view.scene, view.camera);
  } catch {
    /* older three.js path: compiled on the first frame */
  }
  // upload the textures one by one (each in its own task) instead of all inside the first frame
  try {
    const seen = new Set();
    const add = (t) => t && t.isTexture && !t.isRenderTargetTexture && seen.add(t);
    view.scene.traverse((o) => {
      for (const m of o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : []) {
        add(m.map);
        if (m.uniforms) for (const u of Object.values(m.uniforms)) add(u && u.value);
      }
    });
    add(view.fieldTex);
    for (const t of seen) {
      view.renderer.initTexture(t);
      await pause();
    }
  } catch {
    /* uploaded by the first frame instead */
  }
  performance.mark('j9-textures');
  if (!query.get('nowarm')) await warmChunks(view); // J9-C: the chunks' geometry goes to the GPU here, not while walking
  performance.mark('j9-compiled');
  ctx.onLoad && ctx.onLoad(1);
  loop.start();

  const hooks = createHooks(ctx, {
    view,
    tiers,
    loop,
    hud,
    light,
    state: () => ({
      pos: { x: pl.x, z: pl.z, dir: pl.dir, blocked: pl.lastBlocked },
      spot: (spotAt(pl.x, pl.z) || {}).id || null,
      zone: hud.zone ? hud.zone.id : null,
      yaw: Math.round((rig.yaw * 180) / Math.PI),
      route: pl.route ? pl.route.length : 0,
      navReady: !!walk.nav,
      inCollider: blockedBy(pl.x, pl.z, walk.world) !== null,
      cat: { x: walk.cat.x, z: walk.cat.z, mode: walk.cat.mode },
      tags: hud.tagTexts(),
      shopDoor: shopDoor ? { x: shopDoor.x, z: shopDoor.z } : null,
      workDoor: { x: workDoor.x, z: workDoor.z },
      board: { x: POINTS.board.x, z: POINTS.board.z },
      cabinDoor: { x: points.find((q) => q.id === 'cabin').x, z: points.find((q) => q.id === 'cabin').z },
      doors: Object.fromEntries(points.filter((q) => q.door).map((q) => [q.id, { x: q.x, z: q.z, r: q.r }])),
      place: ctx.place,
      aboard: walk.boat.aboard,
    }),
    teleport(x, z, dir = 'up') {
      walk.teleport(x, z, dir);
      rig.snap();
    },
    extra: {
      faded: () => [...rig.faded],
      world: () => ({ props: allProps().length, chunks: view.world.chunks.length, occluders: view.world.occluders.length - 1, lights: view.world.lights.length, counts: view.world.counts }),
      villagers: () => walk.wanderers.map((w, i) => ({ id: VILLAGERS[i].id, x: w.state.x, z: w.state.z, moving: w.state.moving })),
      lightsOn: () => rig.lightsOn.map((e) => e.s.kind),
    },
    debugExtra: {
      walkTo: (x, z) => walk.walkTo(x, z),
      /** Plans a path (no walking): the points, for the keyboard tour of the checks. */
      plan: (x, z, raw = false) => {
        if (!walk.nav) return null;
        const r = findPath(walk.nav, pl.x, pl.z, x, z, { snap: 3 });
        return r.found ? (raw ? r.raw : r.pts) : null;
      },
      /** Screen position (CSS px) of a world point on the ground (for emulated taps). */
      screenOf(x, z) {
        const v = new THREE.Vector3(x, feetHeight(x, z), z).project(view.camera);
        const vs = viewSize();
        return { x: ((v.x + 1) / 2) * vs.w, y: ((1 - v.y) / 2) * vs.h };
      },
      pick: (cx, cy) => groundPick(cx, cy),
      turn: (dir) => rig.turn(dir),
      setZoom: (d) => {
        input.zoomGoal = d;
      },
    },
  });
  window.__j8 = hooks;
  // J12-B: read-only state of the boat, the lights and the finale for the checks; the mutators only with ?debug=1
  window.__j14 = {
    state: () => {
      const b = walk.boat;
      return {
        aboard: b.aboard,
        owned: ctx.boat.get().owned,
        at: ctx.boat.get().at,
        pos: { x: pl.x, z: pl.z },
        heading: [b.st.hx, b.st.hz],
        speed: b.st.v,
        edge: edgeOf(pl.x, pl.z),
        dock: b.aboard ? landingDock(b.st, ctx.story.get().flags) : null,
        boardable: !b.aboard ? boardingDock(ctx.boat.get(), pl.x, pl.z, ctx.story.get().flags) : null,
        spot: castSpot ? castSpot.id : null,
        place: ctx.place,
        finale: { active: ctx.finale.active, t: ctx.finale.t, lit: ctx.finale.lit(), bloom: ctx.finale.bloom, runs: ctx.finale.runs },
        lights: { count: lakeLights.count(), visible: lakeLights.points.visible },
        model: { roll: b.model.group.rotation.x, bobY: b.model.group.position.y, x: b.model.group.position.x, z: b.model.group.position.z, rot: b.model.group.rotation.y, lantern: b.model.group.children.some((c) => c.geometry && c.geometry.type === 'SphereGeometry' && c.visible) },
        onIslet: Math.hypot(pl.x - LAKE.islet.x, pl.z - LAKE.islet.z) < LAKE.islet.r,
        camTarget: rig.override ? rig.override.slice() : null,
        render: view.renderer.info.render.calls,
        bites: ctx.speciesFeed().map((s) => s.id),
        tier: tiers.name,
      };
    },
    edgeOf,
    rotOf,
  };
  if (ctx.debug) {
    Object.assign(window.__j14, {
      board: () => walk.board(),
      disembark: (id) => walk.disembark(id),
      /** Puts the angler in the boat at the dock where it lies (debug: no need to walk to it). */
      boat: (at) => {
        ctx.boat.own();
        ctx.story.setFlag('boat.ready', true);
        if (at) ctx.boat.moor(at);
        const d = DOCKS[ctx.boat.get().at];
        walk.teleport(d.stand[0], d.stand[1]);
        return walk.board();
      },
      rowTo: (x, z) => walk.rowTo(x, z),
      place: (x, z) => {
        walk.boat.st = { ...walk.boat.st, x, z, v: 0 };
        pl.x = x;
        pl.z = z;
        rig.snap();
      },
      finale: () => shell.openDialogue('finale'),
      jump: (n) => ctx.story.jumpTo(n),
    });
  }
  shell.attach({ view, tiers, input, hud, loop, walk, rig, fightFlow, interior });
  shell.finishSkip();
  // brief 33: read-only helpers of the accessibility / phone checks (tools/check-j19.mjs): where the bobber is on the screen (the HUD must never cover it)
  window.__j19 = Object.assign(window.__j19 || {}, {
    ready: true,
    floatScreen: () => {
      const f = view.float && view.float.root;
      if (!f || !f.visible || interior.active) return { visible: false };
      tagV.copy(f.position).project(view.camera);
      const vs = viewSize();
      return { visible: tagV.z < 1, x: ((tagV.x + 1) / 2) * vs.w, y: ((1 - tagV.y) / 2) * vs.h };
    },
  });
  // brief 29: the room helpers for the checks (read-only state; the mutators only with ?debug=1) and ?debug=1&room=<id> (&phase=... &weather=... as for the world)
  window.__j18 = {
    ready: true,
    state: () => interior.state(),
    fades: () => interior.fadeLog(),
    lastSleep: () => interior.lastSleep(),
    levels: () => interior.levels(),
  };
  if (ctx.debug) {
    Object.assign(window.__j18, {
      enter: (id, o) => interior.enter(id, o),
      leave: (o) => interior.leave(o),
      sleep: (t) => interior.sleep(t),
      walkTo: (x, z) => interior.walkTo(x, z),
      screenOf: (x, z, y) => interior.screenOf(x, z, y),
      useNow: () => {
        const st = interior.state();
        const r = ROOMS[st.id];
        const t = st.near === 'exit' ? { id: 'exit', kind: 'exit' } : r.interactables.find((q) => q.id === st.near);
        if (t) interior.useTarget(t);
        return !!t;
      },
      place: (x, z) => {
        const s = interior.roomOf();
        if (!s) return false;
        s.angler.place(x, z);
        return true;
      },
    });
    const q = query.get('room');
    if (q && ROOMS[q] && shell.started()) interior.enter(q, { instant: true, force: true });
  }
}
