// Fishing state machine. Pure: no DOM, no clock, no Math.random; the rng is injected.
//
// phases: idle -> charging -> casting -> waiting -> bite -> reeling -> caught -> idle
//         casting lasts config.cast.landS (swing + flight), the same 1.35 s the picture shows
//         waiting --press--> retracting (0.6 s) -> idle      (line pulled back, nothing counted)
//         bite --holdS elapsed--> waiting (event 'escaped', `returning` = species id) -> bite again (same fish)
//
// step(state, dt, actions, ctx, rng) -> { state, events }
//   actions: { down?: boolean, up?: boolean }   (edges of the single primary button; down is handled before up)
//   ctx:     { config, species, phase, weather, holdS, book?, pity? }   holdS = seconds the fish waits, or null = no limit;
//            book / pity (J2) feed the luck protection; the draw returns the new counters in the `bite` event
//   rng:     { fish, size }   two functions returning floats in [0,1)

import { between } from './rng.js';
import { drawFish } from './fishDraw.js';
import { rollSize } from './sizeRoll.js';

const EPS = 1e-9;
export const RETRACT_S = 0.6;

/** Charge power at `t` seconds of holding: a gentle sine from 0 to 1 and back (never fails, never overshoots). */
export function chargePower(t, cast) {
  return 0.5 - 0.5 * Math.cos(cast.powerRate * t);
}

export function createFishingState() {
  return {
    phase: 'idle',
    t: 0, // seconds spent in the current phase (game time, frozen while paused)
    power: 0, // 0..1, set while charging / at release
    distPx: 0, // landing distance of the last cast (visual only)
    waitS: 0, // drawn wait before the next bite
    fish: null, // { id, sizeCm } once a bite is drawn; kept while the fish is away
    returning: null, // species id of the fish that left and will come back (not saved)
    firstCastDone: false, // the first wait of the session is shorter
    casts: 0,
  };
}

function go(s, phase) {
  s.phase = phase;
  s.t = 0;
}

function enterWaiting(s, config, rng, range) {
  go(s, 'waiting');
  s.waitS = between(rng.fish, range);
}

export function step(state, dt, actions, ctx, rng) {
  const s = { ...state };
  const events = [];
  const { config } = ctx;
  const a = actions || {};

  // 1) input edges
  if (a.down) {
    if (s.phase === 'idle') {
      go(s, 'charging');
      s.power = 0;
    } else if (s.phase === 'waiting') {
      // pull the line back: the fish that left is forgotten, nothing is counted
      s.fish = null;
      s.returning = null;
      go(s, 'retracting');
      events.push({ type: 'retract' });
    } else if (s.phase === 'bite') {
      s.returning = null; // the fish that came back is being reeled in: it is no longer "away" (else the NEXT bite would wait for a fish that is gone)
      go(s, 'reeling');
      events.push({ type: 'reel' });
    } else if (s.phase === 'caught') {
      s.fish = null;
      s.returning = null;
      go(s, 'idle');
      events.push({ type: 'released' });
    }
  }
  if (a.up && s.phase === 'charging') {
    const { tapMaxS, minDistPx, maxDistPx } = config.cast;
    s.power = s.t < tapMaxS ? 0.5 : chargePower(s.t, config.cast);
    s.distPx = Math.round(minDistPx + s.power * (maxDistPx - minDistPx));
    s.casts += 1;
    go(s, 'casting');
    events.push({ type: 'cast', power: s.power, distPx: s.distPx });
  }

  // 2) time
  s.t += dt;
  switch (s.phase) {
    case 'charging':
      s.power = chargePower(s.t, config.cast);
      break;
    case 'casting':
      if (s.t + EPS >= config.cast.landS) {
        const range = s.firstCastDone ? config.bite.waitS : config.bite.firstWaitS;
        s.firstCastDone = true;
        enterWaiting(s, config, rng, range);
        events.push({ type: 'landed' });
      }
      break;
    case 'waiting':
      if (s.t + EPS >= s.waitS) {
        if (s.returning && s.fish) {
          // the same fish comes back: no new draw, no size roll
          go(s, 'bite');
          events.push({ type: 'bite', returning: true, speciesId: s.fish.id });
        } else {
          const drawn = drawFish(ctx.species, ctx, config.paceSets[config.pace], rng.fish, { book: ctx.book, pity: ctx.pity });
          if (!drawn) {
            enterWaiting(s, config, rng, config.bite.waitS); // nothing can bite now: wait again
          } else {
            const species = drawn.species;
            s.fish = { id: species.id, sizeCm: rollSize(species.sizeCm, rng.size()) };
            go(s, 'bite');
            events.push({ type: 'bite', returning: false, speciesId: species.id, pity: drawn.pity, guaranteed: drawn.guaranteed });
          }
        }
      }
      break;
    case 'bite':
      if (ctx.holdS != null && s.t + EPS >= ctx.holdS) {
        s.returning = s.fish.id;
        enterWaiting(s, config, rng, config.bite.returnWaitS);
        events.push({ type: 'escaped', speciesId: s.fish.id });
      }
      break;
    case 'reeling':
      if (s.t + EPS >= config.reel.durationS) {
        go(s, 'caught');
        events.push({ type: 'caught', speciesId: s.fish.id, sizeCm: s.fish.sizeCm });
      }
      break;
    case 'retracting':
      if (s.t + EPS >= RETRACT_S) go(s, 'idle');
      break;
    default:
      break;
  }
  return { state: s, events };
}
