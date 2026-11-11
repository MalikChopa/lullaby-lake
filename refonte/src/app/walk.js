// Walking glue: the angler (keyboard / stick axes turned by the camera heading, or tap-to-walk along a path of the navigation grid, the
// same speed and the same collisions), the sprite frame and direction relative to the camera, footstep dust, the cat that follows
// loosely and sits by the nearest lamp, and the villagers' wander (logic/villagers.js) with their sprites.

import { LAYOUT, WALK_SPEED, CAMERA, PLAYER_RADIUS, WATER_Y } from '../data/params.js';
import { DOCKS } from '../data/boat.js';
import { rowStep, steerTo, moored, rotOf, boardingDock, landingDock, nearestDock, nearestBoatWater } from '../boat/boat.js';
import { createBoatModel } from '../world/boatModel.js';
import { VILLAGERS } from '../data/map.js';
import { feetHeight, onIslet } from '../logic/terrain.js';
import { buildWorld, move, unstick } from '../logic/collide.js';
import { buildNavAsync, findPath } from '../logic/nav.js';
import { createWanderer } from '../logic/villagers.js';
import { ANGLER_COLS, WALK_CYCLE, CAT_POSES } from '../art/sheets.js';
import { FOLK_WALK } from '../art/folk.js';
import { swayUniforms } from '../world/grass.js';

const DIR_ROW = { down: 0, up: 1, left: 2, right: 3 };
export const feetY = feetHeight;
import { pause as yieldFrame } from '../world/pause.js';

/** Screen direction (down / up / left / right) of a world vector seen from a camera at heading `yaw`. */
export function screenDir(dx, dz, yaw) {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const sx = dx * c - dz * s;
  const sz = dx * s + dz * c;
  return Math.abs(sx) > Math.abs(sz) ? (sx > 0 ? 'right' : 'left') : sz > 0 ? 'down' : 'up';
}

export async function createWalk(ctx, view, input) {
  const world = buildWorld();
  // the navigation grid is built in a few slices after the first picture (tap-to-walk waits for it)
  let nav = null;
  const navReady = (async () => {
    await yieldFrame();
    nav = await buildNavAsync(world, yieldFrame);
  })();
  const pl = { x: LAYOUT.playerStart[0], z: LAYOUT.playerStart[1], dir: 'up', walkT: 0, moving: false, lastBlocked: null, route: null, routeGoal: null, stuckT: 0, dustT: 0, face: [0, -1] };
  if (ctx.query.get('at') === 'pier') Object.assign(pl, { x: 3.0, z: -10.4, dir: 'up' });
  // J12-B (debug): ?at=landing | ?at=islet stand on that dock's shore (the islet needs the story flag, set by &couplet=7 or more)
  if (ctx.debug && (ctx.query.get('at') === 'landing' || (ctx.query.get('at') === 'islet' && ctx.story.flag('islet.open')))) Object.assign(pl, { x: DOCKS[ctx.query.get('at')].stand[0], z: DOCKS[ctx.query.get('at')].stand[1], dir: 'up' });
  // J12-B: the boat. aboard = rowing (the angler's place IS the boat's); otherwise it lies moored at ctx.boat.get().at. The model is a replaceable module (world/boatModel.js).
  const model = createBoatModel();
  view.scene.add(model.group);
  const bt = { aboard: false, st: moored('landing'), target: null, wakeT: 0, model };
  const lamps = view.world.lights.filter((l) => l.kind === 'lamp');
  const cat = { x: LAYOUT.cat.x, z: LAYOUT.cat.z, mode: 'sit', t: 0, frame: 0, walkT: 0, flip: false, path: null, repath: 0, seat: null };
  const wanderers = VILLAGERS.map((v, i) => createWanderer(v, 100 + i));
  const folkWalkT = VILLAGERS.map(() => 0);
  let catT = 0;
  let idleT = 0; // seconds the angler has stood still (the cat leads to the place of the next couplet after a few)

  const poseModel = (dt, elapsed) => {
    const owned = ctx.boat.get().owned;
    const s = bt.aboard ? bt.st : moored(ctx.boat.get().at);
    model.setPose(s.x, s.z, rotOf(s.hx, s.hz), WATER_Y);
    const eq = ctx.eco.get();
    model.setLantern(owned && eq.equipped.lantern && eq.gear.lantern && ['dusk', 'night'].includes(ctx.game.getState().world.phase));
    model.update(dt, { speed: bt.aboard ? s.v : 0, reduced: ctx.reduced });
    void elapsed;
  };

  const W = {
    pl,
    world,
    boat: bt,
    get nav() {
      return nav;
    },
    navReady,
    cat,
    wanderers,
    aim: () => [pl.x, feetY(pl.x, pl.z) + CAMERA.aimHeight, pl.z],
    /** Tap-to-walk: plans a path to (x, z); returns true when a path was found. */
    walkTo(x, z) {
      if (!nav) return false;
      const r = findPath(nav, pl.x, pl.z, x, z, { snap: 3 });
      if (!r.found) {
        pl.route = null;
        return false;
      }
      pl.route = r.pts.slice();
      pl.routeGoal = r.goal;
      pl.stuckT = 0;
      pl.replanned = false;
      return true;
    },
    cancelRoute() {
      pl.route = null;
    },
    /** Climbs into the boat when the angler stands at the dock where it lies (boardingDock). Returns true when it happened. */
    board() {
      const flags = ctx.story.get().flags;
      if (bt.aboard || !boardingDock(ctx.boat.get(), pl.x, pl.z, flags)) return false;
      bt.aboard = true;
      bt.st = moored(ctx.boat.get().at);
      bt.target = null;
      pl.route = null;
      pl.x = bt.st.x;
      pl.z = bt.st.z;
      pl.face = [bt.st.hx, bt.st.hz];
      return true;
    },
    /** Steps off at the dock the boat is close to (or the given one); the boat stays moored there. */
    disembark(id) {
      const flags = ctx.story.get().flags;
      const dock = id || landingDock(bt.st, flags);
      if (!bt.aboard || !dock) return false;
      const d = DOCKS[dock];
      ctx.boat.moor(dock);
      bt.aboard = false;
      bt.target = null;
      W.teleport(d.stand[0], d.stand[1], 'up');
      return true;
    },
    /** Tap-to-go on the water while rowing: the boat steers to the nearest water to the point. Returns true when there is such water. */
    rowTo(x, z) {
      const p = nearestBoatWater(x, z);
      if (!p) return false;
      bt.target = p;
      return true;
    },
    /** Saving while rowing: the boat is moored at the nearest dock and the angler stands there (nothing is lost). Null when not rowing. */
    boatSave() {
      if (!bt.aboard) return null;
      const dock = nearestDock(bt.st.x, bt.st.z, ctx.story.get().flags);
      ctx.boat.moor(dock);
      return { x: DOCKS[dock].stand[0], z: DOCKS[dock].stand[1], dir: 'up' };
    },
    teleport(x, z, dir = 'up') {
      const u = unstick(x, z, world) || { x, z };
      pl.x = u.x;
      pl.z = u.z;
      pl.dir = dir;
      pl.route = null;
    },
    /** Moves the angler (not while a line is out), picks the sprite frame. Returns the feet height. */
    step(dt, elapsed, phase, yaw) {
      poseModel(dt, elapsed);
      if (bt.aboard) return W.stepBoat(dt, elapsed, phase, yaw);
      const [ix0, iz0] = input.axes();
      const canWalk = phase === 'idle';
      // screen axes -> world, turned by the camera heading
      const c = Math.cos(yaw);
      const s = Math.sin(yaw);
      let ix = ix0 * c + iz0 * s;
      let iz = -ix0 * s + iz0 * c;
      let il = Math.hypot(ix, iz);
      if (il > 0.1) pl.route = null; // the keys / stick take over
      else if (pl.route && canWalk) {
        const [gx, gz] = pl.route[0];
        const d = Math.hypot(gx - pl.x, gz - pl.z);
        if (d < 0.08) {
          pl.route.shift();
          if (!pl.route.length) pl.route = null;
        }
        if (pl.route) {
          const [tx, tz] = pl.route[0];
          const dd = Math.hypot(tx - pl.x, tz - pl.z) || 1;
          const k = Math.min(1, dd / (WALK_SPEED * dt)); // never overshoot a waypoint
          ix = ((tx - pl.x) / dd) * k;
          iz = ((tz - pl.z) / dd) * k;
          il = Math.hypot(ix, iz);
        }
      }
      pl.moving = canWalk && il > 0.01;
      if (pl.moving) {
        const k = Math.min(1, il) / il;
        const ox = pl.x;
        const oz = pl.z;
        const r = move(pl.x, pl.z, ix * k * WALK_SPEED * dt, iz * k * WALK_SPEED * dt, world);
        pl.x = r.x;
        pl.z = r.z;
        pl.lastBlocked = r.blocked;
        if (pl.route) {
          // walking a route and not getting anywhere for 0.8 s: give up (never stuck forever)
          pl.stuckT = Math.hypot(pl.x - ox, pl.z - oz) < WALK_SPEED * dt * 0.2 ? pl.stuckT + dt : 0;
          if (pl.stuckT > 0.8) {
            // stuck on a corner: plan again once from here, then give up (never stuck forever)
            const goal = pl.routeGoal;
            pl.route = null;
            if (!pl.replanned && goal && W.walkTo(goal[0], goal[1])) pl.replanned = true;
          }
        }
        pl.face = [ix / il, iz / il];
        pl.dir = screenDir(ix, iz, yaw);
        pl.walkT += dt * Math.min(1, il);
        // footstep dust on dirt and cobbles
        pl.dustT -= dt;
        if (pl.dustT <= 0 && !ctx.reduced) {
          pl.dustT = 0.28;
          const k2 = Math.round((pl.x - view.field.x0) / view.field.cell) + Math.round((pl.z - view.field.z0) / view.field.cell) * view.field.nx;
          if (view.field.dirt[k2] + view.field.cobble[k2] > 0.4) view.dust.spawn(pl.x, feetY(pl.x, pl.z), pl.z);
        }
      } else if (canWalk) pl.dir = screenDir(pl.face[0], pl.face[1], yaw);
      const fy = feetY(pl.x, pl.z);
      view.player.root.position.set(pl.x, fy, pl.z);
      view.player.face(yaw);
      let col = ANGLER_COLS.stand;
      if (pl.moving) {
        const cyc = ctx.reduced ? [1, 0, 3, 0] : WALK_CYCLE;
        col = cyc[Math.floor(pl.walkT * 7) % 4];
      } else if (phase === 'casting') col = ANGLER_COLS.cast; // the swing and the throw
      else if (phase === 'reeling' || phase === 'retracting') col = ctx.reduced || Math.floor(elapsed * 6) % 2 === 0 ? ANGLER_COLS.reel : ANGLER_COLS.rod; // winding: the crank pose alternates with the rod pose (a fixed pose in reduced motion)
      else if (phase !== 'idle') col = ANGLER_COLS.rod;
      else if (!ctx.reduced && Math.floor(elapsed / 1.6) % 3 === 2) col = ANGLER_COLS.breath;
      view.player.frame(col, DIR_ROW[pl.dir]);
      swayUniforms.uPlayer.value.set(pl.x, fy, pl.z);
      view.ring.visible = !!pl.route;
      if (pl.route) {
        const [gx, gz] = pl.routeGoal;
        view.ring.position.set(gx, feetY(gx, gz) + 0.04, gz);
      }
      W.stepCat(dt, elapsed, yaw, phase);
      W.catOnIslet();
      W.stepFolk(dt, yaw);
      return fy;
    },
    /** Rowing: the same keys / stick / taps as walking, turned by the camera heading; slow and smooth, bounded by the water (boat/boat.js rowStep). */
    stepBoat(dt, elapsed, phase, yaw) {
      const [ix0, iz0] = input.axes();
      const c = Math.cos(yaw);
      const s = Math.sin(yaw);
      let inp = { ix: ix0 * c + iz0 * s, iz: -ix0 * s + iz0 * c };
      if (Math.hypot(inp.ix, inp.iz) > 0.1) bt.target = null; // the keys / stick take over
      else if (bt.target && phase === 'idle') {
        const st = steerTo(bt.st, bt.target[0], bt.target[1]);
        if (st) inp = st;
        else bt.target = null;
      }
      if (phase !== 'idle') inp = { ix: 0, iz: 0 }; // a line is out: the boat coasts to a stop
      bt.st = rowStep(bt.st, inp, dt);
      pl.x = bt.st.x;
      pl.z = bt.st.z;
      pl.moving = bt.st.v > 0.15;
      pl.face = [bt.st.hx, bt.st.hz];
      if (phase === 'idle') pl.dir = screenDir(bt.st.hx, bt.st.hz, yaw);
      pl.route = null;
      const fy = WATER_Y + 0.0;
      view.player.root.position.set(pl.x, fy, pl.z);
      view.player.face(yaw);
      let col = ANGLER_COLS.stand;
      if (phase === 'casting') col = ANGLER_COLS.cast;
      else if (phase === 'reeling' || phase === 'retracting') col = ctx.reduced || Math.floor(elapsed * 6) % 2 === 0 ? ANGLER_COLS.reel : ANGLER_COLS.rod;
      else if (phase !== 'idle') col = ANGLER_COLS.rod;
      view.player.frame(col, DIR_ROW[pl.dir]);
      swayUniforms.uPlayer.value.set(pl.x, fy, pl.z);
      view.ring.visible = false;
      // a gentle wake: a ripple behind the stern now and then (none in reduced motion)
      bt.wakeT -= dt;
      if (bt.wakeT <= 0 && bt.st.v > 0.5 && !ctx.reduced && ctx.addRipple) {
        bt.wakeT = 0.55;
        ctx.addRipple(pl.x - bt.st.hx * 1.5, pl.z - bt.st.hz * 1.5, 0.7);
      }
      W.catOnIslet();
      W.stepFolk(dt, yaw);
      return fy;
    },
    /** Once the angler stands on the islet, the cat is there too, on its seat of the current couplet (or by the bench after the finale). */
    catOnIslet() {
      const hp = ctx.catHint ? ctx.catHint() : null;
      const seat = hp && hp.islet ? hp.islet : ctx.story.flag('finale.done') ? [7.4, -25.1] : null;
      if (!seat || bt.aboard || !onIslet(pl.x, pl.z, 0.8)) return;
      if (Math.hypot(cat.x - seat[0], cat.z - seat[1]) < 0.3) return;
      Object.assign(cat, { x: seat[0], z: seat[1], mode: 'sit', path: null, leading: false, perched: !!hp, sitT: 0 });
    },
    /** The cat: sits; follows when the angler walks away (stays 1.5-3 m behind); sits by the nearest lamp when the angler stops near one. */
    stepCat(dt, elapsed, yaw, phase) {
      const dx = pl.x - cat.x;
      const dz = pl.z - cat.z;
      const d = Math.hypot(dx, dz);
      let goal = null;
      idleT = pl.moving ? 0 : idleT + dt;
      // J12-A: the cat hints the place of the next couplet. The angler stands still for a few seconds with the cat near: it trots there and sits; it stays while the angler
      // is within 25 m, and lets go when the angler finds it (within 1.8 m) or goes far away; it hints again for the next couplet. ctx.catHint() = { x, z, spot } | null.
      const hp = ctx.catHint ? ctx.catHint() : null;
      if (!hp || (cat.hintKey && cat.hintKey !== hp.spot)) {
        cat.leading = false;
        cat.perched = false;
        cat.hintKey = hp ? hp.spot : null;
        if (!hp) cat.doneKey = null;
      }
      if (hp) {
        const dp = Math.hypot(pl.x - hp.x, pl.z - hp.z);
        const dh = Math.hypot(cat.x - hp.x, cat.z - hp.z);
        if (cat.perched && (dp > 25 || dh > 3)) cat.perched = false;
        if (cat.perched && dp < 1.8) {
          cat.perched = false;
          cat.doneKey = hp.spot; // found: the cat is done with this couplet's hint
        }
        if (!cat.perched && !cat.leading && cat.doneKey !== hp.spot && idleT > 5 && d < 4 && dp > 4) {
          cat.leading = true;
          cat.hintKey = hp.spot;
        }
        if (cat.leading && (pl.moving || dp < 1.8)) cat.leading = false;
        if (cat.leading) goal = [hp.x, hp.z];
        if (cat.leading && dh < 0.35) {
          cat.leading = false;
          cat.perched = true;
        }
      }
      if (cat.leading) {
        /* going to the hint seat */
      } else if (cat.perched) goal = null; // sits at the place (the follow rule below must not call it back while the angler is within 25 m)
      else if (d > 4) goal = [pl.x, pl.z];
      else if (!pl.moving && phase !== 'charging') {
        // a lamp within 6 m of the angler: go and sit beside it (on the side facing the angler)
        let best = null;
        for (const L of lamps) {
          const dl = Math.hypot(L.x - pl.x, L.z - pl.z);
          if (dl < 6 && (!best || dl < best.d)) best = { L, d: dl };
        }
        if (best) {
          const a = Math.atan2(pl.z - best.L.z, pl.x - best.L.x);
          const seat = unstick(best.L.x + Math.cos(a) * 0.55, best.L.z + Math.sin(a) * 0.55, world, 0.18, 1.5);
          if (seat && Math.hypot(seat.x - cat.x, seat.z - cat.z) > 0.25) goal = [seat.x, seat.z];
        }
      }
      if (goal && cat.mode === 'sit' && (d < 4 || cat.leading) && Math.hypot(goal[0] - cat.x, goal[1] - cat.z) < 0.25) goal = null;
      if (goal) {
        if (cat.mode !== 'walk' || cat.repath <= 0) {
          cat.repath = 1.0;
          cat.path = nav ? findPath(nav, cat.x, cat.z, goal[0], goal[1], { snap: 2, limit: 6000 }).pts : [goal];
        }
        cat.mode = 'walk';
      } else if (cat.mode === 'walk' && (!cat.path || !cat.path.length)) cat.mode = 'sit';
      cat.repath -= dt;
      let moving = false;
      if (cat.mode === 'walk' && cat.path && cat.path.length) {
        const [tx, tz] = cat.path[0];
        const dd = Math.hypot(tx - cat.x, tz - cat.z);
        const near = d < 1.6 && d > 0; // keeps a little behind
        if (dd < 0.1) cat.path.shift();
        else if (!near || goal === null || d > 4 || cat.leading) {
          const sp = Math.min(dd, (d > 6 ? WALK_SPEED * 1.15 : WALK_SPEED * 0.85) * dt);
          const r = move(cat.x, cat.z, ((tx - cat.x) / dd) * sp, ((tz - cat.z) / dd) * sp, world, 0.15);
          moving = Math.hypot(r.x - cat.x, r.z - cat.z) > 1e-4;
          cat.flip = screenDir(r.x - cat.x, r.z - cat.z, yaw) === 'right';
          cat.x = r.x;
          cat.z = r.z;
        }
        if (!cat.path.length) cat.mode = 'sit';
      }
      // far behind (a teleport, a long tap-to-walk): the cat catches up out of sight
      if (d > 30) {
        const u = unstick(pl.x - pl.face[0] * 1.5, pl.z - pl.face[1] * 1.5, world, 0.15, 3);
        if (u) Object.assign(cat, { x: u.x, z: u.z, path: null, mode: 'sit' });
      }
      const cy = feetY(cat.x, cat.z);
      view.cat.root.visible = !moving;
      view.catWalk.root.visible = moving;
      if (moving) {
        cat.walkT += dt;
        view.catWalk.root.position.set(cat.x, cy, cat.z);
        view.catWalk.face(yaw, cat.flip);
        view.catWalk.frame(ctx.reduced ? 0 : Math.floor(cat.walkT * 9) % 4, 0);
      } else {
        view.cat.root.position.set(cat.x, cy, cat.z);
        view.cat.face(yaw);
        catT += dt;
        cat.sitT = (cat.sitT || 0) + dt;
        if (cat.sitT > 25) cat.frame = CAT_POSES.loaf; // sat a long while: curls up (a fixed pose, also in reduced motion)
        else if (catT > (cat.frame === 0 ? 2.2 : cat.frame === CAT_POSES.groom ? 1.8 : 0.35)) {
          catT = 0;
          const r = (Math.sin(elapsed * 12.9898) * 43758.5453) % 1;
          // rest -> a small move (tail up, blink, grooming, tail tip); back to rest after a moment. Reduced motion: rest, or a single blink pose, never grooming
          cat.frame = cat.frame !== 0 ? 0 : ctx.reduced ? CAT_POSES.blink * (Math.abs(r) > 0.6) : [CAT_POSES.tailUp, CAT_POSES.blink, CAT_POSES.groom, CAT_POSES.tailTip][Math.floor(Math.abs(r) * 4)];
        }
        view.cat.frame(cat.frame, 0);
      }
      if (moving) cat.sitT = 0;
    },
    stepFolk(dt, yaw) {
      wanderers.forEach((w, i) => {
        const st = ctx.talkingTo && ctx.talkingTo === VILLAGERS[i].id ? ((w.state.moving = false), w.state) : w.step(dt, { x: pl.x, z: pl.z }); // J12-A: the one being talked to stands still
        const b = view.folk[i];
        b.root.position.set(st.x, feetY(st.x, st.z), st.z);
        b.face(yaw);
        if (st.moving) folkWalkT[i] += dt * VILLAGERS[i].speed;
        const col = st.moving ? (ctx.reduced ? [1, 0, 3, 0] : FOLK_WALK)[Math.floor(folkWalkT[i] * 6) % 4] : 0;
        b.frame(col, DIR_ROW[screenDir(st.fx, st.fz, yaw)]);
      });
    },
  };
  void PLAYER_RADIUS;
  return W;
}
