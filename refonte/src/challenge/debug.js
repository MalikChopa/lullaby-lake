// Debug starting states for the challenge (only with ?debug=1, never in a normal run), pure:
//   &wear=N         line and rod at N percent (10..100)        &autofight=1   the automatic fight is on
//   &ready=1        the bucket holds fish for every active order (so a hand-in can be tried at once)
//   &fightx=N       multiplies the fish's patience (0.05 = a miss in a couple of seconds; checks only)
import { addCatch, validateEconomy } from '../economy/model.js';
import { NEEDS } from '../data/economy.js';
import { clampCond } from './wear.js';
import { validateChallenge } from './state.js';

export function debugChallenge(ch, eco, query, species) {
  let c = ch;
  let e = eco;
  const w = Number(query.get('wear'));
  if (query.has('wear') && Number.isFinite(w)) c = { ...c, wear: { line: clampCond(w), rod: clampCond(w) } };
  if (query.get('autofight') === '1') c = { ...c, settings: { ...c.settings, autoFight: true } };
  if (query.get('ready') === '1') {
    for (const o of c.quests.active) {
      if (o.kind === 'fish') {
        const sp = species.find((s) => s.id === o.speciesId);
        if (sp) e = addCatch(e, sp, Math.min(sp.sizeCm.max, o.minCm + 2));
      } else {
        const fam = species.filter((s) => NEEDS[s.id] && NEEDS[s.id].family === o.family);
        for (let i = 0; i < o.n; i++) e = addCatch(e, fam[i % fam.length], fam[i % fam.length].sizeCm.mode);
      }
    }
  }
  return { ch: validateChallenge(c).length === 0 ? c : ch, eco: validateEconomy(e).length === 0 ? e : eco };
}

/** Patience multiplier from ?fightx= (debug only). */
export const patienceMulOf = (query) => {
  const x = Number(query.get('fightx'));
  return Number.isFinite(x) && x > 0 ? Math.min(10, x) : 1;
};
