// Journal screen: one slot per species (silhouette until caught, number, sprite), a page on the right (sprite, name, rarity in
// pips + word, description, hours with an icon, record), a counter "n / total" with pips (24 species = 4 columns x 6 rows). Arrow keys move between the slots, Enter
// selects, Escape closes (the router). An uncaught species shows only its hour hint, never its name.

import { paintFish, FISH_W, FISH_H } from '../art/fishPaint.js';
import { drawIcon } from './icons.js';
import { rarityNode, rarityText } from './rarity.js';

export function createBook({ grid, page, pips, i18n, data }) {
  const species = data.species;
  const total = species.length;
  const entries = species.map((sp) => ({ sp, spec: data.sprites[sp.sprite] }));
  let state = {}; // book of the game: speciesId -> { count, recordCm }
  let selected = 0;
  let preview = null; // tests only: a made-up species shown on the page as if caught
  const slots = [];
  const cache = new Map();

  const caught = (e) => !!state[e.sp.id];
  function sprite(e, sil) {
    const k = e.sp.id + (sil ? ':s' : '');
    let img = cache.get(k);
    if (!img) {
      img = new ImageData(paintFish(e.spec, { silhouette: sil }), FISH_W, FISH_H);
      cache.set(k, img);
    }
    return img;
  }
  const canvas = (cls) => {
    const c = document.createElement('canvas');
    c.width = FISH_W;
    c.height = FISH_H;
    if (cls) c.className = cls;
    c.setAttribute('aria-hidden', 'true');
    return c;
  };
  const draw = (c, e, sil) => c.getContext('2d').putImageData(sprite(e, sil), 0, 0);

  entries.forEach((e, i) => {
    const b = document.createElement('button');
    b.className = 'slot';
    b.appendChild(canvas());
    const small = document.createElement('small');
    small.textContent = String(i + 1).padStart(2, '0');
    b.appendChild(small);
    b.addEventListener('click', () => select(i));
    b.addEventListener('focus', () => {
      if (selected !== i) select(i);
    });
    slots.push(b);
    grid.appendChild(b);
  });

  function hoursIcons(sp) {
    const box = document.createElement('span');
    box.className = 'ics';
    box.setAttribute('aria-hidden', 'true');
    const add = (name) => {
      const c = document.createElement('canvas');
      c.className = 'ic s';
      drawIcon(c, name, '#fdf2dc');
      box.appendChild(c);
    };
    if (sp.phases.includes('dawn') || sp.phases.includes('day')) add('sun');
    if (sp.phases.includes('dusk') || sp.phases.includes('night')) add('moon');
    return box;
  }

  function renderPage() {
    const lang = i18n.getLang();
    const e = preview ? { sp: preview, spec: data.sprites[preview.sprite] || entries[0].spec } : entries[selected];
    const got = !!preview || caught(e);
    page.textContent = '';
    const head = document.createElement('div');
    head.className = 'pg-head';
    const c = canvas();
    if (preview) c.getContext('2d').putImageData(new ImageData(paintFish(e.spec), FISH_W, FISH_H), 0, 0);
    else draw(c, e, !got);
    const title = document.createElement('div');
    title.className = 'pg-title';
    const h = document.createElement('h3');
    h.textContent = got ? e.sp.name[lang] : i18n.t('book.unknownName');
    title.appendChild(h);
    if (got) title.appendChild(rarityNode(e.sp.rarity, i18n));
    else {
      const q = document.createElement('div');
      q.textContent = i18n.t('book.rarity') + ' : ?';
      title.appendChild(q);
    }
    head.append(c, title);
    page.appendChild(head);

    const d = document.createElement('p');
    d.className = 'd';
    d.textContent = got ? e.sp.desc[lang] : i18n.t('book.notCaught');
    page.appendChild(d);

    // hours: icon(s) + the hour hint (an uncaught species shows ONLY this hint)
    const hours = document.createElement('div');
    hours.className = 'row hours';
    const hintText = e.sp.hint[lang];
    const hs = document.createElement('span');
    hs.textContent = got ? hintText : i18n.t('book.hint', { hint: hintText });
    hours.append(hoursIcons(e.sp), hs);
    hours.setAttribute('role', 'group');
    hours.setAttribute('aria-label', i18n.t('book.hoursLabel') + ' : ' + hintText);
    page.appendChild(hours);

    const rec = document.createElement('div');
    rec.className = 'row';
    const a = document.createElement('span');
    a.textContent = i18n.t('book.record');
    const b = document.createElement('span');
    const entry = state[e.sp.id];
    b.textContent = got && entry ? i18n.t('card.size', { cm: entry.recordCm }) : preview ? i18n.t('card.size', { cm: 150 }) : i18n.t('book.none');
    rec.append(a, b);
    page.appendChild(rec);
    page.setAttribute('aria-label', got ? e.sp.name[lang] + '. ' + rarityText(e.sp.rarity, i18n) : i18n.t('book.unknownName'));
  }

  function select(i) {
    selected = i;
    slots.forEach((s, k) => s.classList.toggle('sel', k === i));
    renderPage();
  }

  grid.addEventListener('keydown', (ev) => {
    const i = slots.indexOf(document.activeElement);
    if (i < 0) return;
    const cols = getComputedStyle(grid).gridTemplateColumns.split(' ').length || 4; // 4 columns (J6: 6 rows for 24 species; the grid keeps 4 columns at the larger text sizes)
    const target = { ArrowRight: i + 1, ArrowLeft: i - 1, ArrowDown: i + cols, ArrowUp: i - cols, Home: 0, End: slots.length - 1 }[ev.key];
    if (target === undefined) return;
    ev.preventDefault();
    const n = Math.min(slots.length - 1, Math.max(0, target));
    slots[n].focus();
    select(n);
  });

  function refreshAll() {
    const lang = i18n.getLang();
    slots.forEach((s, i) => {
      const e = entries[i];
      draw(s.querySelector('canvas'), e, !caught(e));
      s.setAttribute('aria-label', caught(e) ? i18n.t('ui.knownFish', { name: e.sp.name[lang], n: i + 1 }) : i18n.t('ui.unknownFish', { n: i + 1 }));
    });
    const n = entries.filter(caught).length;
    pips.textContent = '';
    for (let i = 0; i < total; i++) {
      const p = document.createElement('span');
      p.className = 'pip' + (i < n ? ' on' : '');
      p.setAttribute('aria-hidden', 'true');
      pips.appendChild(p);
    }
    const cnt = document.createElement('span');
    cnt.className = 'cnt';
    cnt.textContent = i18n.t('book.found', { n, total });
    pips.appendChild(cnt);
    select(selected);
  }

  refreshAll();
  return {
    /** Call when the journal opens (new catches) and when the language changes. */
    refresh(book) {
      if (book) state = book;
      refreshAll();
    },
    /** Tests only: shows a made-up species on the page as if it were caught (null = back to normal). */
    preview(sp) {
      preview = sp;
      renderPage();
    },
    select,
    selected: () => selected,
    count: () => total,
    caughtCount: () => entries.filter(caught).length,
  };
}
