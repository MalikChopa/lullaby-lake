// Debug starting states for the economy (only used with ?debug=1, never in a normal run), pure:
//   &money=N        N pearls                         &rod=T        rods 2..T owned, tier T equipped
//   &gear=all       every rod, float, the lantern and 10 packs of each bait owned, the best equipped (money untouched)
//   &bucket=N       N fish in the bucket (species in file order, sizes spread over each range, deterministic)
//   &eco=v1         nothing (a marker the checks use to start from a migrated v1 save: handled by the save, not here)
import { RODS, BAITS, FLOATS, LANTERN, MAX_STACK } from '../data/economy.js';
import { buy, addCatch, validateEconomy, equip } from './model.js';

export function debugEconomy(base, query, species) {
  let e = base;
  const rod = Math.max(1, Math.min(RODS.length, Math.floor(Number(query.get('rod')) || 1)));
  const all = query.get('gear') === 'all';
  if (rod > 1 || all) {
    e = { ...e, money: 1e9 };
    for (let t = 2; t <= (all ? RODS.length : rod); t++) e = buy(e, 'rod', t).eco;
    if (all) {
      for (const b of BAITS) if (b.pack !== null) for (let i = 0; i < Math.min(10, Math.floor(MAX_STACK / b.pack)); i++) e = buy(e, 'bait', b.id).eco;
      for (const f of FLOATS) e = buy(e, 'float', f.id).eco;
      e = buy(e, 'lantern', LANTERN.id).eco;
    }
    e = { ...e, money: base.money, stats: { ...base.stats } };
  }
  const n = Math.max(0, Math.min(2000, Math.floor(Number(query.get('bucket')) || 0)));
  for (let i = 0; i < n; i++) {
    const sp = species[i % species.length];
    const t = ((i * 7) % 10) / 9;
    e = addCatch(e, sp, Math.round(sp.sizeCm.min + (sp.sizeCm.max - sp.sizeCm.min) * t));
  }
  const m = Number(query.get('money'));
  if (query.has('money') && Number.isFinite(m) && m >= 0) e = { ...e, money: Math.floor(m) };
  return validateEconomy(e).length === 0 ? e : base;
}

export { equip };
