// In-game texts: hint, power meter, bite / "he left" message, catch card. Only writes the page when the view changes.

import { paintFish, FISH_W, FISH_H } from '../art/fishPaint.js';
import { rarityNode } from './rarity.js';

export const POWER_PIPS = 10;

export function createHud({ root, i18n, announcer, getSettings, data, getBookInfo = () => ({ n: 0, total: data.species.length }) }) {
  const $ = (id) => root.querySelector(id);
  const hint = $('#hint');
  const msg = $('#msg');
  const bub = $('#bub');
  const bang = $('#bang');
  const power = $('#power');
  const ppips = $('#ppips');
  const pval = $('#pval');
  const card = $('#card');
  const tagNew = $('#tagNew');
  const tagRecord = $('#tagRecord');
  const cardName = $('#cardName');
  const cardInfo = $('#cardInfo');
  const cardDesc = $('#cardDesc');
  const cardBook = $('#cardBook');
  const cardCanvas = $('#cardFish');
  const cctx = cardCanvas.getContext('2d');

  const pips = [];
  for (let i = 0; i < POWER_PIPS; i++) {
    const p = document.createElement('i');
    pips.push(p);
    ppips.appendChild(p);
  }
  let shownPower = -1;

  let viewKey = '';
  let escapedLeftS = 0; // remaining seconds of the "he left" message (game time)
  let cardData = null;
  const state = { phase: 'idle' };

  function biteText() {
    return i18n.t(getSettings().fishWaitsForever ? 'hud.biteForever' : 'hud.biteTimed');
  }

  function renderCard() {
    if (!cardData) return;
    const sp = cardData.species || data.species.find((s) => s.id === cardData.speciesId);
    const lang = i18n.getLang();
    cardName.textContent = sp.name[lang];
    cardInfo.textContent = '';
    cardInfo.append(i18n.t('card.size', { cm: cardData.sizeCm }), ' · ', rarityNode(sp.rarity, i18n));
    cardDesc.textContent = sp.desc[lang];
    const info = getBookInfo();
    cardBook.textContent = i18n.t('card.book', info);
    tagNew.hidden = !cardData.isNew;
    tagRecord.hidden = !cardData.isRecord;
    const spec = data.sprites[sp.sprite] || data.sprites[data.species[0].sprite];
    cctx.putImageData(new ImageData(paintFish(spec), FISH_W, FISH_H), 0, 0);
  }

  function render() {
    const phase = state.phase;
    const showEscaped = escapedLeftS > 0;
    const key = [phase, showEscaped, getSettings().fishWaitsForever, i18n.getLang()].join('|');
    if (key === viewKey) return;
    viewKey = key;
    const hintKey = { idle: 'hud.hintIdle', waiting: 'hud.hintWaiting' }[phase];
    hint.textContent = hintKey && !showEscaped ? i18n.t(hintKey) : '';
    hint.hidden = !(hintKey && !showEscaped);
    const biting = phase === 'bite';
    bub.hidden = !(biting || showEscaped);
    bang.hidden = !biting;
    msg.textContent = biting ? biteText() : showEscaped ? i18n.t('hud.escaped') : '';
    power.hidden = phase !== 'charging';
    card.hidden = phase !== 'caught';
    if (phase === 'caught') renderCard();
  }

  return {
    /** Called each game step with the events and the fishing phase. dt = game seconds of that step. */
    update(phase, events, dt, escapedMsgS) {
      for (const e of events) {
        if (e.type === 'bite') announcer.say(biteText());
        if (e.type === 'escaped') {
          escapedLeftS = escapedMsgS;
          announcer.say(i18n.t('hud.escaped'));
        }
        if (e.type === 'caught') {
          cardData = e;
          const sp = data.species.find((s) => s.id === e.speciesId);
          announcer.say(i18n.t('card.caught', { name: sp.name[i18n.getLang()], cm: e.sizeCm }));
        }
        if (e.type === 'cast' || e.type === 'retract' || e.type === 'reel') escapedLeftS = 0;
      }
      if (escapedLeftS > 0) escapedLeftS = Math.max(0, escapedLeftS - dt);
      state.phase = phase;
      render();
    },
    /** Power meter while charging: p in 0..1 -> 10 pips and "n / 10" (text, never colour only). */
    setPower(p) {
      const n = Math.round(Math.min(1, Math.max(0, p)) * POWER_PIPS);
      if (n === shownPower) return;
      shownPower = n;
      pips.forEach((el, i) => el.classList.toggle('on', i < n));
      pval.textContent = n + ' / ' + POWER_PIPS;
    },
    /** Language or setting changed: redraw everything. */
    refresh() {
      viewKey = '';
      render();
    },
    /** Tests only: the card as if this (made-up) species had just been caught. */
    previewCard(sp, sizeCm = 150, isNew = true, isRecord = true) {
      cardData = { speciesId: sp.id, species: sp, sizeCm, isNew, isRecord };
      state.phase = 'caught';
      viewKey = '';
      render();
    },
    focusRelease() {
      $('#btnRelease').focus({ preventScroll: true });
    },
  };
}
