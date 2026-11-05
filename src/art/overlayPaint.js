// Everything that moves or glows on top of the baked layers, drawn into the frame every time (ported from maquette/v2/scene.js):
// post shadows, lantern and window light, chimney smoke, birds, rod, line, float, ripples, splash, fireflies, fog veils, rain.
// The look it draws (lamp, cabin, flies, birds, veil, rain, smoke) comes from core/sky.js (numbers that change with the clock and
// the weather) or from a pinned mood of data/palettes.js: booleans count as 0 / 1.
// All coordinates are rounded to whole pixels (no antialiasing). Pure: the state comes in as arguments.

import { W, H, HOR } from './sceneBake.js';
import { HAND, LANDING_Y, RING_DY } from './anglerPaint.js';

const POSTS = [10, 62, 114, 166, 218];
const LINE_COLOR = [255, 246, 232];

/** Deterministic extras (fireflies, raindrops) built once per scene from a seeded random function. */
export function makeParticles(rnd) {
  const flies = [];
  for (let i = 0; i < 14; i++) flies.push({ x: rnd() * W, y: HOR - 10 + rnd() * 100, p: rnd() * 6, s: 0.2 + rnd() * 0.4 });
  const drops = [];
  for (let i = 0; i < 150; i++) drops.push({ x: rnd() * W, y: rnd() * H, v: 150 + rnd() * 90, l: 3 + ((rnd() * 3) | 0) });
  return { flies, drops };
}

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

/** Draws the first half of the dynamic layers: post shadows (before the foreground is drawn over them). */
export function paintShadows(R, time, still) {
  const sh = [18, 12, 42];
  for (const x of POSTS) R.rcA(x + (still ? 0 : Math.round(Math.sin(time * 1.4 + x))), 213, 7, 22, sh, 0.34);
  R.rcA(0, 214, 242, 7, sh, 0.34);
}

/** A flat ellipse of ripple, one pixel thick (also used by the creatures of critterPaint.js). */
export function ring(R, cx, cy, r, a, rgb) {
  const w = Math.round(r);
  const h = Math.max(1, Math.round(r * 0.28));
  for (let x = -w; x <= w; x++) {
    const yy = Math.round(Math.sqrt(Math.max(0, 1 - (x * x) / (w * w + 0.01))) * h);
    R.pxA(cx + x, cy + yy, rgb, a);
    R.pxA(cx + x, cy - yy, rgb, a);
  }
}
const RING_RGB = hex('#fff3dc');

/** Soft glow in four hard-edged steps (no dither). */
function glow(R, cx, cy, rad, a, rgb) {
  for (let k = 0; k < 4; k++) {
    const r = Math.round(rad * (1 - k * 0.22));
    for (let dy = -r; dy <= r; dy++) {
      const hw = Math.floor(Math.sqrt(r * r - dy * dy));
      R.rcA(cx - hw, cy + dy, hw * 2 + 1, 1, rgb, a * 0.2);
    }
  }
}

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const WARM = [255, 216, 132];

/** Window glow and lit panes of the cabin, and the lit lantern, drawn over the baked (dark) ones with an opacity that follows the light. */
function paintLights(R, P) {
  const bx = 392;
  const by = HOR - 18;
  const cabin = P.cabin || 0;
  if (cabin > 0.02) {
    for (let k = 3; k >= 1; k--) {
      const r = 5 + k * 2;
      const alpha = 0.07 * k * Math.min(1, cabin);
      for (let dy = -r; dy <= r; dy++) {
        if (by + 14 + dy > by + 23 || by + 14 + dy < by + 3) continue;
        const hw = Math.floor(Math.sqrt(r * r - dy * dy));
        const xa = Math.max(bx + 2, bx + 14 - hw);
        const xb = Math.min(bx + 45, bx + 14 + hw);
        R.rcA(xa, by + 14 + dy, xb - xa + 1, 1, WARM, alpha);
      }
    }
    const a = clamp01((cabin - 0.2) / 0.4);
    if (a > 0.01) {
      const glass = hex('#ffd884');
      for (const [x, y] of [[bx + 8, by + 10], [bx + 15, by + 10], [bx + 8, by + 15], [bx + 15, by + 15]]) R.rcA(x, y, 5, 4, glass, a);
      R.rcA(bx + 8, by + 10, 5, 2, hex('#ffefb0'), a);
    }
  }
  const la = clamp01(((P.lamp || 0) - 0.4) / 0.4);
  if (la > 0.01) {
    const body = hex('#ffe29a');
    R.rcA(183, 156, 3, 11, body, la);
    R.rcA(189, 156, 3, 11, body, la);
    R.rcA(183, 156, 9, 3, hex('#fff6d0'), la);
  }
}

/** Mist veil colour: the pinned mood's own, or pale pink by day fading to a deep blue-grey as the light drops. */
function veilColor(P) {
  if (P.fogColor) return hex(P.fogColor);
  const k = clamp01(((P.light ?? 1) - 0.25) / 0.65);
  const lo = [34, 38, 76];
  const hi = [244, 228, 220];
  return [lo[0] + (hi[0] - lo[0]) * k, lo[1] + (hi[1] - lo[1]) * k, lo[2] + (hi[2] - lo[2]) * k];
}

/**
 * @param {object} R raster over the frame  @param {object} P look (see above)  @param {object} particles makeParticles()
 * @param {{time:number, still:boolean, cast:object, splash:?{age:number,x:number}}} s
 *   cast = { tip:[x,y], end:[x,y]|null, sag:number, float:boolean, rings:0|1|2 }  (see render/angler.js)
 */
export function paintOverlay(R, P, particles, s) {
  const { still } = s;
  const tm = still ? 0 : s.time;

  if (P.live) paintLights(R, P);

  // lantern glow: soft, flickers a little
  const fl = still ? 1 : 0.92 + 0.08 * Math.sin(tm * 6);
  if (P.lamp > 0) glow(R, 187, 152, 19, 0.42 * P.lamp * fl, hex('#ffd884'));

  // chimney smoke
  const smoke = hex('#e6d6ea');
  for (let i = 0; i < 6; i++) {
    const age = ((still ? 0 : tm * 0.16) + i / 6) % 1;
    const x = 435 + Math.sin(age * 6 + i) * 3 + age * 14;
    const y = HOR - 48 - age * 38;
    const sz = 2 + age * 5;
    R.rcA((x - sz / 2) | 0, y | 0, sz | 0, Math.max(1, (sz * 0.7) | 0), smoke, (1 - age) * P.smoke);
  }

  // birds (a fixed place when motion is reduced)
  const birdA = P.birds === true ? 1 : P.birds || 0;
  if (birdA > 0.02) {
    const bird = hex('#4a3a6a');
    for (let i = 0; i < 3; i++) {
      const x = ((still ? 60 : tm * 5) + i * 110 + 40) % 560 - 40;
      const y = 34 + i * 14 + Math.sin(tm + i) * 2;
      const f = Math.floor(tm * 5 + i) % 2;
      const xi = x | 0;
      const yi = y | 0;
      R.rcA(xi, yi, 2, 1, bird, birdA);
      R.rcA(xi + 2, yi + (f ? -1 : 1), 2, 1, bird, birdA);
      R.rcA(xi - 2, yi + (f ? -1 : 1), 2, 1, bird, birdA);
    }
  }

  // rod (a curve from the hand to the tip), line, float, ripples
  const c = s.cast;
  const tip = c.tip;
  {
    const cx = HAND[0] + (tip[0] - HAND[0]) * 0.55;
    const cy = HAND[1] + (tip[1] - HAND[1]) * 0.5 - 9;
    const ink = [74, 50, 64];
    const lit = [138, 106, 112];
    const at = (u) => [(1 - u) * (1 - u) * HAND[0] + 2 * (1 - u) * u * cx + u * u * tip[0], (1 - u) * (1 - u) * HAND[1] + 2 * (1 - u) * u * cy + u * u * tip[1]];
    for (let i = 0; i <= 60; i++) {
      const p = at(i / 60);
      R.rcr(p[0] | 0, p[1] | 0, 1, 1, ink);
    }
    for (let i = 0; i <= 60; i += 3) {
      const p = at(i / 60);
      R.rcr(p[0] | 0, (p[1] - 1) | 0, 1, 1, lit);
    }
  }
  if (c.end) {
    const [fx, fy] = c.end;
    const N = 70;
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      R.rcr((tip[0] + (fx - tip[0]) * u) | 0, (tip[1] + (fy - tip[1]) * u + Math.sin(u * Math.PI) * c.sag) | 0, 1, 1, LINE_COLOR);
    }
    const xi = Math.round(fx);
    const yi = Math.round(fy);
    R.rcr(xi - 1, yi - 4, 3, 4, LINE_COLOR);
    R.rcr(xi - 1, yi, 3, 3, hex('#e0605a'));
    R.rcr(xi, yi - 6, 1, 2, LINE_COLOR);
    if (c.rings > 0) {
      const rp = still ? 0 : (tm * 0.8) % 1;
      ring(R, xi, LANDING_Y + RING_DY, 5 + rp * 16, 0.5 * (1 - rp), RING_RGB);
      ring(R, xi, LANDING_Y + RING_DY, 2 + ((rp + 0.5) % 1) * 16, 0.38 * (1 - ((rp + 0.5) % 1)), RING_RGB);
      if (c.rings === 2) ring(R, xi, LANDING_Y + RING_DY, 4 + ((tm * 2) % 1) * 26, 0.5, RING_RGB);
    }
  }
  // splash where the float lands
  if (s.splash) {
    const st = s.splash.age;
    const lx = s.splash.x;
    if (st >= 0 && st < 0.7) {
      const r = 2 + st * 30;
      ring(R, lx, LANDING_Y + RING_DY, r, 0.7 * (1 - st / 0.7), RING_RGB);
      ring(R, lx, LANDING_Y + RING_DY, r * 0.55, 0.7 * (1 - st / 0.7), RING_RGB);
      if (st < 0.35 && !still) {
        for (let k = -2; k <= 2; k++) R.rcr(lx + k * 2, (LANDING_Y + 2 - (1 - Math.abs(k) * 0.3) * Math.sin((st / 0.35) * Math.PI) * 9) | 0, 1, 1, LINE_COLOR);
      }
    }
  }

  // fireflies (dusk, night, fog)
  const nFlies = Math.min(particles.flies.length, Math.ceil(P.flies - 0.001));
  for (let i = 0; i < nFlies; i++) {
    const fadeIn = Math.min(1, P.flies - i);
    const f = particles.flies[i];
    const x = (f.x + (still ? 0 : Math.sin(tm * f.s + f.p) * 10)) % W;
    const y = f.y + (still ? 0 : Math.cos(tm * f.s * 0.8 + f.p) * 5);
    const a = (still ? 0.8 : Math.max(0, Math.sin(tm * 1.2 + f.p * 2) * 0.6 + 0.5)) * fadeIn;
    if (a > 0.1) {
      const glowC = hex('#ffe69a');
      R.rcA((x - 1) | 0, y | 0, 3, 1, glowC, a * 0.28);
      R.rcA(x | 0, (y - 1) | 0, 1, 3, glowC, a * 0.28);
      R.pxA(x | 0, y | 0, hex('#fffbd0'), a);
    }
  }

  // mist: soft veils that drift sideways (still when motion is reduced)
  if (P.fog > 0.01) {
    const col = veilColor(P);
    for (let y = HOR - 46; y < HOR + 60; y += 2) {
      const cc = 1 - Math.abs(y - (HOR + 6)) / (y < HOR + 6 ? 52 : 56);
      if (cc <= 0) continue;
      if (still) {
        R.rcA(0, y, W, 2, col, P.fog * cc * (0.75 + 0.25 * Math.sin(y * 0.05)));
      } else {
        for (let x = 0; x < W; x += 12) {
          const wave = 0.5 + 0.5 * Math.sin(x * 0.021 + tm * 0.22 + y * 0.07) * Math.sin(x * 0.009 - tm * 0.13 + y * 0.03);
          R.rcA(x, y, 12, 2, col, P.fog * cc * (0.55 + 0.45 * wave));
        }
      }
    }
  }

  // rain: streaks and ripples, as many as the intensity says
  const rainK = P.rain === true ? 1 : P.rain || 0;
  if (rainK > 0.02) {
    const streak = hex('#d4dcea');
    const nDrops = Math.round(particles.drops.length * rainK);
    for (let i = 0; i < nDrops; i++) {
      const d = particles.drops[i];
      const y = still ? d.y : (d.y + tm * d.v) % (H + 10);
      const x = (d.x - tm * d.v * 0.18 + W * 4) % W;
      R.rcA(x | 0, y | 0, 1, d.l, streak, 0.55);
    }
    const rr = hex('#e6ecf6');
    const nRip = Math.round(10 * rainK);
    for (let i = 0; i < nRip; i++) {
      const k = (tm * 2 + i * 0.37) % 1;
      const x = (i * 137 + Math.floor(tm * 2 + i) * 53) % W;
      const y = HOR + 12 + ((i * 53 + Math.floor(tm * 2 + i) * 29) % 100);
      ring(R, x, y, 1 + k * 4, 0.5 * (1 - k), rr);
    }
  }
}
