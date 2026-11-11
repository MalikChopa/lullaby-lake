// What the things of a room say depends on a few facts of the game (brief 29; pure, unit-tested in tests/refonte-shell.test.js):
//   worn      the line or the rod is not like new (the cabin's rack offers the emergency string)
//   shelfAll  every rod of the shop AND the lantern are owned (the shop's shelves say there is nothing left to buy). It counted 3 rods before; the shop sells RODS.length.
import { RODS } from '../data/economy.js';

export function roomFacts(eco, chal, rods = RODS) {
  const w = chal.wear;
  const g = eco.gear;
  return { worn: Math.min(w.line, w.rod) < 100, shelfAll: g.rods.length >= rods.length && !!g.lantern };
}
