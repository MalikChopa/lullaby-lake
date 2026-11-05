// Painters of the silent creatures of core/critters.js: flyovers (birds, geese, heron, owl, bat), shooting star, jumping fish,
// dragonflies, frog. Everything is drawn in whole pixels (no antialiasing) with the approved palettes' look, and dimmed with the light
// of the moment (`light` 0..1) so a creature never shines in the dark. Pure: the events come in as arguments.
//   paintSkyEvents(R, events, light)    on the SKY (behind the hills and the clouds): shooting star
//   paintBehind(R, events, light)       on the water, before the pier, the angler and the reeds are drawn: jumping fish and their rings
//   paintFront(R, events, light)        over the scene: flyovers, dragonflies, frog

import { W } from './sceneBake.js';
import { ring } from './overlayPaint.js';

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const lit = (c, light) => {
  const f = 0.6 + 0.4 * clamp01(light);
  return [c[0] * f, c[1] * f, c[2] * f];
};
const RING = hex('#fff3dc');

/** Draws string-art rows: '.' = nothing, any other character = pal[char]. x,y = top-left. flip mirrors it left to right. */
function blit(R, x, y, rows, pal, alpha, flip = false) {
  for (let j = 0; j < rows.length; j++) {
    const row = rows[j];
    const n = row.length;
    for (let i = 0; i < n; i++) {
      const ch = row[flip ? n - 1 - i : i];
      if (ch !== '.') R.pxA(x + i, y + j, pal[ch], alpha);
    }
  }
}

// ---------------------------------------------------------------- flyovers
const BIRD = [
  ['x.....x', '.x...x.', '..xxx..'],
  ['.......', 'xx.x.xx', '.......'],
  ['..xxx..', '.x...x.', 'x.....x'],
];
const FLAP4 = [0, 1, 2, 1];
const BIRD_COL = hex('#4a3a6a');

function bird(R, x, y, frame, alpha, light) {
  blit(R, x - 3, y - 1, BIRD[FLAP4[((frame % 4) + 4) % 4]], { x: lit(BIRD_COL, light) }, alpha);
}

const GOOSE = hex('#3e3460');
const HERON_BODY = hex('#d6d2ec');
const HERON_WING = hex('#f2eefc');
const HERON_PALE = hex('#fffaf0');

/** The heron in flight toward +x (dir = -1 mirrors it): slow flaps, neck folded, legs trailing. */
function heron(R, x, y, f, dir, alpha, light) {
  const bodyC = lit(HERON_BODY, light);
  const wingC = lit(HERON_WING, light);
  const paleC = lit(HERON_PALE, light);
  const X = (dx) => x + dir * dx;
  const p = (dx, dy, c, a = alpha) => R.pxA(X(dx), y + dy, c, a);
  // legs trailing behind, thin
  for (let i = 5; i <= 11; i++) p(-i, 1 + (i > 8 ? 1 : 0), bodyC, alpha * 0.9);
  // body and folded neck, head and long beak ahead
  for (let i = -4; i <= 3; i++) {
    p(i, 0, bodyC);
    p(i, 1, i < 0 ? bodyC : paleC);
  }
  p(4, -1, bodyC);
  p(5, -2, bodyC);
  p(5, -3, bodyC);
  p(6, -3, bodyC);
  for (let i = 7; i <= 10; i++) p(i, -3, paleC);
  // wings: up, level (foreshortened), down; the far wing is a little paler
  const up = f === 0;
  const down = f === 2;
  for (let i = 0; i < 8; i++) {
    const wx = -1 - (i >> 1);
    if (up) {
      p(wx, -1 - i, wingC);
      p(wx + 2, -i, bodyC, alpha * 0.8);
    } else if (down) {
      p(wx, 2 + i, wingC);
      p(wx + 2, 1 + i, bodyC, alpha * 0.8);
    } else {
      p(-i, -1, wingC);
      p(-i + 1, 2, bodyC, alpha * 0.7);
    }
  }
}

const OWL = [
  ['.xx.....xx.', 'xxxxx.xxxxx', '..xxxxxxx..', '....xxx....'],
  ['x.........x', 'xx..xxx..xx', '.xxxxxxxxx.', '....xxx....'],
];
const OWL_COL = hex('#e6e0f4');
const OWL_SHADE = hex('#9e98c4');

const BAT = [
  ['xx...xx', '.xxxxx.', '..x.x..'],
  ['..xxx..', 'xxxxxxx', 'x.x.x.x'],
];
const BAT_COL = hex('#17122c');

function flyers(R, e, light) {
  const { p, age, dur, alpha } = e;
  const u = age / dur;
  const span = W + 40;
  switch (e.kind) {
    case 'birds': {
      const lead = p.dir > 0 ? -20 + span * u : W + 20 - span * u;
      for (const b of p.birds) {
        const x = lead - p.dir * b.back;
        const y = p.y + b.dy + Math.sin(age * 0.8 + b.ph) * 2;
        bird(R, Math.round(x), Math.round(y), Math.floor(age * 5 + b.ph), alpha, light);
      }
      return;
    }
    case 'geese': {
      const lead = p.dir > 0 ? -30 + (W + 80) * u : W + 30 - (W + 80) * u;
      for (let i = 0; i < p.n; i++) {
        const row = (i + 1) >> 1;
        const side = i === 0 ? 0 : i & 1 ? -1 : 1;
        const x = lead - p.dir * row * 9;
        const y = p.y + side * row * 5 + Math.sin(age * 0.7 + p.ph[i]) * 1.5;
        const c = lit(GOOSE, light);
        blit(R, Math.round(x) - 3, Math.round(y) - 1, BIRD[FLAP4[Math.floor(age * 3.2 + p.ph[i]) % 4]], { x: c }, alpha);
      }
      return;
    }
    case 'heron': {
      const x = p.dir > 0 ? -16 + (W + 32) * u : W + 16 - (W + 32) * u;
      const y = p.y + Math.sin(age * 0.5 + p.ph) * 2.5;
      heron(R, Math.round(x), Math.round(y), [0, 1, 2, 1][Math.floor(age * 2.4 + p.ph) % 4], p.dir, alpha, light);
      return;
    }
    case 'owl': {
      const x = p.dir > 0 ? -14 + (W + 28) * u : W + 14 - (W + 28) * u;
      const y = p.y + Math.sin(age * 0.9 + p.ph) * p.amp;
      const flap = Math.floor(age * 1.2) % 5 === 0 && (age * 1.2) % 1 < 0.5 ? 1 : 0; // a slow beat now and then, mostly gliding
      const rows = OWL[flap];
      blit(R, Math.round(x) - 5, Math.round(y) - 2, rows, { x: lit(OWL_COL, light) }, alpha);
      for (let i = 0; i < 11; i++) if (rows[3][i] === 'x' || rows[2][i] === 'x') R.pxA(Math.round(x) - 5 + i, Math.round(y) + 0, lit(OWL_SHADE, light), alpha * 0.9);
      return;
    }
    case 'bat': {
      const x = p.x0 + p.dir * p.spd * age + p.ax[0] * Math.sin(p.wx[0] * age + p.px[0]) + p.ax[1] * Math.sin(p.wx[1] * age + p.px[1]);
      const y = p.y0 + p.ay[0] * Math.sin(p.wy[0] * age + p.py[0]) + p.ay[1] * Math.sin(p.wy[1] * age + p.py[1]);
      blit(R, Math.round(x) - 3, Math.round(y) - 1, BAT[Math.floor(age * 6) % 2], { x: lit(BAT_COL, light * 0.7) }, alpha);
      return;
    }
    default:
  }
}

// ---------------------------------------------------------------- dragonflies
const DRAGON_BODY = hex('#4cc0b8');
const DRAGON_HEAD = hex('#2f8aa8');
const DRAGON_WING = hex('#e8f6ff');

function dragonflies(R, e, light) {
  const { age, alpha } = e;
  e.p.flies.forEach((f, idx) => {
    let x = f.start[0];
    let y = f.start[1];
    let dir = idx % 2 ? -1 : 1;
    for (const [t0, t1, x0, y0, x1, y1] of f.legs) {
      if (age < t0) break;
      const s = smooth((age - t0) / (t1 - t0));
      x = x0 + (x1 - x0) * s;
      y = y0 + (y1 - y0) * s;
      if (Math.abs(x1 - x0) > 3) dir = x1 > x0 ? 1 : -1;
    }
    const X = Math.round(x);
    const Y = Math.round(y);
    const flap = Math.floor(age * 5 + idx) % 2;
    const body = lit(DRAGON_BODY, light);
    R.pxA(X + dir * 2, Y, lit(DRAGON_HEAD, light), alpha);
    R.pxA(X + dir, Y, body, alpha);
    R.pxA(X, Y, body, alpha);
    for (let i = 1; i <= 3; i++) R.pxA(X - dir * i, Y, body, alpha * 0.9);
    const wing = lit(DRAGON_WING, light);
    const wy = flap ? Y + 1 : Y - 1;
    R.pxA(X + dir, wy, wing, alpha * 0.6);
    R.pxA(X, wy, wing, alpha * 0.6);
    R.pxA(X - dir, wy, wing, alpha * 0.45);
  });
}

// ---------------------------------------------------------------- frog
const FROG_PAL = { o: hex('#2f6a48'), g: hex('#78c060'), G: hex('#58a050'), l: hex('#cfe8a0'), e: hex('#fffbe0'), p: hex('#1a1020') };
const FROG = {
  sit: ['..oo.oo..', '.oepoepo.', '.ogggggo.', 'ogGgggGgo', 'olllllllo', '.oo...oo.'],
  blink: ['..oo.oo..', '.oggoggo.', '.ogggggo.', 'ogGgggGgo', 'olllllllo', '.oo...oo.'],
  air: ['..oo.oo..', '.oepoepo.', '.ogggggo.', 'ogGgggGgo', 'olllllllo', 'oo.....oo'],
};
const hopArc = (a, b, s, h) => [a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s - h * 4 * s * (1 - s)];

function frog(R, e, pads, spec, light) {
  const { age, dur, p } = e;
  const feet = (pad) => [pad.x, pad.y - 1];
  const enter = spec.enterS;
  const leave = spec.leaveS;
  const hop = spec.hopS;
  let pos;
  let air = false;
  let a = e.alpha;
  let ripple = null;
  if (e.still) {
    pos = feet(pads[p.stops[0].pad]);
  } else {
    let idx = 0;
    for (let i = 0; i < p.stops.length; i++) if (age >= p.stops[i].t) idx = i;
    const cur = pads[p.stops[idx].pad];
    pos = feet(cur);
    if (age < enter) {
      const s = age / enter;
      pos = hopArc([cur.x - cur.w - 3, cur.y + 4], feet(cur), s, 7);
      air = s < 0.8;
      a *= clamp01(s * 5);
      ripple = [cur.x - cur.w - 3, cur.y + 5, age];
    } else if (age > dur - leave) {
      const s = (age - (dur - leave)) / leave;
      pos = hopArc(feet(cur), [cur.x + cur.w + 3, cur.y + 4], s, 7);
      air = s < 0.8 && s > 0.05;
      a *= 1 - smooth((s - 0.55) / 0.45);
      ripple = [cur.x + cur.w + 3, cur.y + 5, s * leave - 0.45];
    } else if (idx > 0 && age < p.stops[idx].t + hop) {
      const prev = pads[p.stops[idx - 1].pad];
      const s = (age - p.stops[idx].t) / hop;
      pos = hopArc(feet(prev), feet(cur), s, 6);
      air = true;
    }
    if (!air && age >= enter) {
      for (const r of p.ripples) if (age >= r && age < r + 1.8) ripple = [cur.x, cur.y + 3, age - r, true];
    }
  }
  const blinking = !air && !e.still && p.blinks.some((b) => age >= b && age < b + 0.2);
  const rows = air ? FROG.air : blinking ? FROG.blink : FROG.sit;
  const pal = {};
  for (const k of Object.keys(FROG_PAL)) pal[k] = lit(FROG_PAL[k], light);
  if (ripple && ripple[2] >= 0) {
    const k = ripple[2] / (ripple[3] ? 1.8 : 1.2);
    if (k < 1) {
      ring(R, Math.round(ripple[0]), Math.round(ripple[1]), 3 + k * (ripple[3] ? 14 : 9), 0.45 * (1 - k) * a, RING);
    }
  }
  blit(R, Math.round(pos[0]) - 4, Math.round(pos[1]) - 5, rows, pal, a);
}

// ---------------------------------------------------------------- jumping fish
const FISH_BODY = [hex('#e9f0ff'), hex('#b9c6ea'), hex('#8794c6')];
const AIR_S = 0.9; // seconds in the air

function fishJump(R, e, light) {
  const { age, p, alpha } = e;
  const x0 = p.x;
  const y0 = p.y;
  const ringA = alpha * 0.5;
  // rings: where it left (grow and fade) and where it comes back
  const k0 = age / 1.4;
  if (k0 < 1) ring(R, x0, y0 + 1, 1 + k0 * 9, ringA * (1 - k0), RING);
  const xl = Math.round(x0 + p.dir * p.dx);
  if (age > AIR_S) {
    const k1 = (age - AIR_S) / 1.6;
    if (k1 < 1) {
      ring(R, xl, y0 + 1, 1 + k1 * 11, ringA * (1 - k1), RING);
      ring(R, xl, y0 + 1, 1 + Math.max(0, k1 - 0.25) * 7, ringA * 0.7 * (1 - k1), RING);
    }
  }
  if (age < AIR_S) {
    const s = age / AIR_S;
    const x = x0 + p.dir * p.dx * s;
    const y = y0 - p.h * 4 * s * (1 - s);
    const vx = p.dir * p.dx;
    const vy = -p.h * 4 * (1 - 2 * s);
    const n = Math.hypot(vx, vy);
    const ux = vx / n;
    const uy = vy / n;
    for (let i = 0; i < 5; i++) {
      const c = lit(FISH_BODY[i === 0 ? 0 : i < 3 ? 1 : 2], light * 0.95);
      R.pxA(Math.round(x - ux * i), Math.round(y - uy * i), c, alpha);
    }
    const tc = lit(FISH_BODY[2], light);
    R.pxA(Math.round(x - ux * 5 - uy), Math.round(y - uy * 5 + ux), tc, alpha * 0.8);
    R.pxA(Math.round(x - ux * 5 + uy), Math.round(y - uy * 5 - ux), tc, alpha * 0.8);
    // drops where it leaves and where it falls back
    const drop = (cx, t) => {
      if (t < 0 || t > 0.3) return;
      for (let q = -2; q <= 2; q += 2) R.pxA(cx + q, Math.round(y0 - Math.sin((t / 0.3) * Math.PI) * (3 - Math.abs(q) * 0.6)), RING, alpha * 0.8);
    };
    drop(x0, age);
    drop(xl, age - (AIR_S - 0.3));
  }
}

// ---------------------------------------------------------------- shooting star
const STAR_HEAD = [255, 251, 232];
const STAR_TAIL = [214, 222, 255];

export function paintSkyEvents(R, events) {
  for (const e of events) {
    if (e.kind !== 'star') continue;
    const { p, age, u } = e;
    const env = Math.pow(Math.sin(Math.PI * u), 0.7) * e.alpha;
    const hx = p.x0 + p.vx * age;
    const hy = p.y0 + p.vy * age;
    const n = Math.hypot(p.vx, p.vy);
    const ux = p.vx / n;
    const uy = p.vy / n;
    for (let i = 0; i < p.len; i++) {
      const f = 1 - i / p.len;
      R.pxA(Math.round(hx - ux * i), Math.round(hy - uy * i), i === 0 ? STAR_HEAD : STAR_TAIL, env * (i === 0 ? 1 : 0.8 * f * f));
    }
  }
}

export function paintBehind(R, events, light) {
  for (const e of events) if (e.kind === 'jump') fishJump(R, e, light);
}

/** @param {object} ctx { pads, frog (the frog spec of data/critters.js) } */
export function paintFront(R, events, light, ctx) {
  for (const e of events) {
    if (e.kind === 'dragon') dragonflies(R, e, light);
    else if (e.kind === 'frog') frog(R, e, ctx.pads, ctx.frogSpec, light);
    else flyers(R, e, light);
  }
}

export const _sprites = { BIRD, OWL, BAT, FROG };
