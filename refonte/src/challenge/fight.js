// The fight with a fish (J11), pure: no DOM, no clock, no Math.random. Time comes in as `dt`, chance as an injected rng.
// A vertical bar (0 = bottom, 1 = top). The fish's zone is a band that drifts along it; the player's marker rises while the action is HELD and falls when it
// is released (gentle physics, a little "magnet" inside the band). Progress fills inside the band and drains slowly outside. Win = progress 1. The fish's
// patience (generous, never shown) running out = the fish swims off and comes back later; letting go = the same. Nothing is ever lost.

import { FIGHT } from '../data/challenge.js';
import { condFactor } from './wear.js';

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

/** Ease (0..max) from the gear: rod tier, float comfort, line condition (a worn line / rod is a little weaker). gear = { rod, float, lineCond, rodCond }. */
export function easeOf(gear) {
  const E = FIGHT.ease;
  const e = E.rodPerTier * Math.max(0, (gear.rod || 1) - 1) * condFactor(gear.rodCond ?? 100) + (gear.float ? E.float[gear.float] || 0 : 0) + E.line * condFactor(gear.lineCond ?? 100);
  return clamp(e, 0, E.max);
}

/**
 * The parameters of one fight from the species (rarity, size range), the size of this fish and the gear. opts: { reduced, patienceMul }.
 * Rarer and bigger fish: a narrower and faster band, more sway, more time in the band to win. Gear (ease) widens and slows it.
 */
export function fightParams(sp, cm, gear, opts = {}) {
  const base = FIGHT.byRarity[sp.rarity] || FIGHT.byRarity[1];
  const { min, max } = sp.sizeCm;
  const t = max > min ? clamp((cm - min) / (max - min), 0, 1) : 0.5;
  const hard = 1 + FIGHT.sizeHard * t;
  const ease = easeOf(gear);
  const calm = opts.reduced ? FIGHT.reducedSpeedMul : 1;
  const bandW = clamp((base.bandW / hard) * (1 + ease), 0.12, 0.8);
  const speed = base.speed * hard * (1 - ease) * calm;
  const wobble = base.wobble * hard * (opts.reduced ? 0.5 : 1);
  const fillS = base.fillS * (1 + 0.5 * FIGHT.sizeHard * t);
  const patienceS = (fillS * FIGHT.patience.mul + FIGHT.patience.extraS) * (opts.patienceMul || 1);
  return { rarity: sp.rarity, sizeT: t, bandW, speed, wobble, fillS, retarget: base.retarget, patienceS, ease };
}

/** A single number for "how hard": higher = harder (monotonic in rarity, size and the lack of ease). Used by tests and the simulation. */
export const difficulty = (p) => (1 - p.bandW) * 0.5 + p.speed * 1.5 + p.wobble * 2 + (p.fillS / 10) * 0.15;

/** Where the marker is relative to the band: 'in' | 'high' | 'low'. */
export const cueOf = (pos, c, w) => (pos > c + w / 2 ? 'high' : pos < c - w / 2 ? 'low' : 'in');

/**
 * A fight. `rng` returns floats in [0,1). `auto` = the automatic mode (the marker follows the band, the fight resolves on its own).
 * step(dt, hold) advances (dt may be any size; it is cut into steps of at most 1/60 s). Read the fields at any time:
 *   status 'run' | 'won' | 'lost' | 'left'   pos, vel (marker)   c, w (band centre and height)   progress (0..1)   cue   t   outside (seconds outside the band)
 */
export function createFight(params, rng, { auto = false } = {}) {
  const P = FIGHT.physics;
  const w = params.bandW;
  const lo = w / 2;
  const hi = 1 - w / 2;
  const phase = rng() * Math.PI * 2;
  const F = {
    params,
    auto,
    status: 'run',
    t: 0,
    pos: 0.5,
    vel: 0,
    base: 0.5,
    c: 0.5,
    w,
    target: 0.5,
    nextAt: 0.4,
    progress: 0,
    outside: 0,
    cue: 'in',
    perfect: false,
  };
  const pick = (range) => range[0] + (range[1] - range[0]) * rng();
  function sub(dt, hold) {
    F.t += dt;
    // the band drifts towards a new place now and then, with a small sway
    if (F.t >= F.nextAt) {
      let tg = lo + (hi - lo) * rng();
      if (Math.abs(tg - F.base) < 0.18) tg = clamp(F.base + (tg >= F.base ? 0.18 : -0.18), lo, hi); // always a visible move
      F.target = tg;
      F.nextAt = F.t + pick(params.retarget);
    }
    const want = clamp((F.target - F.base) * 2, -params.speed, params.speed);
    F.base = clamp(F.base + want * dt, lo, hi);
    F.c = clamp(F.base + params.wobble * Math.sin(F.t * 2.3 + phase), lo, hi);
    const inBand = Math.abs(F.pos - F.c) <= w / 2;
    if (auto) {
      F.pos += (F.c - F.pos) * (1 - Math.exp(-FIGHT.auto.followRate * dt));
      F.vel = 0;
    } else {
      const a = hold ? P.up : -P.down;
      F.vel += (a - P.drag * (inBand ? 1 + P.assist : 1) * F.vel) * dt;
      F.pos += F.vel * dt;
      if (F.pos < 0) {
        F.pos = 0;
        F.vel = Math.max(0, F.vel);
      } else if (F.pos > 1) {
        F.pos = 1;
        F.vel = Math.min(0, F.vel);
      }
    }
    const inNow = Math.abs(F.pos - F.c) <= w / 2;
    F.cue = cueOf(F.pos, F.c, w);
    if (auto) {
      F.progress += dt / (params.fillS * FIGHT.auto.fillMul); // the automatic mode always makes progress: it cannot fail
    } else if (inNow) {
      F.progress += dt / params.fillS;
    } else {
      F.outside += dt;
      if (F.t > FIGHT.graceS) F.progress = Math.max(0, F.progress - (FIGHT.drain * dt) / params.fillS);
    }
    if (F.progress >= 1) {
      F.progress = 1;
      F.status = 'won';
      F.perfect = !auto && F.outside <= FIGHT.perfect.maxOutsideShare * F.t;
    } else if (!auto && F.t >= params.patienceS) F.status = 'lost';
  }
  F.step = (dt, hold) => {
    let left = dt;
    while (left > 1e-9 && F.status === 'run') {
      const d = Math.min(1 / 60, left);
      sub(d, hold);
      left -= d;
    }
    return F.status;
  };
  /** The player lets the fish go (no penalty). */
  F.giveUp = () => {
    if (F.status === 'run') F.status = 'left';
  };
  /** Switches the automatic mode on mid-fight (the marker then glides to the band). */
  F.setAuto = (v) => {
    F.auto = !!v;
    auto = !!v;
  };
  return F;
}

/**
 * A simulated player (for the balance simulation and the tests): looks at the band with a reaction delay and some noise, and holds or releases to
 * bring the marker to where the band was `react` seconds ago. skill = { react (s), noise (bar heights), dead (dead zone) }.
 */
export function simulateFight(params, rng, skill, { auto = false, maxS = 120 } = {}) {
  const F = createFight(params, rng, { auto });
  const lag = Math.max(1, Math.round(skill.react * 60));
  const seen = [];
  let hold = false;
  let n = 0;
  while (F.status === 'run' && F.t < maxS) {
    seen.push(F.c);
    if (n % 6 === 0) {
      const c = seen[Math.max(0, seen.length - 1 - lag)] + (rng() - 0.5) * 2 * skill.noise;
      // aim a little ahead of the marker's own motion (it glides on): hold when below the aim, release when above
      const ahead = F.pos + F.vel * 0.25;
      hold = ahead < c - skill.dead ? true : ahead > c + skill.dead ? false : F.vel < 0;
    }
    F.step(1 / 60, hold);
    n++;
  }
  if (F.status === 'run') F.giveUp();
  return F;
}
