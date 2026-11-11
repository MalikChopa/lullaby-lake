// The finale scene state (J12-B), pure: no DOM, no three.js, no clock of its own (the caller ticks it). While the finale dialogue is open the camera drifts slowly over
// the lake and the soft lights of the lake bloom one after the other; with reduced motion nothing moves and the lights are all on, still. The dialogue itself carries
// the text, so the scene needs no input: Escape closes the dialogue, which ends the scene. After it the game simply goes on (no locked state).

import { FINALE } from '../data/boat.js';
import { COUPLET_COUNT } from '../data/story.js';

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const smooth = (a) => a * a * (3 - 2 * a);

/** How many lights of the lake the finale has lit at time t (0..count, a fraction = the last one fading in). Reduced motion: all, at once. */
export function lightsLit(t, reduced, count = COUPLET_COUNT, everyS = FINALE.lightEveryS) {
  if (reduced) return count;
  return Math.max(0, Math.min(count, t / everyS));
}

/** The camera target at time t: along `path` (points [x, y, z]) in `driftS` seconds, eased; the last point is held. Reduced motion: no drift (the first point). */
export function cameraTarget(t, reduced, path = FINALE.path, driftS = FINALE.driftS) {
  if (reduced || path.length < 2) return path[0].slice();
  const u = clamp01(t / driftS) * (path.length - 1);
  const i = Math.min(path.length - 2, Math.floor(u));
  const k = smooth(u - i);
  return [0, 1, 2].map((a) => path[i][a] + (path[i + 1][a] - path[i][a]) * k);
}

export function createFinale({ reduced = () => false } = {}) {
  let active = false;
  let t = 0;
  let fade = 0; // 1 while the scene plays, then back to 0 in ~3 s (the bloom of the lights relaxes)
  let runs = 0;
  return {
    start() {
      active = true;
      t = 0;
      runs++;
      return true;
    },
    /** reason: 'done' | 'later' */
    end() {
      const was = active;
      active = false;
      return was;
    },
    tick(dt) {
      if (active) t += dt;
      const target = active ? 1 : 0;
      fade += Math.max(-dt / 3, Math.min(dt / 1.2, target - fade));
    },
    get active() {
      return active;
    },
    get t() {
      return t;
    },
    /** 0..1 strength of the bloom (lights bigger and brighter). */
    get bloom() {
      return smooth(clamp01(fade));
    },
    get runs() {
      return runs;
    },
    lit: () => lightsLit(t, reduced()),
    camera: () => cameraTarget(t, reduced()),
  };
}
