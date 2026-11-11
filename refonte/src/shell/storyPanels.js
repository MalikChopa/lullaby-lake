// The story's panels (J12-A): the journal's "Poissons-rêves" page (silhouettes until caught, room for more than 5), the "Lettres" page (Grandma's letters on a
// paper painted by code), and the "Histoire" block of the quest log (the current couplet, where to look, the couplets found with their verses). All views over
// story/engine.js (pure, tested). Everything a row says is WORDS first; icons and the soft glow only repeat it. The 24-slot grid of the carnet is untouched.

import { paintFish, FISH_W, FISH_H } from '../../../src/art/fishPaint.js';
import { drawEco } from '../art/ecoIcons.js';
import { COUPLETS, LETTERS } from '../data/story.js';
import { BOAT_UNLOCK } from '../data/boat.js';
import { rarityNode } from '../../../src/ui/rarity.js';

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};
const icon = (name, small = true, color = '#fdf2dc') => {
  const c = el('canvas', 'ic' + (small ? ' s' : ''));
  c.setAttribute('aria-hidden', 'true');
  drawEco(c, name, color);
  return c;
};

// ------------------------------------------------------------------------------------------------ the dream fish page
export function createDreamPage({ grid, page, pips, i18n, species, sprites, getBook, titles = () => [], titlesEl = null }) {
  const cache = new Map();
  let selected = 0;
  let slots = [];
  const caught = (sp) => !!getBook()[sp.id];
  function sprite(sp, sil) {
    const k = sp.id + (sil ? ':s' : '');
    let img = cache.get(k);
    if (!img) {
      img = new ImageData(paintFish(sprites[sp.sprite], { silhouette: sil }), FISH_W, FISH_H);
      cache.set(k, img);
    }
    return img;
  }
  const canvas = () => {
    const c = el('canvas');
    c.width = FISH_W;
    c.height = FISH_H;
    c.setAttribute('aria-hidden', 'true');
    return c;
  };
  function renderPage() {
    const lang = i18n.getLang();
    const t = i18n.t;
    const sp = species[selected];
    page.textContent = '';
    if (!sp) return;
    const got = caught(sp);
    const head = el('div', 'pg-head');
    const c = canvas();
    c.getContext('2d').putImageData(sprite(sp, !got), 0, 0);
    if (got) c.classList.add('dreamglow');
    const title = el('div', 'pg-title');
    title.append(el('h3', '', got ? sp.name[lang] : t('book.unknownName')));
    if (got) title.append(rarityNode(sp.rarity, i18n));
    else title.append(el('div', '', t('book.rarity') + ' : ?'));
    head.append(c, title);
    page.append(head);
    page.append(el('p', 'd', got ? sp.desc[lang] : t('story.dream.unknown')));
    const cp = COUPLETS.find((x) => x.n === sp.couplet);
    page.append(el('div', 'row', got && cp ? t('story.dream.couplet', { n: sp.couplet, title: t(`story.couplet.${sp.couplet}.title`) }) : t('story.dream.unknownCouplet')));
    if (got) page.append(el('div', 'row glowrow', t('story.dream.glow')));
    const hours = el('div', 'row hours');
    hours.append(icon(sp.phases.includes('night') || sp.phases.includes('dusk') ? 'spirit' : 'star', true), el('span', '', got ? sp.hint[lang] : t('book.hint', { hint: sp.hint[lang] })));
    page.append(hours);
    const rec = el('div', 'row');
    const e = getBook()[sp.id];
    rec.append(el('span', '', t('book.record')), el('span', '', got && e ? t('card.size', { cm: e.recordCm }) : t('book.none')));
    page.append(rec);
    page.setAttribute('aria-label', got ? sp.name[lang] : t('book.unknownName'));
  }
  function select(i) {
    selected = Math.max(0, Math.min(species.length - 1, i));
    slots.forEach((s, k) => s.classList.toggle('sel', k === selected));
    renderPage();
  }
  function refresh() {
    const lang = i18n.getLang();
    const t = i18n.t;
    grid.textContent = '';
    slots = species.map((sp, i) => {
      const b = el('button', 'slot' + (caught(sp) ? ' dreamslot' : ''));
      b.type = 'button';
      const c = canvas();
      c.getContext('2d').putImageData(sprite(sp, !caught(sp)), 0, 0);
      b.append(c, el('small', '', String(i + 1).padStart(2, '0')));
      b.setAttribute('aria-label', caught(sp) ? `${sp.name[lang]}. ${t('story.dream.glow')}` : t('story.dream.slot', { n: i + 1 }));
      b.addEventListener('click', () => select(i));
      b.addEventListener('focus', () => {
        if (selected !== i) select(i);
      });
      grid.append(b);
      return b;
    });
    const n = species.filter(caught).length;
    pips.textContent = '';
    for (let i = 0; i < species.length; i++) {
      const p = el('span', 'pip' + (i < n ? ' on' : ''));
      p.setAttribute('aria-hidden', 'true');
      pips.append(p);
    }
    pips.append(el('span', 'cnt', t('story.dream.found', { n, total: species.length })));
    if (titlesEl) {
      titlesEl.textContent = '';
      for (const k of titles()) titlesEl.append(el('span', 'title', '✦ ' + t(k))); // J12-B: the titles of the lake (cosmetic)
    }
    select(selected);
  }
  grid.addEventListener('keydown', (ev) => {
    const i = slots.indexOf(document.activeElement);
    if (i < 0) return;
    const cols = getComputedStyle(grid).gridTemplateColumns.split(' ').length || 4;
    const target = { ArrowRight: i + 1, ArrowLeft: i - 1, ArrowDown: i + cols, ArrowUp: i - cols, Home: 0, End: slots.length - 1 }[ev.key];
    if (target === undefined) return;
    ev.preventDefault();
    const j = Math.min(slots.length - 1, Math.max(0, target));
    slots[j].focus();
    select(j);
  });
  return { refresh, select, focusFirst: () => slots[selected] && slots[selected].focus({ preventScroll: true }), count: () => species.length, caughtCount: () => species.filter(caught).length, selected: () => selected };
}

// ------------------------------------------------------------------------------------------------ the letters page
export function createLettersPage({ list, page, count, i18n, story, onRead }) {
  let selected = null;
  const t = (k, p) => i18n.t(k, p);
  const titleOf = (id) => t(`story.letter.${id}.title`);
  function renderPage() {
    page.textContent = '';
    if (!selected) {
      page.append(el('p', 'd', t('story.letters.empty')));
      return;
    }
    const sheet = el('div', 'paper');
    const head = el('div', 'paper-head');
    head.append(icon('quill', false, '#6a3a2a'), el('h3', '', `${t('story.letters.read')} · ${titleOf(selected)}`));
    sheet.append(head);
    const body = el('div', 'paper-body');
    for (const line of t(`story.letter.${selected}.body`).split('\n')) body.append(el('p', '', line));
    sheet.append(body);
    page.append(sheet);
    page.setAttribute('aria-label', `${t('story.letters.read')} : ${titleOf(selected)}`);
  }
  function select(id, focus = false) {
    selected = id;
    if (id && story.readLetter(id)) onRead && onRead(id);
    refresh(false);
    renderPage();
    if (focus) {
      const b = list.querySelector(`[data-id="${id}"]`);
      if (b) b.focus({ preventScroll: true });
    }
  }
  function refresh(reselect = true) {
    const ids = story.letters();
    if (reselect && (!selected || !ids.includes(selected))) selected = ids.length ? ids[ids.length - 1] : null;
    list.textContent = '';
    const read = story.get().lettersRead;
    ids.forEach((id, i) => {
      const b = el('button', 'srow lrow' + (id === selected ? ' sel' : ''));
      b.type = 'button';
      b.dataset.id = id;
      b.append(icon('letter', false));
      const body = el('span', 'sbody2');
      body.append(el('span', 'sname', t('story.letters.slot', { n: i + 1, title: titleOf(id) })));
      b.append(body);
      const fresh = !read.includes(id);
      if (fresh) b.append(el('span', 'sact lnew', '✦ ' + t('story.letters.new')));
      b.setAttribute('aria-label', t('story.letters.slot', { n: i + 1, title: titleOf(id) }) + (fresh ? ' · ' + t('story.letters.new') : ''));
      b.addEventListener('click', () => select(id));
      list.append(b);
    });
    count.textContent = t(ids.length === 1 ? 'story.letters.count1' : 'story.letters.count', { n: ids.length }); // (brief 32's request: « Lettre : 1 », not « Lettres : 1 »; the slots count from 1)
    if (reselect) renderPage();
  }
  list.addEventListener('keydown', (ev) => {
    if (ev.key !== 'ArrowDown' && ev.key !== 'ArrowUp') return;
    const bs = [...list.querySelectorAll('button')];
    const i = bs.indexOf(document.activeElement);
    if (i < 0) return;
    ev.preventDefault();
    const j = Math.max(0, Math.min(bs.length - 1, i + (ev.key === 'ArrowDown' ? 1 : -1)));
    bs[j].focus();
    select(bs[j].dataset.id, true);
  });
  return {
    refresh,
    /** Opens on the first unread letter (else the newest). */
    openFirstUnread() {
      const un = story.unreadLetters();
      refresh(true);
      select(un.length ? un[0] : selected);
    },
    focusSelected() {
      const b = list.querySelector('button.sel') || list.querySelector('button');
      if (b) b.focus({ preventScroll: true });
    },
    selected: () => selected,
    /** Selects a letter by id (the last one after the finale). */
    show(id) {
      refresh(true);
      select(id);
    },
  };
}

// ------------------------------------------------------------------------------------------------ the "Histoire" block of the quest log
/** Appends the story block to a list (the quest log). `rewardText` turns { pearls } into words. */
export function storyBlock(list, { story, t, rewardText }) {
  const st = story.get();
  list.append(el('h3', 'qh', t('story.log.title')));
  const cur = story.current();
  const box = el('div', 'srow mrow s-ok storyrow');
  box.append(icon(cur ? 'note' : 'check', false));
  const body = el('span', 'sbody2');
  if (cur) {
    body.append(
      el('span', 'sname', t('story.log.step', { n: cur.n, total: COUPLETS.length, title: t(`story.couplet.${cur.n}.title`) })),
      el('span', 'sline', t('story.log.hintLabel', { hint: t(cur.n === 6 && !st.flags['boat.ready'] ? 'story.couplet.6.hintNoBoat' : `story.couplet.${cur.n}.hint`) })),
      el('span', 'sline', t('story.log.cat')),
      ...(story.unreadLetters().length ? [el('span', 'sline', t('int.log.letter'))] : []),
    );
  } else body.append(el('span', 'sname', t(st.flags['finale.done'] ? 'story.log.finished' : st.step > COUPLETS.length ? 'story.log.finalPending' : 'story.log.waiting')));
  if (cur && cur.n === 6 && !st.flags['boat.ready']) body.append(el('span', 'sline', t('story.log.boatAsk', { fishNeed: BOAT_UNLOCK.fish, pearlsNeed: BOAT_UNLOCK.pearls }))); // the numbers are given: the text may show them
  box.append(body);
  list.append(box);
  list.append(el('h3', 'qh', t('story.log.done')));
  if (st.couplets.length === 0) list.append(el('p', 'sempty', t('story.log.noneYet')));
  for (const n of st.couplets) {
    const c = COUPLETS.find((x) => x.n === n);
    const r = el('div', 'srow mrow s-owned');
    r.append(icon('check', false));
    const b = el('span', 'sbody2');
    b.append(el('span', 'sname', t('story.log.verseOf', { n, title: t(`story.couplet.${n}.title`) })), el('span', 'sline verse', t(`story.couplet.${n}.verse`)));
    if (c) b.append(el('span', 'sline', t('story.reward', { amount: rewardText(c.reward) })));
    r.append(b);
    list.append(r);
  }
}

export { LETTERS };
