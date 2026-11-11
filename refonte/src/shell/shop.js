// The shop screen's view (J10): draws the rows of economy/shopUi.js (pure, tested) with the pixel style of the journal and the settings. Everything a row says is
// WORDS first (state, price, what is missing); the small icons only repeat it. Keyboard: Tab and Shift+Tab (kept inside the shop by the shell), arrows move between
// rows, Left / Right between tabs, Enter or Space activate, Escape closes (the shell's router), Esc first cancels a question. Touch: every row is a big button.
// The shopkeeper is a placeholder villager with a greeting; openDialogue() is the hook the dialogue milestone (J12) will fill: nothing else is wired to it.

import { paintFish, FISH_W, FISH_H } from '../../../src/art/fishPaint.js';
import { drawEco } from '../art/ecoIcons.js';
import { RODS, BAITS, FLOATS, LANTERN } from '../data/economy.js';
import { TABS } from '../economy/shopUi.js';

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};

export function createShopView({ root, ui, store, t, getLang, species, sprites, say, toast, sfx, onChange }) {
  const $ = (sel) => root.querySelector(sel);
  const list = $('#shopList');
  const tabs = $('#shopTabs');
  const purse = $('#shopPurse');
  const keeper = $('#shopSay');
  const bulk = $('#shopBulk');
  const confirmBox = $('#shopConfirm');
  const msg = $('#shopMsg');
  const fishCache = new Map();
  let dialogueHandler = null;
  let focusKey = null; // the row that keeps the focus across a redraw
  let sortBy = 'value'; // the order of the sell list (a view choice: value, name or size); the economy rows themselves are not changed
  const SORTS = ['value', 'name', 'size'];
  let lastMsg = null; // said again as a toast when the shop closes (the HUD, where toasts live, is hidden while the shop is open)

  const amount = (n) => t(n === 1 ? 'eco.pearl' : 'eco.pearls', { n });
  const price = (n) => t(n === 1 ? 'shop.price1' : 'shop.price', { n }); // the short form of the lists (the currency is named in the header)
  const itemName = (kind, id) => (kind === 'rod' ? t('eco.rod.' + id) : kind === 'bait' ? t('eco.bait.' + id) : kind === 'float' ? (id === null ? t('eco.none') : t('eco.float.' + id)) : t('eco.lantern'));
  const itemDesc = (kind, id) => (kind === 'rod' ? t('eco.rod.' + id + '.d') : kind === 'bait' ? t('eco.bait.' + id + '.d') : kind === 'float' && id !== null ? t('eco.float.' + id + '.d') : kind === 'lantern' ? t('eco.lantern.d') : '');
  const speciesName = (id) => {
    const sp = species.find((s) => s.id === id);
    return sp ? sp.name[getLang()] || sp.name.fr : id;
  };

  function fishCanvas(id) {
    const sp = species.find((s) => s.id === id);
    const c = el('canvas', 'sfish');
    c.width = FISH_W;
    c.height = FISH_H;
    c.setAttribute('aria-hidden', 'true');
    if (sp && sprites[sp.sprite]) {
      let img = fishCache.get(id);
      if (!img) {
        img = new ImageData(paintFish(sprites[sp.sprite]), FISH_W, FISH_H);
        fishCache.set(id, img);
      }
      c.getContext('2d').putImageData(img, 0, 0);
    }
    return c;
  }
  function icon(name, small = true) {
    const c = el('canvas', 'ic' + (small ? ' s' : ''));
    c.setAttribute('aria-hidden', 'true');
    drawEco(c, name, '#fdf2dc');
    return c;
  }
  const stateIcon = (s) => (s === 'ok' ? 'diamond' : s === 'owned' || s === 'equipped' ? 'check' : s === 'locked' ? 'lock' : s === 'poor' ? 'cross' : 'cross');

  function stateText(row) {
    if (row.state === 'poor') return t('shop.state.poor', { n: row.missing });
    return t('shop.state.' + row.state);
  }

  function renderPurse() {
    const s = ui.summary();
    purse.textContent = t('shop.purse', { money: s.money }) + ' · ' + t('shop.bucket', { n: s.fish, value: s.value });
  }

  function sortRows(rows) {
    const by = { value: (a, b) => b.total - a.total || a.id.localeCompare(b.id), name: (a, b) => speciesName(a.id).localeCompare(speciesName(b.id), getLang()), size: (a, b) => b.maxCm - a.maxCm || a.id.localeCompare(b.id) };
    return [...rows].sort(by[sortBy]);
  }
  function renderTabs() {
    for (const b of tabs.querySelectorAll('[data-tab]')) {
      const on = b.dataset.tab === ui.tab;
      b.setAttribute('aria-selected', String(on));
      b.setAttribute('aria-pressed', String(on));
      b.tabIndex = on ? 0 : -1;
      b.textContent = t('shop.tab.' + b.dataset.tab);
    }
  }

  function sellRow(r) {
    const b = el('button', 'srow');
    b.type = 'button';
    b.dataset.key = r.key;
    b.append(fishCanvas(r.id));
    const body = el('span', 'sbody2');
    const size = r.minCm === r.maxCm ? t('shop.size1', { cm: r.minCm }) : t('shop.size2', { a: r.minCm, b: r.maxCm });
    body.append(el('span', 'sname', speciesName(r.id) + ' × ' + r.count), el('span', 'sline', size + ' · ' + price(r.total)));
    const act = el('span', 'sact', t('shop.sellOne') + ' · ' + price(r.one));
    b.append(body, act);
    b.setAttribute('aria-label', `${speciesName(r.id)} × ${r.count}, ${size}, ${amount(r.total)}. ${t('shop.sellOne')}, ${amount(r.one)}`);
    return b;
  }

  function buyRow(r) {
    const b = el('button', 'srow s-' + r.state);
    b.type = 'button';
    b.dataset.key = r.key;
    b.append(icon(r.icon, false));
    const body = el('span', 'sbody2');
    const nm = itemName(r.kind, r.id) + (r.pack ? ' · ' + t('shop.pack', { n: r.pack }) : '');
    const have = r.kind === 'bait' && r.have > 0 ? ' · ' + t('shop.state.have', { n: r.have }) : '';
    body.append(el('span', 'sname', nm + have), el('span', 'sline', itemDesc(r.kind, r.id)));
    const act = el('span', 'sact');
    act.append(icon(stateIcon(r.state)), document.createTextNode(' ' + (r.state === 'ok' ? price(r.price) + ' · ' + t('shop.buy') : r.state === 'poor' ? price(r.price) + ' · ' + stateText(r) : stateText(r))));
    b.append(body, act);
    if (r.state === 'locked' || r.state === 'owned') b.setAttribute('aria-disabled', 'true');
    b.setAttribute('aria-label', `${nm}${have}. ${itemDesc(r.kind, r.id)} ${amount(r.price)}. ${stateText(r)}`);
    return b;
  }

  function gearRow(r) {
    const b = el('button', 'srow s-' + (r.state === 'equipped' ? 'owned' : 'ok'));
    b.type = 'button';
    b.dataset.key = r.key;
    b.append(icon(r.icon, false));
    const body = el('span', 'sbody2');
    let nm = itemName(r.kind, r.kind === 'lantern' ? null : r.id);
    if (r.kind === 'bait' && r.count) nm = t('eco.baitCount', { name: nm, n: r.count });
    const lanternState = r.kind === 'lantern' ? ' · ' + (r.state === 'equipped' ? t('eco.on') : t('eco.off')) : '';
    body.append(el('span', 'sname', nm + lanternState), el('span', 'sline', itemDesc(r.kind, r.kind === 'lantern' ? null : r.id)));
    const act = el('span', 'sact');
    act.append(icon(r.state === 'equipped' ? 'check' : 'diamond'), document.createTextNode(' ' + (r.state === 'equipped' ? t('shop.state.equipped') : t('shop.equip'))));
    b.append(body, act);
    b.setAttribute('aria-label', `${nm}${lanternState}. ${r.state === 'equipped' ? t('shop.state.equipped') : t('shop.equip')}`);
    b.setAttribute('aria-pressed', String(r.state === 'equipped'));
    return b;
  }

  function renderBulk() {
    bulk.textContent = '';
    if (ui.tab !== 'sell') {
      bulk.hidden = true;
      return;
    }
    bulk.hidden = false;
    const s = ui.summary();
    const sort = el('button', 'btn alt sm sortb', t('shop.sortBy', { by: t('shop.sort.' + sortBy) }));
    sort.type = 'button';
    sort.dataset.sort = sortBy;
    sort.disabled = ui.rows().length < 2;
    const all = el('button', 'btn', s.fish > 0 ? t('shop.sellAllValue', { value: s.value }) : t('shop.sellAll'));
    all.type = 'button';
    all.dataset.bulk = 'all';
    const dbl = el('button', 'btn alt', t('shop.sellDoubles'));
    dbl.type = 'button';
    dbl.dataset.bulk = 'doubles';
    all.disabled = s.fish === 0;
    dbl.disabled = store.get().bucket.length === 0 || ui.rows().every((r) => r.count < 2);
    if (all.disabled) all.title = t('shop.nothingToSell');
    if (dbl.disabled) dbl.title = t('shop.noDoubles');
    bulk.append(sort, all, dbl);
  }

  function renderConfirm() {
    const c = ui.confirm;
    confirmBox.hidden = !c;
    confirmBox.textContent = '';
    if (!c) return;
    const q = el('p', 'sq', t('shop.confirm', { item: itemName(c.kind, c.id), amount: amount(c.price) }));
    q.id = 'shopConfirmQ';
    confirmBox.setAttribute('aria-labelledby', 'shopConfirmQ'); // brief 33: the question names its alert dialog
    confirmBox.append(q);
    const row = el('div', 'srow2');
    const no = el('button', 'btn alt', t('shop.no'));
    no.type = 'button';
    no.dataset.confirm = 'no';
    const yes = el('button', 'btn', t('shop.yes'));
    yes.type = 'button';
    yes.dataset.confirm = 'yes';
    row.append(yes, no);
    confirmBox.append(row);
  }

  /** Redraws everything from the state; keeps the focus on the same row (or the nearest one). */
  function render(refocus = true) {
    const active = document.activeElement;
    if (refocus && active && root.contains(active) && active.dataset && active.dataset.key) focusKey = active.dataset.key;
    renderPurse();
    renderTabs();
    list.textContent = '';
    const rows = ui.tab === 'sell' ? sortRows(ui.rows()) : ui.rows();
    if (rows.length === 0) list.append(el('p', 'sempty', t(ui.tab === 'sell' ? 'shop.empty' : 'shop.empty')));
    for (const r of rows) list.append(ui.tab === 'sell' ? sellRow(r) : ui.tab === 'buy' ? buyRow(r) : gearRow(r));
    renderBulk();
    renderConfirm();
    const hooked = dialogueHandler ? dialogueHandler('ondine.greeting') : null; // J12-A: the story's greeting line (a text) when the dialogue system is wired
    keeper.textContent = typeof hooked === 'string' && hooked ? hooked : t('shop.greeting');
    $('#shopKeeperName').textContent = t('shop.keeper');
    if (refocus) restoreFocus();
  }

  function restoreFocus() {
    const rows = [...list.querySelectorAll('.srow')];
    if (ui.confirm) {
      const no = confirmBox.querySelector('[data-confirm="no"]');
      if (no) no.focus({ preventScroll: true });
      return;
    }
    let target = focusKey ? rows.find((n) => n.dataset.key === focusKey) : null;
    if (!target && rows.length) target = rows[Math.min(ui.cursor, rows.length - 1)];
    if (!target) target = bulk.querySelector('button:not([disabled])') || tabs.querySelector('[tabindex="0"]');
    if (target) target.focus({ preventScroll: true });
  }

  function announce(text) {
    msg.textContent = text;
    lastMsg = text;
    say(text);
  }

  function report(r) {
    if (r.type === 'sold') {
      sfx('catch');
      const text = r.sold === 1 ? t('eco.sold1', { amount: amount(r.earned) }) : t('eco.sold', { n: r.sold, amount: amount(r.earned) });
      announce(text);
    } else if (r.type === 'bought') {
      // (the shell already plays the "click" effect for every button press: nothing more here)
      announce(t('eco.bought', { item: itemName(r.kind, r.id) }) + (r.kind === 'rod' || r.kind === 'bait' ? ' · ' + t('eco.unlock') : ''));
    } else if (r.type === 'equipped') {
      const text = t('eco.equipped', { item: itemName(r.kind, r.kind === 'lantern' ? null : r.id) });
      announce(text);
    } else if (r.type === 'denied') {
      const text = r.reason === 'poor' ? t('shop.state.poor', { n: r.missing }) : t('shop.state.' + r.reason);
      announce(text);
    } else if (r.type === 'confirm') {
      announce(t('shop.confirm', { item: itemName(r.kind, r.id), amount: amount(r.price) }));
    }
    if (r.type === 'sold' || r.type === 'bought' || r.type === 'equipped') onChange && onChange();
  }

  // ---- events
  list.addEventListener('click', (ev) => {
    const b = ev.target.closest('.srow');
    if (!b) return;
    focusKey = b.dataset.key;
    const idx = [...list.querySelectorAll('.srow')].indexOf(b);
    ui.cursor = Math.max(0, idx);
    const r = ui.activate(b.dataset.key);
    render(true);
    report(r);
  });
  bulk.addEventListener('click', (ev) => {
    const so = ev.target.closest('[data-sort]');
    if (so) {
      sortBy = SORTS[(SORTS.indexOf(sortBy) + 1) % SORTS.length];
      render(false);
      const again = bulk.querySelector('[data-sort]');
      if (again) again.focus({ preventScroll: true });
      announce(t('shop.sortBy', { by: t('shop.sort.' + sortBy) }));
      return;
    }
    const b = ev.target.closest('[data-bulk]');
    if (!b) return;
    const r = ui.sellBulk(b.dataset.bulk);
    focusKey = null;
    render(true);
    report(r);
  });
  confirmBox.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-confirm]');
    if (!b) return;
    const r = b.dataset.confirm === 'yes' ? ui.confirmYes() : (ui.confirmNo(), { type: 'nothing' });
    render(true);
    report(r);
  });
  tabs.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-tab]');
    if (!b) return;
    ui.setTab(b.dataset.tab);
    focusKey = null;
    render(false);
    b.focus({ preventScroll: true });
  });
  root.addEventListener('keydown', (ev) => {
    const k = ev.key;
    const a = document.activeElement;
    if (k === 'Escape' && ui.confirm) {
      // the first Escape cancels the question; the shell's router (document level) would close the shop, so it is stopped here
      ev.stopPropagation();
      ev.preventDefault();
      ui.confirmNo();
      render(true);
      return;
    }
    if (a && a.closest && a.closest('#shopTabs') && (k === 'ArrowLeft' || k === 'ArrowRight')) {
      ev.preventDefault();
      const i = TABS.indexOf(ui.tab);
      ui.setTab(TABS[(i + (k === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length]);
      focusKey = null;
      render(false);
      tabs.querySelector('[tabindex="0"]').focus({ preventScroll: true });
      return;
    }
    if (a && a.classList && a.classList.contains('srow') && (k === 'ArrowDown' || k === 'ArrowUp' || k === 'Home' || k === 'End')) {
      ev.preventDefault();
      const rows = [...list.querySelectorAll('.srow')];
      let i = rows.indexOf(a);
      i = k === 'Home' ? 0 : k === 'End' ? rows.length - 1 : Math.max(0, Math.min(rows.length - 1, i + (k === 'ArrowDown' ? 1 : -1)));
      ui.cursor = i;
      rows[i].focus({ preventScroll: false });
      rows[i].scrollIntoView({ block: 'nearest' });
      return;
    }
    if (a && a.classList && a.classList.contains('srow') && (k === 'ArrowLeft' || k === 'ArrowRight')) {
      ev.preventDefault();
      tabs.querySelector('[tabindex="0"]').focus({ preventScroll: true });
    }
  });

  return {
    /** Opens (the shell already switched the screen): first tab, greeting, focus on the first row. */
    open() {
      ui.reset();
      focusKey = null;
      msg.textContent = '';
      lastMsg = null;
      render(true);
    },
    close() {
      ui.confirmNo();
      if (lastMsg) toast(lastMsg);
      lastMsg = null;
    },
    render,
    refresh: () => render(false),
    /** J12 hook: the dialogue system registers a function (npcId) -> boolean here; the shop never needs one. */
    setDialogueHandler(fn) {
      dialogueHandler = fn;
    },
    /** J12-A: the dialogue system registers a function (id) -> boolean | string here; the shop asks it for the keeper's greeting ('ondine.greeting'). */
    openDialogue(id) {
      return dialogueHandler ? dialogueHandler(id) || false : false;
    },
    itemName,
    amount,
  };
}

export { RODS, BAITS, FLOATS, LANTERN };
