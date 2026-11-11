// HUD over the canvas (HTML, pixel frames of the 2D game), UI redesign (brief 27): a clock capsule (time-of-day icon, clock, weather icon), the place name that appears
// briefly when a zone is entered (never permanent), ONE message slot at the bottom (a toast or the context hint: never both, shell/ui/hintState.js), name tags near
// villagers and buildings (text, never colour alone), and the catch card with the fish painted by src/art/fishPaint.js. Toasts: one at a time, never stacked, never
// blocking (the rules of src/core/toast.js). The money, bucket, order and gear capsules are filled by the shell (renderPurse / renderChal): it owns the economy.
// The legacy ids (badgeText, bookText, hint, toast, zoneText) are kept: they carry the full text for the screen reader and the browser checks.

import { SPRITES_ALL as fishSprites } from '../data/allSpecies.js';
import { paintFish, FISH_W, FISH_H } from '../../../src/art/fishPaint.js';
import { fishPrice } from '../economy/model.js';
import { createHintState, slot } from '../shell/ui/hintState.js';
import { placeName } from '../logic/placeName.js';
import { drawAny, PHASE_ICON, WEATHER_ICON } from '../art/uiIcons.js';

const ZONE_BANNER_S = 3.6; // how long the place name stays after entering a zone

export function createHud(ctx, view, tiers) {
  const { $, game } = ctx;
  const { species, weatherList } = ctx.data;
  const baseIds = new Set(species.map((s) => s.id));
  const baseCount = (book) => Object.keys(book).filter((id) => baseIds.has(id)).length; // the dream fish have their own page: "n / 24" counts the 24
  const hint = $('hint');
  const badgeText = $('badgeText');
  const bookText = $('bookText');
  const toast = $('toast');
  const app = $('app');
  let toastLeft = 0;
  let toastText = null;
  const waitingToasts = []; // at most 2 lines wait; a line identical to the current or the last waiting one is dropped
  const tags = new Map();
  const hintState = createHintState();
  let hintLine = '';
  let hintKind = 'none';
  let zoneLeft = 0;
  let iconPhase = '';
  let iconWeather = '';
  let calm = false;
  let coachShown = false;
  let sceneLabel = ''; // brief 33: the canvas label while inside a room ('' = the lake's own label)
  const setText = (el, v) => {
    if (el.textContent !== v) el.textContent = v;
  };
  const setTip = (el, v) => {
    if (el.dataset.tip !== v) {
      el.dataset.tip = v;
      el.setAttribute('aria-label', v);
    }
  };
  const H = {
    /** `urgent` (J12-A, a couplet found): shown at once, in place of the current line, the waiting ones are dropped (a story message must not get lost in the queue). */
    showToast(text, s = 2.5, urgent = false) {
      if (urgent && text) {
        waitingToasts.length = 0;
        toastText = text;
        toast.textContent = text;
        toast.hidden = false;
        toastLeft = s;
        return;
      }
      if (!text || text === toastText || waitingToasts.some((w) => w.text === text)) return;
      if (toastText !== null) {
        waitingToasts.push({ text, s });
        while (waitingToasts.length > 2) waitingToasts.shift();
        return;
      }
      toastText = text;
      toast.textContent = text;
      toast.hidden = false;
      toastLeft = s;
    },
    toastShown: () => (toast.hidden ? '' : toast.textContent),
    applyLang() {
      const tx = ctx.tx;
      document.documentElement.lang = ctx.lang;
      H.refreshActionText();
      $('cardRelease').textContent = tx['btn.release'];
      $('turnL').setAttribute('aria-label', tx['r.turnL']);
      $('turnR').setAttribute('aria-label', tx['r.turnR']);
      $('btnMenu').dataset.tip = tx['hud2.menuTip'];
      $('btnMenu').setAttribute('aria-label', tx['menu.open']);
      $('tracker').dataset.tip = tx['hud2.trackerTip'];
      $('condCap').dataset.tip = tx['hud2.condTip'];
      $('purse').dataset.tip = tx['hud2.pearlsTip'];
      H.zone = null;
      H.clockKey = '';
      sceneLabel = ''; // the shell has just written the lake's label: a room writes its own again at the next frame
      for (const t of tags.values()) t.text = null;
    },
    /** The touch button says "Fish" (default); next to a door / a person the SMALL context button says what the same press does (Talk, Enter, Climb). */
    actionKey: 'r.fish',
    refreshActionText() {
      const tx = ctx.tx;
      $('fishBtn').textContent = tx['r.fish'];
      $('ctxBtn').textContent = H.actionKey !== 'r.fish' ? tx[H.actionKey] : '';
      $('ctxBtn').setAttribute('aria-label', H.actionKey !== 'r.fish' ? tx[H.actionKey] : tx['ui.contextOpen']);
    },
    setAction(key) {
      if (key === H.actionKey) return;
      H.actionKey = key;
      H.refreshActionText();
      H.contextChanged && H.contextChanged(key !== 'r.fish');
    },
    contextChanged: null,
    zone: null,
    setZone(z) {
      if (z === H.zone) return;
      H.zone = z;
      if (z && ctx.playing && ctx.playing()) {
        // the place name appears briefly, then goes (never a permanent line)
        setText($('zoneText'), placeName(z, ctx.lang)); // never "undefined" (logic/placeName.js)
        zoneLeft = ZONE_BANNER_S;
        $('zoneText').classList.add('on');
      }
    },
    zoneBannerOn: () => zoneLeft > 0,
    /** Brief 29: the name of the room stays shown while inside (null = leaving: the next zone is announced again). Brief 33: the 3D canvas's text alternative names the room. */
    setRoom(name) {
      if (name) {
        setText($('zoneText'), name);
        $('zoneText').classList.add('on');
        zoneLeft = Infinity;
        const lbl = ctx.fmt('a11y.sceneRoom', { place: name });
        if (lbl !== sceneLabel) {
          sceneLabel = lbl;
          $('scene').setAttribute('aria-label', lbl);
        }
      } else {
        zoneLeft = 0;
        $('zoneText').classList.remove('on');
        H.zone = null;
        if (sceneLabel) {
          sceneLabel = '';
          $('scene').setAttribute('aria-label', ctx.tx['r.scene']);
        }
      }
    },
    /** Name tags: list of { id, text, x, y, z } in screen space (null = hidden). */
    tags(list) {
      const seen = new Set();
      for (const t of list) {
        seen.add(t.id);
        let e = tags.get(t.id);
        if (!e) {
          const el = document.createElement('div');
          el.className = 'tag' + (t.cls ? ' ' + t.cls : '');
          $('tags').appendChild(el);
          e = { el, text: null };
          tags.set(t.id, e);
        }
        if (e.text !== t.text) {
          e.el.textContent = t.text;
          e.text = t.text;
        }
        e.el.style.left = t.x.toFixed(0) + 'px';
        e.el.style.top = t.y.toFixed(0) + 'px';
        e.el.hidden = false;
      }
      for (const [id, e] of tags) if (!seen.has(id)) e.el.hidden = true;
    },
    tagTexts: () => [...tags.values()].filter((e) => !e.el.hidden).map((e) => e.text),
    /** The line the game would say now and its kind ('walk' | 'near' | 'spot' | 'phase' | 'urgent'); whether it shows is decided in update(). */
    setHint(h, kind = 'near') {
      hintLine = h || '';
      hintKind = kind;
      if (hint.textContent !== hintLine) hint.textContent = hintLine;
    },
    hint: () => hint.textContent,
    /** True while the hint is on screen (not faded, no toast over it). */
    hintVisible: () => !hint.classList.contains('off'),
    badge: () => badgeText.textContent,
    setCalm(v) {
      calm = !!v;
      app.dataset.calm = calm ? '1' : '0';
    },
    setCoachShown(v) {
      coachShown = !!v;
    },
    clockKey: '',
    /** Clock capsule, journal counter, message slot and zone banner from the core state. */
    update(st, dt) {
      const W = st.world;
      const mins = Math.floor((((5 + 24 * W.dayFrac) % 24) * 60) / 10) * 10;
      const time = String(Math.floor(mins / 60)).padStart(2, '0') + ':' + String(mins % 60).padStart(2, '0');
      const wName = (weatherList.find((w) => w.id === W.weather) || weatherList[0]).name[ctx.lang];
      const phase = ctx.tx['phase.' + W.phase];
      const b = ctx.fmt('r.badge', { phase, weather: wName, time });
      setText(badgeText, b);
      const key = W.phase + '|' + W.weather + '|' + time + '|' + ctx.lang;
      if (key !== H.clockKey) {
        H.clockKey = key;
        setText($('clockText'), time);
        const tip = ctx.fmt('hud2.clockTip', { phase, weather: wName, time });
        setTip($('clock'), tip);
        app.dataset.phase = W.phase;
        const ip = PHASE_ICON[W.phase] || 'sun';
        if (ip !== iconPhase) {
          iconPhase = ip;
          drawAny($('icPhase'), ip, '#ffd987');
        }
        const iw = WEATHER_ICON[W.weather] || 'cloud';
        if (iw !== iconWeather) {
          iconWeather = iw;
          drawAny($('icWeather'), iw, '#fdf2dc');
        }
        $('icWeather').hidden = W.weather === 'clear'; // a clear sky has no second icon (the sun of the day already says it; the words are in the tooltip and the label)
      }
      const bk = ctx.fmt('r.book', { n: baseCount(st.book), total: species.length });
      setText(bookText, bk);
      if (toastLeft > 0) {
        toastLeft -= dt;
        if (toastLeft <= 0) {
          toast.hidden = true;
          toastText = null;
          const n = waitingToasts.shift();
          if (n) H.showToast(n.text, n.s);
        }
      }
      // brief 33: a line in the water: the place name steps aside at once (on a small phone the float can land just under the banner at the top)
      if (zoneLeft > 0 && zoneLeft !== Infinity && st.fishing && st.fishing.phase !== 'idle') zoneLeft = Math.min(zoneLeft, 1e-6);
      if (zoneLeft > 0) {
        zoneLeft -= dt;
        if (zoneLeft <= 0) $('zoneText').classList.remove('on');
      }
      // ONE message at the bottom: a toast wins, else the hint while it is useful; the walking hint waits while the coach talks or in the quiet interface
      const hs = hintState.step(dt, hintLine, hintKind, calm || coachShown);
      const sl = slot({ toast: toast.hidden ? '' : toast.textContent, hint: hs });
      hint.classList.toggle('off', sl.which !== 'hint');
      toast.classList.toggle('off', toast.hidden);
      app.dataset.msg = sl.which;
    },
    cardShown: () => !$('card').hidden,
    hideCard() {
      $('card').hidden = true;
    },
    showCard(ev) {
      const sp = game.speciesById(ev.speciesId);
      const img = new ImageData(paintFish(fishSprites[sp.sprite]), FISH_W, FISH_H);
      const cardCtx = $('cardFish').getContext('2d');
      cardCtx.clearRect(0, 0, FISH_W, FISH_H);
      cardCtx.putImageData(img, 0, 0);
      view.fishCanvas.getContext('2d').putImageData(img, 0, 0);
      view.fishTex.needsUpdate = true;
      $('cardName').textContent = sp.name[ctx.lang];
      const info = $('cardInfo');
      info.textContent = '';
      const add = (text, cls) => {
        const s = document.createElement('span');
        s.textContent = text;
        if (cls) s.className = cls;
        info.appendChild(s);
      };
      if (ev.isNew) add('✦ ' + ctx.tx['card.new'], 'new');
      add(ctx.fmt('card.size', { cm: ev.sizeCm }));
      add(ctx.tx['rarity.' + sp.rarity]);
      if (ev.isRecord && !ev.isNew) add(ctx.tx['card.record']);
      if (sp.dream) add(ctx.tx['story.card.glow'], 'glow'); // J12-A: a dream fish carries a couplet: a soft light and a line (never the light alone)
      $('card').classList.toggle('dream', !!sp.dream);
      const price = fishPrice(sp, ev.sizeCm);
      add(price === 1 ? ctx.tx['eco.value1'] : ctx.fmt('eco.value', { n: price }));
      $('cardBook').textContent = ctx.fmt('r.book', { n: baseCount(game.getState().book), total: species.length });
      $('card').hidden = false;
    },
  };
  H.applyLang();
  $('debug').hidden = !ctx.debug;
  return H;
}
