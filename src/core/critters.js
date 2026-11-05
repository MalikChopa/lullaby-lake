// Living scenery (J6 part B): the schedule of the silent creatures (birds, geese, heron, owl, bat, shooting star, jumping fish,
// dragonflies, frog) and the poses of the cat. Pure: no DOM, no clock, no Math.random; every stream of random numbers is derived
// from (seed, session, name) with rng.js `fork`, so the same session always gives the same schedule, and the fish draws of the game
// (which use their own streams "fish#", "size#") are never touched.
//
// Usage: const c = createCritters({ seed, session }); each frame c.update(gameTimeS, env); c.active(gameTimeS, env) -> events to paint.
//   env = envFromLook(look, { reduced, fishing, floatX })  (see below). Rules and numbers: data/critters.js.
// An event started in a phase goes on when the phase changes; its opacity follows the light (the gate) so it fades, never pops.

import { fork, between } from './rng.js';
import DATA from '../data/critters.js';

const HOR = 150; // horizon row of the picture (art/sceneBake.js)
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const fadeOut = (v, range) => (range ? 1 - smooth((v - range[0]) / (range[1] - range[0])) : 1);

export const KINDS = Object.freeze(Object.keys(DATA.kinds));
export const SKY_KINDS = Object.freeze(KINDS.filter((k) => DATA.kinds[k].cls === 'sky'));
/** Kinds that move through the picture; with reduced motion none of them is shown (the frog stays, still). */
export const MOVING_KINDS = Object.freeze(KINDS.filter((k) => k !== 'frog'));

// phase weights of a pinned mood (?preset=): there is no clock, only the mood
const PIN_TOD = { day: { dawn: 0, day: 1, dusk: 0, night: 0 }, dusk: { dawn: 0, day: 0, dusk: 1, night: 0 }, night: { dawn: 0, day: 0, dusk: 0, night: 1 }, rain: { dawn: 0, day: 1, dusk: 0, night: 0 }, fog: { dawn: 1, day: 0, dusk: 0, night: 0 } };

/**
 * The few numbers the creatures read from the world.
 * @param {object} look core/sky.js lookParams() or pinnedLook()
 * @param {{reduced?:boolean, fishing?:string, floatX?:?number}} extra fishing = phase of the fishing machine (read only), floatX = column of the float when it is on the water
 */
export function envFromLook(look, extra = {}) {
  return {
    tod: look.tod || PIN_TOD[look.dominant] || PIN_TOD.day,
    rain: look.rain || 0,
    cover: look.cover || 0,
    veil: look.veil || 0,
    light: look.light ?? 1,
    reduced: !!extra.reduced,
    fishing: extra.fishing || 'idle',
    floatX: extra.floatX ?? null,
  };
}

/** How much a kind may show in this world, 0..1 (the "gate"). */
export function gateOf(spec, env) {
  let g = 0;
  for (const k of Object.keys(spec.tod)) g += (env.tod[k] || 0) * spec.tod[k];
  return clamp(g, 0, 1) * fadeOut(env.rain, spec.rain) * fadeOut(env.cover, spec.cover) * fadeOut(env.veil, spec.veil);
}

/**
 * Debug parameters (only honoured when `debug` is true): ?critters=all (every kind, any phase and weather, often), ?critters=off (none),
 * ?critter=<kind> (that kind alone, any phase and weather, again and again).
 */
export function parseCritterParams(search, debug) {
  const q = new URLSearchParams(search || '');
  const out = { mode: 'natural', only: null };
  if (!debug) return out;
  const all = q.get('critters');
  const one = q.get('critter');
  if (one && KINDS.includes(one)) return { mode: 'only', only: one };
  if (all === 'all') return { mode: 'all', only: null };
  if (all === 'off') return { mode: 'off', only: null };
  return out;
}

// ------------------------------------------------------------------ the scheduler

/**
 * @param {{seed:number, session?:number, data?:object, mode?:'natural'|'all'|'only'|'off', only?:?string}} o
 *   mode all / only: the gates are ignored and the waits are short (debug, perf and captures).
 */
export function createCritters({ seed, session = 0, data = DATA, mode = 'natural', only = null } = {}) {
  const streams = {};
  const R = (kind) => streams[kind] || (streams[kind] = fork(seed, 'critters#' + session + '/' + kind));
  const forced = mode === 'all' || mode === 'only';
  const kinds = Object.keys(data.kinds).filter((k) => mode !== 'off' && (mode !== 'only' || k === only));
  const waitScale = forced ? 0.12 : 1;
  const st = {};
  for (const k of kinds) st[k] = { wait: forced ? 0.5 + R(k)() * 2 : between(R(k), data.kinds[k].firstS) };
  let events = [];
  let nextId = 1;
  let last = null;
  let lastSky = -1e9;
  const skyGap = forced ? 0 : data.skyMinGapS;

  const gate = (k, env) => (forced ? 1 : gateOf(data.kinds[k], env));

  function legsOf(r, box, durS) {
    const legs = [];
    let t = 0.5 + r() * 1.2;
    let x = box[0] + r() * (box[2] - box[0]);
    let y = box[1] + r() * (box[3] - box[1]);
    const start = [x, y];
    while (t < durS) {
      const move = 0.35 + r() * 0.25;
      const nx = clamp(x + (r() - 0.5) * 70, box[0], box[2]);
      const ny = clamp(y + (r() - 0.5) * 36, box[1], box[3]);
      legs.push([t, t + move, x, y, nx, ny]);
      x = nx;
      y = ny;
      t += move + 0.8 + r() * 1.6;
    }
    return { start, legs };
  }

  /** Builds the event of a kind; null when it cannot start now (the caller waits a little). */
  function make(kind, t, env) {
    const spec = data.kinds[kind];
    const r = R(kind);
    const dur = between(r, spec.durS);
    const ev = { id: nextId++, kind, t0: t, dur, p: {} };
    const p = ev.p;
    const dirOf = (x) => (x > 330 ? -1 : x < 150 ? 1 : r() < 0.5 ? -1 : 1);
    switch (kind) {
      case 'birds': {
        p.dir = r() < 0.5 ? -1 : 1;
        p.y = between(r, spec.band);
        p.birds = [];
        const n = spec.count[0] + Math.floor(r() * (spec.count[1] - spec.count[0] + 1));
        for (let i = 0; i < n; i++) p.birds.push({ back: i * (9 + r() * 6), dy: (r() - 0.5) * 12, ph: r() * 6 });
        break;
      }
      case 'geese': {
        p.dir = r() < 0.5 ? -1 : 1;
        p.y = between(r, spec.band);
        const n = spec.count[0] + Math.floor(r() * (spec.count[1] - spec.count[0] + 1));
        p.n = n;
        p.ph = Array.from({ length: n }, () => r() * 6);
        break;
      }
      case 'heron':
        p.dir = r() < 0.5 ? -1 : 1;
        p.y = between(r, spec.band);
        p.ph = r() * 6;
        break;
      case 'owl':
        p.dir = r() < 0.5 ? -1 : 1;
        p.y = between(r, spec.band);
        p.amp = 3 + r() * 3;
        p.ph = r() * 6;
        break;
      case 'bat': {
        p.x0 = between(r, spec.span);
        p.dir = dirOf(p.x0);
        p.y0 = between(r, spec.band);
        p.spd = 12 + r() * 8;
        p.wx = [1.1 + r() * 0.8, 2.3 + r() * 1.2];
        p.wy = [1.3 + r() * 0.9, 2.9 + r() * 1.3];
        p.px = [r() * 6, r() * 6];
        p.py = [r() * 6, r() * 6];
        p.ax = [10 + r() * 8, 3 + r() * 3];
        p.ay = [9 + r() * 6, 3 + r() * 3];
        break;
      }
      case 'star': {
        p.x0 = between(r, spec.span);
        const dir = p.x0 < 240 ? 1 : -1;
        p.vx = dir * (110 + r() * 50);
        p.vy = 38 + r() * 30;
        p.y0 = 6 + r() * 40;
        p.len = 9 + Math.floor(r() * 4);
        break;
      }
      case 'jump': {
        const spots = spec.spots.filter((s) => env.floatX == null || Math.abs(s[0] - env.floatX) >= spec.floatKeepPx);
        if (!spots.length) return null;
        const s = spots[Math.floor(r() * spots.length)];
        p.x = s[0];
        p.y = s[1];
        p.dir = r() < 0.5 ? -1 : 1;
        p.h = (7 + r() * 4) * ((s[1] - HOR) / 34);
        p.dx = 5 + r() * 4;
        break;
      }
      case 'dragon': {
        const n = spec.count[0] + Math.floor(r() * (spec.count[1] - spec.count[0] + 1));
        p.flies = Array.from({ length: n }, () => legsOf(r, spec.box, dur));
        break;
      }
      case 'frog': {
        const pads = data.pads;
        let pad = Math.floor(r() * pads.length);
        p.stops = [{ pad, t: 0 }];
        let tt = 0;
        for (;;) {
          tt += between(r, data.frog.hopGapS);
          if (tt > dur - spec.leaveS - 3) break;
          const opts = pads[pad].next;
          pad = opts[Math.floor(r() * opts.length)];
          p.stops.push({ pad, t: tt });
        }
        const times = (gap, from, to) => {
          const out = [];
          for (let q = from + between(r, gap); q < to; q += between(r, gap)) out.push(q);
          return out;
        };
        p.blinks = times(data.frog.blinkGapS, spec.enterS, dur - spec.leaveS);
        p.ripples = times(data.frog.rippleGapS, spec.enterS, dur - spec.leaveS);
        break;
      }
      default:
        break;
    }
    return ev;
  }

  const alive = (kind) => events.some((e) => e.kind === kind);

  const api = {
    mode,
    kinds,
    /** Advances to game time `t` (seconds, never going back; a pause = the same t). */
    update(t, env) {
      const dt = last === null ? 0 : clamp(t - last, 0, 2);
      last = t;
      if (env.reduced) {
        events = []; // no flying, hopping or shooting with reduced motion: nothing moves, nothing is scheduled
        return;
      }
      events = events.filter((e) => t < e.t0 + e.dur);
      for (const e of events) {
        // the light left while a frog was there: it hops back into the water soon
        if (e.kind === 'frog' && !forced) {
          const spec = data.kinds.frog;
          if (gateOf(spec, env) < spec.need * 0.4) e.dur = Math.min(e.dur, t - e.t0 + spec.leaveS);
        }
      }
      for (const kind of kinds) {
        const spec = data.kinds[kind];
        const s = st[kind];
        const g = gate(kind, env);
        if (g < spec.need) continue; // not now: the wait does not run
        s.wait -= dt * Math.min(1, g) * (1 - (spec.slowByCover || 0) * env.cover); // full speed at gate 1, slower in half light or a drizzle
        if (s.wait > 0) continue;
        // ready; some things hold it back
        const sky = spec.cls === 'sky';
        const busy = sky ? t - lastSky < skyGap || (skyGap > 0 && events.some((e) => data.kinds[e.kind].cls === 'sky')) : spec.cls !== 'jump' && alive(kind);
        const calmNeeded = kind === 'jump' && env.fishing === 'bite'; // nothing distracts a bite
        if (busy || calmNeeded) {
          s.wait = 0.5;
          continue;
        }
        const ev = make(kind, t - Math.max(0, -s.wait), env);
        if (!ev) {
          s.wait = 1;
          continue;
        }
        events.push(ev);
        if (sky) lastSky = ev.t0;
        s.wait = between(R(kind), spec.gapS) * waitScale;
      }
    },
    /** The events to paint at time `t`: { id, kind, age, dur, u, alpha, p } (alpha follows the light and the edges). */
    active(t, env) {
      const out = [];
      if (env.reduced) {
        // the frog sits still on its pad while the light and the weather allow it (a slow fade, no motion)
        const spec = data.kinds.frog;
        if (kinds.includes('frog')) {
          const g = forced ? 1 : gateOf(spec, env);
          if (g > 0.02) out.push({ id: 0, kind: 'frog', age: 0, dur: 1, u: 0, alpha: clamp(g / spec.need, 0, 1), still: true, p: { stops: [{ pad: 1, t: 0 }], blinks: [], ripples: [] } });
        }
        return out;
      }
      for (const e of events) {
        const spec = data.kinds[e.kind];
        const age = t - e.t0;
        if (age < 0 || age >= e.dur) continue;
        const vis = forced ? 1 : clamp(gateOf(spec, env) / spec.need, 0, 1);
        const edge = spec.cls === 'sky' || spec.cls === 'dragon' ? Math.min(1, age / data.fadeS, (e.dur - age) / data.fadeS) : 1;
        out.push({ id: e.id, kind: e.kind, age, dur: e.dur, u: age / e.dur, alpha: vis * edge, p: e.p });
      }
      return out;
    },
    /** Debug / tests: starts an event of `kind` now, whatever the world says. Returns it (null when it cannot start). */
    force(kind, t, env) {
      if (!data.kinds[kind]) return null;
      const ev = make(kind, t, env || { floatX: null });
      if (ev) events.push(ev);
      return ev;
    },
    /** Tests: events currently running. */
    running: () => events.map((e) => ({ id: e.id, kind: e.kind, t0: e.t0, dur: e.dur })),
  };
  return api;
}

// ------------------------------------------------------------------ the cat

/**
 * The poses of the cat as a function of time and world. Stateful only through its own clocks (blink, ear, tail, yawn, sleep).
 * update(t, env) -> { key, body: 'sit'|'curl', tail 0..2, ear 0..2, eyes, mouth 0|2, headDy, bodyDy, breath } ; same key = same picture.
 * Reduced motion: only the static poses "sit" and "curl" (no blink, swish, yawn, breathing or transition).
 * Not near a bite or a catch the cat does its small idle things; asleep (night, heavy rain) it ignores the fishing.
 */
export function createCat({ seed, session = 0, data = DATA } = {}) {
  const C = data.cat;
  const mk = (name) => {
    const r = fork(seed, 'cat#' + session + '/' + name);
    const spec = C[name];
    return { r, spec, next: between(r, spec.gapS) * 0.6 };
  };
  const beh = { blink: mk('blink'), ear: mk('ear'), tail: mk('tail'), yawn: mk('yawn') };
  let mode = null; // 'awake' | 'dozing' | 'asleep' | 'waking'
  let modeAt = 0;
  let waitSince = null;
  let caughtAt = -1e9;
  let prevFishing = 'idle';
  const progress = (b, t) => {
    if (t >= b.next + b.spec.durS) b.next = t + between(b.r, b.spec.gapS); // finished (or a long pause): the next one later
    return t >= b.next ? (t - b.next) / b.spec.durS : -1;
  };

  function update(t, env) {
    const S = C.sleep;
    const night = env.tod.night || 0;
    const sleepy = night >= S.nightOn || env.rain >= S.rainOn;
    const rested = night < S.nightOff && env.rain < S.rainOff;
    const d = { body: 'sit', tail: 0, ear: 0, eyes: 'open', mouth: 0, headDy: 0, bodyDy: 0, breath: 0 };
    const done = () => {
      d.key = [d.body, d.tail, d.ear, d.eyes, d.mouth, d.headDy, d.breath].join('|');
      return d;
    };
    if (env.reduced) {
      // still poses only; the change between them is immediate
      if (mode === null || mode === 'awake') mode = sleepy ? 'asleep' : 'awake';
      else if (mode === 'asleep' && rested) mode = 'awake';
      else if (mode !== 'asleep') mode = sleepy ? 'asleep' : 'awake';
      if (mode === 'asleep') {
        d.body = 'curl';
        d.eyes = 'closed';
      }
      return done();
    }
    if (mode === null) mode = sleepy ? 'asleep' : 'awake';
    if (mode === 'awake' && sleepy) {
      mode = 'dozing';
      modeAt = t;
    } else if (mode === 'dozing' && !sleepy && rested) mode = 'awake';
    else if (mode === 'asleep' && rested) {
      mode = 'waking';
      modeAt = t;
    } else if (mode === 'waking' && sleepy) {
      mode = 'dozing';
      modeAt = t;
    }
    if (mode === 'dozing') {
      const k = t - modeAt;
      if (k >= S.dozeS) mode = 'asleep';
      else {
        // sitting, then the eyes close and the head sinks, then the cat curls
        d.eyes = k < S.dozeS * 0.35 ? 'half' : 'closed';
        d.headDy = k < S.dozeS * 0.2 ? 0 : 1;
        return done();
      }
    }
    if (mode === 'asleep') {
      d.body = 'curl';
      d.eyes = 'closed';
      d.breath = Math.floor(t / S.breathS) % 2;
      return done();
    }
    if (mode === 'waking') {
      const k = t - modeAt;
      if (k < S.riseS) {
        d.eyes = 'closed';
        d.headDy = 1;
        return done();
      }
      if (k < S.riseS + S.wakeYawnS) {
        d.eyes = 'closed';
        d.mouth = 2;
        d.headDy = -1;
        return done();
      }
      mode = 'awake';
    }
    // awake
    const fp = env.fishing;
    if (fp === 'caught' && prevFishing !== 'caught') caughtAt = t;
    prevFishing = fp;
    if (fp === 'waiting') {
      if (waitSince === null) waitSince = t;
    } else waitSince = null;
    const blink = progress(beh.blink, t);
    const ear = progress(beh.ear, t);
    const tail = progress(beh.tail, t);
    const yawn = progress(beh.yawn, t);
    const sinceCatch = t - caughtAt;
    if (sinceCatch >= 0 && sinceCatch < C.happyS) {
      d.eyes = 'happy';
      d.tail = Math.floor(sinceCatch / C.tail.stepS) % 2 ? 2 : 1;
      if (sinceCatch < C.bounceS * C.bounceCount) d.bodyDy = Math.floor(sinceCatch / C.bounceS) % 2 ? 0 : -1;
      return done();
    }
    if (fp === 'bite' || fp === 'reeling' || fp === 'retracting') {
      d.eyes = 'wide';
      d.ear = 2;
      d.headDy = -1;
      d.tail = 1;
      return done();
    }
    if (fp === 'waiting' && t - waitSince >= C.noticeS) {
      d.eyes = blink >= 0 ? 'closed' : 'down';
      d.headDy = 1;
      if (tail >= 0) d.tail = Math.floor((tail * C.tail.durS) / C.tail.stepS) % 2 ? 2 : 1;
      return done();
    }
    if (yawn >= 0 && fp === 'idle') {
      d.eyes = 'closed';
      d.mouth = 2;
      d.headDy = -1;
      return done();
    }
    if (blink >= 0) d.eyes = 'closed';
    if (ear >= 0) d.ear = 1;
    if (tail >= 0) d.tail = Math.floor((tail * C.tail.durS) / C.tail.stepS) % 2 ? 2 : 1;
    return done();
  }
  return { update, mode: () => mode };
}
