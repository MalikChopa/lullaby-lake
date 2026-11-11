// The Atelier (repairs), the notice board and the quest log (J11): views over challenge/state.js, in the pixel style of the shop. Everything a row says is WORDS
// first (the condition in percent and in words, the price, what is missing); the small icons only repeat it. The rules are in challenge/*.js (pure, tested).
// openDialogue(id) is the hook the dialogue milestone (J12) will fill: nothing else is wired to it.

import { paintFish, FISH_W, FISH_H } from '../../../src/art/fishPaint.js';
import { drawEco } from '../art/ecoIcons.js';
import { VILLAGERS } from '../data/map.js';
import { MILESTONES, REPAIR, WEAR } from '../data/challenge.js';
import { floatOf, baitOf } from '../economy/model.js';
import { progressOf } from '../challenge/quests.js';
import { condIcon } from '../challenge/wear.js';

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};
const icon = (name, small = true) => {
  const c = el('canvas', 'ic' + (small ? ' s' : ''));
  c.setAttribute('aria-hidden', 'true');
  drawEco(c, name, '#fdf2dc');
  return c;
};
/** Word for a condition. */
export const condWord = (t, c) => t(c >= WEAR.goodAbove ? 'chal.cond.good' : c >= 30 ? 'chal.cond.worn' : 'chal.cond.tired');

function focusFirst(list, fallback) {
  const b = list.querySelector('button:not([disabled])') || fallback;
  if (b) b.focus({ preventScroll: true });
}

function arrowKeys(root, list) {
  root.addEventListener('keydown', (ev) => {
    const k = ev.key;
    const a = document.activeElement;
    if (!a || !a.classList || !a.classList.contains('srow')) return;
    if (k === 'ArrowDown' || k === 'ArrowUp' || k === 'Home' || k === 'End') {
      ev.preventDefault();
      const rows = [...list.querySelectorAll('button.srow')];
      let i = rows.indexOf(a);
      i = k === 'Home' ? 0 : k === 'End' ? rows.length - 1 : Math.max(0, Math.min(rows.length - 1, i + (k === 'ArrowDown' ? 1 : -1)));
      if (rows[i]) {
        rows[i].focus();
        rows[i].scrollIntoView({ block: 'nearest' });
      }
    }
  });
}

/** Paints the front frame of a villager's sheet on a canvas (the keeper's face). */
export function paintFace(canvas, sheet, FOLK) {
  canvas.width = FOLK.cellW;
  canvas.height = FOLK.cellH;
  const cell = new ImageData(FOLK.cellW, FOLK.cellH);
  for (let y = 0; y < FOLK.cellH; y++) for (let x = 0; x < FOLK.cellW; x++) for (let c = 0; c < 4; c++) cell.data[(y * FOLK.cellW + x) * 4 + c] = sheet.data[(y * sheet.w + x) * 4 + c];
  canvas.getContext('2d').putImageData(cell, 0, 0);
}

// ------------------------------------------------------------------------------------------------ the Atelier
export function createRepairView({ root, chal, eco, t, say, toast, sfx, onChange }) {
  const $ = (sel) => root.querySelector(sel);
  const list = $('#repList');
  const msg = $('#repMsg');
  let mode = 'workshop';
  let lastMsg = null;
  let dialogueHandler = null;
  const amount = (n) => t(n === 1 ? 'eco.pearl' : 'eco.pearls', { n });
  const price = (n) => t(n === 1 ? 'chal.repair.price1' : 'chal.repair.price', { n });

  function meter(c) {
    const m = el('span', 'meter');
    m.setAttribute('aria-hidden', 'true');
    const i = el('i');
    i.style.width = Math.round(c) + '%';
    m.append(i);
    return m;
  }
  function condRow(which, c, cost) {
    const b = el('button', 'srow s-' + (cost > 0 ? 'ok' : 'owned'));
    b.type = 'button';
    b.dataset.key = 'rep:' + which;
    b.append(icon(which === 'line' ? 'bait' : 'rod', false));
    const body = el('span', 'sbody2');
    const name = t('chal.cond.' + which);
    body.append(el('span', 'sname', `${name} : ${t('chal.cond.value', { n: Math.round(c) })} · ${condWord(t, c)}`), meter(c));
    const act = el('span', 'sact');
    let label;
    if (cost <= 0) label = t('chal.repair.fine');
    else if (cost > eco.get().money) label = price(cost) + ' · ' + t('chal.repair.poor', { n: cost - eco.get().money });
    else label = price(cost) + ' · ' + t('chal.repair.do');
    act.append(icon(cost <= 0 ? 'check' : cost > eco.get().money ? 'cross' : 'diamond'), document.createTextNode(' ' + label));
    b.append(body, act);
    if (cost <= 0) b.setAttribute('aria-disabled', 'true');
    b.setAttribute('aria-label', `${name} ${Math.round(c)} %, ${condWord(t, c)}. ${label}`);
    return b;
  }
  function render(refocus = true) {
    const w = chal.get().wear;
    const costs = chal.costs();
    const money = eco.get().money;
    const focusKey = document.activeElement && root.contains(document.activeElement) ? document.activeElement.dataset.key : null;
    $('#t-repair').textContent = t(mode === 'cabin' ? 'chal.repair.cabinTitle' : 'chal.repair.title');
    $('#repKeeperName').textContent = t('chal.repair.keeper');
    $('#repSay').textContent = t(mode === 'cabin' ? 'chal.repair.cabinGreeting' : 'chal.repair.greeting');
    $('#repKeeper').hidden = mode === 'cabin';
    $('#repPurse').textContent = t('chal.repair.purse', { money });
    list.textContent = '';
    if (mode !== 'cabin') {
      list.append(condRow('line', w.line, costs.line), condRow('rod', w.rod, costs.rod));
      const all = condRow('all', Math.min(w.line, w.rod), costs.all);
      // the "everything" row: a plain button with the sum
      all.textContent = '';
      all.dataset.key = 'rep:all';
      all.append(icon('diamond', false));
      const body = el('span', 'sbody2');
      body.append(el('span', 'sname', t('chal.repair.all')));
      const act = el('span', 'sact');
      const lab = costs.all <= 0 ? t('chal.repair.fine') : costs.all > money ? price(costs.all) + ' · ' + t('chal.repair.poor', { n: costs.all - money }) : price(costs.all) + ' · ' + t('chal.repair.do');
      act.append(icon(costs.all <= 0 ? 'check' : costs.all > money ? 'cross' : 'diamond'), document.createTextNode(' ' + lab));
      all.append(body, act);
      all.setAttribute('aria-label', `${t('chal.repair.all')}. ${lab}`);
      list.append(all);
    } else {
      // in the cabin the condition is shown as text, and the string below
      const info = el('p', 'note');
      info.textContent = `${t('chal.cond.line')} : ${Math.round(w.line)} % · ${t('chal.cond.rod')} : ${Math.round(w.rod)} %`;
      list.append(info);
    }
    const ok = chal.emergencyOk();
    const e = el('button', 'srow s-' + (ok ? 'ok' : 'owned'));
    e.type = 'button';
    e.dataset.key = 'rep:emergency';
    e.append(icon('lantern', false));
    const body = el('span', 'sbody2');
    body.append(el('span', 'sname', t('chal.emergency')), el('span', 'sline', t('chal.emergency.d', { n: REPAIR.emergency.restoreTo })));
    const act = el('span', 'sact');
    const wait = chal.emergencyIn();
    const fine = w.line >= REPAIR.emergency.restoreTo && w.rod >= REPAIR.emergency.restoreTo;
    const label = ok ? t('chal.emergency.use') : fine ? t('chal.emergency.fine') : t(wait === 1 ? 'chal.emergency.wait1' : 'chal.emergency.wait', { n: wait });
    act.append(icon(ok ? 'diamond' : fine ? 'check' : 'lock'), document.createTextNode(' ' + label));
    e.append(body, act);
    if (!ok) e.setAttribute('aria-disabled', 'true');
    e.setAttribute('aria-label', `${t('chal.emergency')}. ${label}`);
    list.append(e);
    if (refocus) {
      const target = focusKey ? list.querySelector(`[data-key="${focusKey}"]`) : null;
      (target || list.querySelector('button.srow') || $('.closeb')).focus({ preventScroll: true });
    }
  }
  function announce(text) {
    msg.textContent = text;
    lastMsg = text;
    say(text);
  }
  list.addEventListener('click', (ev) => {
    const b = ev.target.closest('button.srow');
    if (!b) return;
    const key = b.dataset.key;
    if (key === 'rep:emergency') {
      const r = chal.emergency();
      if (r.ok) {
        sfx('catch');
        announce(t('chal.emergency.done'));
      } else announce(t(r.reason === 'fine' ? 'chal.emergency.fine' : 'chal.emergency.wait', { n: chal.emergencyIn() }));
    } else {
      const which = key.slice(4);
      const r = chal.repair(which);
      if (r.ok) {
        sfx('catch');
        announce(t('chal.repair.done', { what: which === 'all' ? t('chal.repair.all') : t('chal.cond.' + which) }));
      } else announce(r.reason === 'fine' ? t('chal.repair.fine') : t('chal.repair.poor', { n: r.missing }));
    }
    render(true);
    onChange && onChange();
  });
  arrowKeys(root, list);
  return {
    open(m = 'workshop') {
      mode = m;
      msg.textContent = '';
      lastMsg = null;
      render(true);
    },
    close() {
      if (lastMsg) toast(lastMsg);
      lastMsg = null;
    },
    render,
    refresh: () => render(false),
    mode: () => mode,
    rows: () => [...list.querySelectorAll('button.srow')].map((b) => ({ key: b.dataset.key, text: b.textContent, disabled: b.getAttribute('aria-disabled') === 'true' })),
    /** J12 hook: the dialogue system registers a function (npcId) -> boolean here. */
    setDialogueHandler(fn) {
      dialogueHandler = fn;
    },
    openDialogue: (id) => (dialogueHandler ? !!dialogueHandler(id) : false),
  };
}

// ------------------------------------------------------------------------------------------------ the board and the quest log
export function createQuestsView({ root, chal, eco, t, getLang, species, sprites, say, toast, sfx, onChange, extra = null }) {
  const $ = (sel) => root.querySelector(sel);
  const list = $('#qList');
  const msg = $('#qMsg');
  const fishCache = new Map();
  let mode = 'log'; // 'board' = the hand-in buttons work, 'log' = read only (go to the board)
  let lastMsg = null;
  const amount = (n) => t(n === 1 ? 'eco.pearl' : 'eco.pearls', { n });
  const speciesName = (id) => {
    const sp = species.find((s) => s.id === id);
    return sp ? sp.name[getLang()] || sp.name.fr : id;
  };
  const askerName = (id) => {
    const v = VILLAGERS.find((x) => x.id === id);
    return v ? v.name[getLang()].split(',')[0] : id;
  };
  function rewardText(rw) {
    const parts = [];
    if (rw.pearls) parts.push(t('chal.rw.pearls', { amount: amount(rw.pearls) }));
    if (rw.bait) parts.push(t('chal.rw.bait', { n: rw.bait.n, name: t('eco.bait.' + rw.bait.id) }));
    if (rw.float) parts.push(t('chal.rw.float', { name: t('eco.float.' + rw.float) }));
    return parts.join(t('chal.rw.join'));
  }
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
  const orderText = (o) =>
    o.kind === 'fish'
      ? t('chal.order.fish', { asker: askerName(o.asker), name: speciesName(o.speciesId), cm: o.minCm })
      : t('chal.order.family', { asker: askerName(o.asker), n: o.n, family: t('chal.family.' + o.family) });
  /** Short text for the HUD (the first order). */
  function shortOrder(o) {
    return o.kind === 'fish' ? `${speciesName(o.speciesId)} ≥ ${o.minCm} cm` : `${o.n} × ${t('chal.family.' + o.family)}`;
  }

  function render(refocus = true) {
    const ch = chal.get();
    const bucket = eco.get().bucket;
    const focusKey = document.activeElement && root.contains(document.activeElement) ? document.activeElement.dataset.key : null;
    $('#qNote').textContent = t(mode === 'board' ? 'chal.board.hint' : 'chal.log.hint');
    list.textContent = '';
    if (extra) extra(list); // J12-A: the "Histoire" block comes first
    list.append(el('h3', 'qh', t('chal.orders')));
    if (ch.quests.active.length === 0) list.append(el('p', 'sempty', t('chal.order.none')));
    for (const o of ch.quests.active) {
      const pr = progressOf(o, bucket);
      const can = chal.canHandIn(o.id) !== null;
      const b = el('button', 'srow s-' + (can && mode === 'board' ? 'ok' : 'owned'));
      b.type = 'button';
      b.dataset.key = 'order:' + o.id;
      if (o.kind === 'fish') b.append(fishCanvas(o.speciesId));
      else b.append(icon('bucket', false));
      const body = el('span', 'sbody2');
      const state = can ? t('chal.order.have') : t('chal.order.missing', { have: pr.have, need: pr.need });
      body.append(el('span', 'sname', orderText(o)), el('span', 'sline', t('chal.order.reward', { text: rewardText(o.reward) }) + ' · ' + state));
      const act = el('span', 'sact');
      act.append(icon(can ? 'diamond' : 'lock'), document.createTextNode(' ' + (can && mode === 'board' ? t('chal.order.give') : state)));
      b.append(body, act);
      if (!(can && mode === 'board')) b.setAttribute('aria-disabled', 'true');
      b.setAttribute('aria-label', `${orderText(o)} ${t('chal.order.reward', { text: rewardText(o.reward) })}. ${state}${can && mode === 'board' ? '. ' + t('chal.order.give') : ''}`);
      list.append(b);
    }
    list.append(el('h3', 'qh', t('chal.milestones')));
    for (const m of MILESTONES) {
      const done = ch.quests.done.includes(m.id);
      const r = el('div', 'srow mrow s-' + (done ? 'owned' : 'ok'));
      r.append(icon(done ? 'check' : 'diamond', false));
      const body = el('span', 'sbody2');
      body.append(el('span', 'sname', t('chal.m.' + m.id)), el('span', 'sline', t('chal.order.reward', { text: rewardText(m.reward) })));
      const act = el('span', 'sact', t(done ? 'chal.m.done' : 'chal.m.todo'));
      r.append(body, act);
      list.append(r);
    }
    if (refocus) {
      const target = focusKey ? list.querySelector(`[data-key="${focusKey}"]`) : null;
      (target || list.querySelector('button.srow') || $('.closeb')).focus({ preventScroll: true });
    }
  }
  function announce(text) {
    msg.textContent = text;
    lastMsg = text;
    say(text);
  }
  list.addEventListener('click', (ev) => {
    const b = ev.target.closest('button.srow');
    if (!b) return;
    const id = b.dataset.key.slice(6);
    if (mode !== 'board') {
      announce(t('chal.log.hint'));
      return;
    }
    const r = chal.handIn(id);
    if (r.ok) {
      sfx('catch');
      announce(t('chal.order.done', { amount: rewardText(r.given) }));
    } else {
      const o = chal.get().quests.active.find((x) => x.id === id);
      const pr = o ? progressOf(o, eco.get().bucket) : { have: 0, need: 1 };
      announce(t('chal.order.missing', { have: pr.have, need: pr.need }));
    }
    render(true);
    onChange && onChange();
  });
  arrowKeys(root, list);
  return {
    open(m = 'log') {
      mode = m;
      msg.textContent = '';
      lastMsg = null;
      render(true);
    },
    close() {
      if (lastMsg) toast(lastMsg);
      lastMsg = null;
    },
    render,
    refresh: () => render(false),
    mode: () => mode,
    shortOrder,
    rewardText,
    orderText,
    rows: () => [...list.querySelectorAll('.srow')].map((b) => ({ key: b.dataset.key || '', text: b.textContent, disabled: b.getAttribute('aria-disabled') === 'true' })),
  };
}

export { floatOf, baitOf, condIcon };
