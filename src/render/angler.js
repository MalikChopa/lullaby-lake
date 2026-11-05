// Turns the fishing state into the drawing parameters of the rod, line and float (art/overlayPaint.js reads them).
// Same gestures and timings as the approved mock-up; the timings live in data/config.js (cast.*) and the logical phase `casting`
// lasts cast.landS = swing release + flight, so the picture and the core end together. No PixiJS, no DOM: numbers in, numbers out.

import { IDLE_TIP, BACK_TIP, FWD_TIP, LANDING_Y, landingPoint } from '../art/anglerPaint.js';

export { landingPoint };

const lerp = (a, b, u) => a + (b - a) * u;
const clamp01 = (u) => (u < 0 ? 0 : u > 1 ? 1 : u);
const ease = (u) => u * u * (3 - 2 * u);
export const RETURN_S = 0.5; // the rod eases from "forward" back to rest after a cast

/**
 * @param f fishing state ({phase, t, power, distPx, casts, ...}), @param t real seconds (animation only, ripples and bob)
 * @param config data/config.js
 * @returns {{tip:number[], end:?number[], sag:number, rings:0|1|2}}
 *   tip = rod tip; end = where the line ends (the float hangs there), null = no line; sag = slack of the line (0 = taut);
 *   rings = ripples around the float (1 waiting, 2 bite)
 */
export function computeAnglerParams(f, t, reduced, config) {
  const cast = config.cast;
  const bob = reduced ? 0 : Math.round(Math.sin(t * 1.6));
  const L = landingPoint(f.distPx || (cast.minDistPx + cast.maxDistPx) / 2, cast);
  let tip = IDLE_TIP;
  let end = null;
  let sag = 0;
  let rings = 0;

  switch (f.phase) {
    case 'charging': {
      const k = ease(clamp01(f.t / cast.leanS));
      tip = [lerp(IDLE_TIP[0], BACK_TIP[0], k) - k * f.power * 5, lerp(IDLE_TIP[1], BACK_TIP[1], k)];
      end = [tip[0], tip[1] + 24];
      break;
    }
    case 'casting': {
      const tc = f.t;
      const k = ease(clamp01(tc / cast.swingS));
      tip = [lerp(BACK_TIP[0], FWD_TIP[0], k), lerp(BACK_TIP[1], FWD_TIP[1], k)];
      const u = clamp01((tc - cast.releaseAtS) / cast.flightS);
      if (tc < cast.releaseAtS) {
        end = [tip[0], tip[1] + 24];
      } else {
        const ux = 1 - Math.pow(1 - u, 1.7);
        end = [lerp(FWD_TIP[0], L.x, ux), lerp(FWD_TIP[1], L.y, ease(u)) - L.height * 4 * u * (1 - u)];
      }
      break;
    }
    case 'waiting':
      tip = FWD_TIP;
      end = [L.x, L.y + bob];
      sag = -3;
      rings = 1;
      break;
    case 'bite':
      tip = FWD_TIP;
      end = [L.x, L.y + (reduced ? 5 : Math.sin(t * 10) > 0 ? 3 : 5)];
      sag = -3;
      rings = 2;
      break;
    case 'reeling': {
      const u = ease(clamp01(f.t / config.reel.durationS));
      tip = FWD_TIP;
      end = [lerp(L.x, tip[0], u), lerp(L.y, tip[1], u) - 14 * 4 * u * (1 - u)];
      break;
    }
    case 'retracting': {
      const u = ease(clamp01(f.t / 0.6));
      tip = FWD_TIP;
      end = [lerp(L.x, tip[0] + 1, u), lerp(L.y, tip[1] + 24, u) - 10 * 4 * u * (1 - u)];
      break;
    }
    case 'caught':
      tip = FWD_TIP;
      break; // the fish is shown on the card: no line
    default: {
      // idle: after a cast the rod eases back to rest; at the very start it simply rests
      const k = f.casts > 0 ? ease(clamp01(f.t / RETURN_S)) : 1;
      tip = [lerp(FWD_TIP[0], IDLE_TIP[0], k), lerp(FWD_TIP[1], IDLE_TIP[1], k)];
      end = [tip[0], tip[1] + 26 + bob];
    }
  }
  return { tip, end, sag, rings, landX: L.x, landY: LANDING_Y };
}
