// The shop screen as a pure state machine (J10): tabs Sell / Buy / Gear, the rows each tab shows, what an activation does, the confirmation
// of a big purchase. No DOM: shell/shop.js draws it. Every row carries a `state` WORD key (never colour alone) and an `icon` name.
//   tabs     sell | buy | gear
//   sell     one row per species in the bucket: { key, id, count, minCm, maxCm, total, one: price of the smallest fish }
//   buy      rods (the next tier, then owned ones), baits, floats, the lantern: { key, kind, id, state, price, missing, pack, have }
//   gear     what is equipped and what can be: { key, kind, id, state: 'equipped' | 'owned' | 'none', count }
// Activation results: { type: 'sold' | 'bought' | 'equipped' | 'confirm' | 'denied' | 'nothing', ... }  (the shell turns them into toasts and sounds)

import { BIG_PRICE } from '../data/economy.js';
import { RODS, BAITS, FLOATS, LANTERN } from '../data/economy.js';
import { FREE_BAIT } from './model.js';

export const TABS = Object.freeze(['sell', 'buy', 'gear']);

export function createShopUi(store) {
  const U = { tab: 'sell', cursor: 0, confirm: null };

  /** Rows of the sell tab, best value first. */
  function sellRows() {
    const eco = store.get();
    const groups = new Map();
    eco.bucket.forEach((f, i) => {
      let g = groups.get(f.id);
      if (!g) {
        g = { key: 'sell:' + f.id, id: f.id, count: 0, minCm: f.cm, maxCm: f.cm, total: 0, idx: [], cheapest: i };
        groups.set(f.id, g);
      }
      g.count++;
      g.minCm = Math.min(g.minCm, f.cm);
      g.maxCm = Math.max(g.maxCm, f.cm);
      g.total += f.p;
      g.idx.push(i);
      if (f.p < eco.bucket[g.cheapest].p) g.cheapest = i;
    });
    return [...groups.values()].map((g) => ({ ...g, one: eco.bucket[g.cheapest].p, icon: 'fish' })).sort((a, b) => b.total - a.total || a.id.localeCompare(b.id));
  }

  function buyRows() {
    const eco = store.get();
    const rows = [];
    for (const r of RODS) {
      if (r.tier === 1) continue;
      const o = store.offer('rod', r.tier);
      rows.push({ key: 'buy:rod:' + r.tier, kind: 'rod', id: r.tier, state: o.state, price: o.price, missing: o.missing, icon: 'rod', have: eco.gear.rods.includes(r.tier) ? 1 : 0 });
    }
    for (const b of BAITS) {
      if (b.pack === null) continue;
      const o = store.offer('bait', b.id);
      rows.push({ key: 'buy:bait:' + b.id, kind: 'bait', id: b.id, state: o.state, price: o.price, missing: o.missing, pack: b.pack, icon: 'bait', have: eco.gear.baits[b.id] || 0 });
    }
    for (const f of FLOATS) {
      const o = store.offer('float', f.id);
      rows.push({ key: 'buy:float:' + f.id, kind: 'float', id: f.id, state: o.state, price: o.price, missing: o.missing, icon: 'float', have: eco.gear.floats.includes(f.id) ? 1 : 0 });
    }
    const o = store.offer('lantern', LANTERN.id);
    rows.push({ key: 'buy:lantern', kind: 'lantern', id: LANTERN.id, state: o.state, price: o.price, missing: o.missing, icon: 'lantern', have: eco.gear.lantern ? 1 : 0 });
    return rows;
  }

  function gearRows() {
    const eco = store.get();
    const q = eco.equipped;
    const rows = [];
    for (const t of eco.gear.rods) rows.push({ key: 'gear:rod:' + t, kind: 'rod', id: t, state: q.rod === t ? 'equipped' : 'owned', icon: 'rod' });
    rows.push({ key: 'gear:bait:' + FREE_BAIT, kind: 'bait', id: FREE_BAIT, state: q.bait === FREE_BAIT ? 'equipped' : 'owned', count: null, icon: 'bait' });
    for (const [id, n] of Object.entries(eco.gear.baits)) rows.push({ key: 'gear:bait:' + id, kind: 'bait', id, state: q.bait === id ? 'equipped' : 'owned', count: n, icon: 'bait' });
    rows.push({ key: 'gear:float:none', kind: 'float', id: null, state: q.float === null ? 'equipped' : 'owned', icon: 'float' });
    for (const id of eco.gear.floats) rows.push({ key: 'gear:float:' + id, kind: 'float', id, state: q.float === id ? 'equipped' : 'owned', icon: 'float' });
    if (eco.gear.lantern) rows.push({ key: 'gear:lantern', kind: 'lantern', id: !q.lantern, state: q.lantern ? 'equipped' : 'owned', icon: 'lantern' });
    return rows;
  }

  Object.assign(U, {
    rows() {
      return U.tab === 'sell' ? sellRows() : U.tab === 'buy' ? buyRows() : gearRows();
    },
    setTab(tab) {
      if (!TABS.includes(tab)) return false;
      U.tab = tab;
      U.cursor = 0;
      U.confirm = null;
      return true;
    },
    /** Moves the cursor (clamped to the rows; the lists are short enough not to wrap). */
    move(d) {
      const n = U.rows().length;
      U.cursor = n === 0 ? 0 : Math.max(0, Math.min(n - 1, U.cursor + d));
      U.confirm = null;
      return U.cursor;
    },
    /** Keeps the cursor on a row after the list changed (a sold group disappears). */
    clamp() {
      const n = U.rows().length;
      U.cursor = n === 0 ? 0 : Math.min(U.cursor, n - 1);
    },
    summary() {
      const eco = store.get();
      return { money: eco.money, fish: eco.bucket.length, value: store.value() };
    },
    /** Sell buttons: 'all' | 'doubles'. */
    sellBulk(how) {
      const r = store.sell(how);
      U.clamp();
      return r.sold > 0 ? { type: 'sold', sold: r.sold, earned: r.earned } : { type: 'nothing' };
    },
    /** Activates a row by its key (Enter / click). A big purchase first asks (type 'confirm'); activating the same row again, or confirmYes(), buys. */
    activate(key) {
      const row = U.rows().find((r) => r.key === key);
      if (!row) return { type: 'nothing' };
      if (U.tab === 'sell') {
        const r = store.sell({ index: row.cheapest });
        U.clamp();
        return r.sold > 0 ? { type: 'sold', sold: 1, earned: r.earned, id: row.id } : { type: 'nothing' };
      }
      if (U.tab === 'gear') {
        const ok = store.equip(row.kind, row.id);
        return ok ? { type: 'equipped', kind: row.kind, id: row.id } : { type: 'denied', reason: 'unknown' };
      }
      if (row.state !== 'ok') return { type: 'denied', reason: row.state, kind: row.kind, id: row.id, missing: row.missing };
      if (row.price >= BIG_PRICE && !(U.confirm && U.confirm.key === key)) {
        U.confirm = { key, kind: row.kind, id: row.id, price: row.price };
        return { type: 'confirm', kind: row.kind, id: row.id, price: row.price };
      }
      return U.doBuy(row);
    },
    doBuy(row) {
      U.confirm = null;
      const r = store.buy(row.kind, row.id);
      return r.ok ? { type: 'bought', kind: row.kind, id: row.id, price: r.price } : { type: 'denied', reason: r.reason, kind: row.kind, id: row.id };
    },
    confirmYes() {
      if (!U.confirm) return { type: 'nothing' };
      const row = U.rows().find((r) => r.key === U.confirm.key);
      return row ? U.doBuy(row) : { type: 'nothing' };
    },
    confirmNo() {
      U.confirm = null;
    },
    /** Opening the shop: back to the first tab, nothing pending. */
    reset() {
      U.tab = 'sell';
      U.cursor = 0;
      U.confirm = null;
    },
  });
  return U;
}
