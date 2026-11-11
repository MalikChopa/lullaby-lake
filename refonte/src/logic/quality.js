// Quality tier choice. Pure: frame intervals (ms) are fed in, the tier comes out. No DOM, no clock.
//   ?q=low|mid|high -> fixed tier ('ultra', removed on 2026-11-10 at the owner's request, is read as 'high': old saves and links keep working).
//     ?q=auto (default) -> a short probe picks the tier, then the tier only steps DOWN, one step at a time,
//   when the frame interval stays high for `holdS`, with a cooldown after each change. It never steps up by itself: no flapping.

import { AUTO_QUALITY, TIER_ORDER, TIER_ALL } from '../data/params.js';

/** Reads a ?q= value or a saved choice: 'low' | 'mid' | 'high' | 'auto' (the old 'ultra' = 'high'; anything else = 'auto'). */
export function parseTier(v) {
  if (v === 'ultra') return 'high';
  return TIER_ALL.includes(v) || v === 'auto' ? v : 'auto';
}

export function percentile(list, p) {
  if (!list.length) return 0;
  const s = [...list].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
}

/** Tier picked from the probe median (low..high; high is the top). */
export function pickTier(medianMs, A = AUTO_QUALITY) {
  return medianMs <= A.pickHighMs ? 'high' : medianMs <= A.pickMidMs ? 'mid' : 'low';
}

/**
 * @param {{mode?: string, start?: string}} [o] mode 'auto' or a fixed tier; start = tier used during the probe (default high)
 * @returns {{feed(ms:number): {tier:string, changed:boolean, reason?:string}, tier: () => string, state: () => object}}
 */
export function createQuality(o = {}, A = AUTO_QUALITY) {
  const mode = parseTier(o.mode || 'auto');
  let tier = mode === 'auto' ? parseTier(o.start || 'high') : mode;
  let stage = mode === 'auto' ? 'warmup' : 'fixed';
  let t = 0; // seconds in the current stage
  let probe = [];
  let win = []; // [{t, ms}]
  let since = 0; // seconds since the last change
  let over = 0; // seconds the window has been too slow
  let nextCheck = 0;
  const history = [];

  function change(next, reason) {
    if (next === tier) return { tier, changed: false };
    history.push({ from: tier, to: next, reason });
    tier = next;
    since = 0;
    over = 0;
    win = [];
    return { tier, changed: true, reason };
  }

  return {
    feed(ms) {
      const dt = Math.max(0, ms) / 1000;
      if (stage === 'fixed') return { tier, changed: false };
      t += dt;
      if (stage === 'warmup') {
        if (t >= A.warmupS) {
          stage = 'probe';
          t = 0;
        }
        return { tier, changed: false };
      }
      if (stage === 'probe') {
        probe.push(ms);
        if (t >= A.probeS) {
          stage = 'watch';
          t = 0;
          const med = percentile(probe, 0.5);
          probe = [];
          return change(pickTier(med, A), 'probe ' + med.toFixed(1) + ' ms');
        }
        return { tier, changed: false };
      }
      // watch
      since += dt;
      win.push({ t, ms });
      while (win.length && win[0].t < t - A.windowS) win.shift();
      if (t < nextCheck) return { tier, changed: false };
      const step = 0.25;
      nextCheck = t + step;
      if (since < A.cooldownS || win.length < 5) return { tier, changed: false };
      const p75 = percentile(win.map((w) => w.ms), 0.75);
      over = p75 > A.downMs ? over + step : 0;
      if (over >= A.holdS) {
        const i = TIER_ORDER.indexOf(tier); // high -> mid -> low (one step at a time, never up)
        if (i > 0) return change(TIER_ORDER[i - 1], 'p75 ' + p75.toFixed(1) + ' ms');
        over = 0;
      }
      return { tier, changed: false };
    },
    tier: () => tier,
    state: () => ({ mode, stage, tier, history: history.slice() }),
  };
}
