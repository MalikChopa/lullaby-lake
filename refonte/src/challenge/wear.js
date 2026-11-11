// Wear and repair of the gear (J11), pure. A condition is a number FLOOR..100 (percent). Nothing here ever breaks gear, loses money or goes negative.
//   wear    { line, rod }   conditions
//   price   pearls to repair, by rod tier (data/challenge.js REPAIR)
// The emergency repair ("ficelle de secours") is free and brings both conditions to at least REPAIR.emergency.restoreTo.

import { WEAR, REPAIR } from '../data/challenge.js';

const r1 = (x) => Math.round(x * 10) / 10;
const num = (x) => typeof x === 'number' && Number.isFinite(x);

export const FULL = 100;
export const clampCond = (c) => (num(c) ? Math.max(WEAR.floor, Math.min(FULL, r1(c))) : FULL);
export const newWear = () => ({ line: FULL, rod: FULL });

/** Strength of a piece of gear for a condition: 1 above `goodAbove`, falling linearly to `weakMin` at the floor. Always in [weakMin, 1]. */
export function condFactor(c) {
  const x = clampCond(c);
  if (x >= WEAR.goodAbove) return 1;
  return WEAR.weakMin + ((1 - WEAR.weakMin) * (x - WEAR.floor)) / (WEAR.goodAbove - WEAR.floor);
}

/** The cast reach multiplier of a worn rod (1 = full). */
export const reachMul = (wear) => 1 - WEAR.reachLoss * (1 - condFactor(wear.rod));

/** Wear after ONE won fight with a fish of `rarity` at `sizeT` (0..1 of its size range), rod tier `rodTier`. Never below the floor. */
export function afterFight(wear, rarity, sizeT, rodTier) {
  const t = Math.max(0, Math.min(1, sizeT));
  const size = WEAR.sizeMul[0] + (WEAR.sizeMul[1] - WEAR.sizeMul[0]) * t;
  const save = 1 / (1 + WEAR.rodSave * Math.max(0, rodTier - 1));
  const k = WEAR.perFight;
  return { line: clampCond(wear.line - (k.line[rarity] || k.line[1]) * size * save), rod: clampCond(wear.rod - (k.rod[rarity] || k.rod[1]) * size * save) };
}

const unit = (which, tier) => REPAIR.perPoint[which][Math.max(1, Math.min(REPAIR.perPoint[which].length, tier)) - 1];

/** Pearls to repair: { line, rod, all } (0 when nothing is worn). */
export function repairCost(wear, rodTier) {
  const line = Math.max(0, Math.ceil((FULL - wear.line) * unit("line", rodTier) - 1e-9));
  const rod = Math.max(0, Math.ceil((FULL - wear.rod) * unit("rod", rodTier) - 1e-9));
  return { line, rod, all: line + rod };
}

/** Wear after a paid repair of 'line' | 'rod' | 'all' (the price is taken by the caller). */
export function repaired(wear, which) {
  return { line: which === 'line' || which === 'all' ? FULL : wear.line, rod: which === 'rod' || which === 'all' ? FULL : wear.rod };
}

/** Is the free emergency repair available? `fights` = fights played so far, `at` = the fight count at the last emergency use (-1 = never used). */
export function emergencyAvailable(wear, fights, at) {
  const need = wear.line < REPAIR.emergency.restoreTo || wear.rod < REPAIR.emergency.restoreTo;
  return need && (at < 0 || fights - at >= REPAIR.emergency.everyFights);
}

/** Wear after the emergency repair: each condition is at least `restoreTo`. */
export function afterEmergency(wear) {
  return { line: Math.max(wear.line, REPAIR.emergency.restoreTo), rod: Math.max(wear.rod, REPAIR.emergency.restoreTo) };
}

/** Fights left before the emergency repair can be used again (0 = now). */
export const emergencyIn = (fights, at) => (at < 0 ? 0 : Math.max(0, REPAIR.emergency.everyFights - (fights - at)));

/** Icon name for a condition (a shape that repeats the words): 'check' good | 'diamond' worn | 'cross' very worn. */
export const condIcon = (c) => (c >= WEAR.goodAbove ? 'check' : c >= 30 ? 'diamond' : 'cross');
