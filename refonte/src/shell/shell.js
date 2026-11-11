// The game shell around the 3D world (J9-A): start screen, settings, journal, photo mode, sound, save and the one-time import of a 2D save, pause and
// visibility, the portrait-phone message, toasts and screen-reader announcements. It is built BEFORE the 3D world (the start screen is usable while
// the world builds) and joined to it by attach(app) once the world exists. All browser objects are used here; the pure parts are in machine.js,
// sound.js, save.js, persist.js, boot.js, photo.js (unit-tested in Node).
//   screens  home -> game -> (book | settings | photo) -> game          (machine.js; #app[data-screen] drives the CSS)
//   the game clock and the fishing core run only while playing: the game screen, after Start, tab visible, phone not in the "turn me" message.

import { fork } from '../../../src/core/rng.js';
import { pickLang } from '../../../src/core/lang.js';
import { announceKey } from '../../../src/core/toast.js';
import { createRouter } from '../../../src/input/input.js';
import { applyDom } from '../../../src/ui/i18n.js';
import { createAnnouncer } from './ui/announce.js'; // brief 33: lines of the same moment are joined, repeats dropped (the 2D announcer kept only the last line)
import { createBook } from '../../../src/ui/book.js';
import { createSettingsUi } from '../../../src/ui/settings.js';
import { paintIcons } from '../../../src/ui/icons.js';
import { initialState, reduce, playing, skipped, atBase } from './machine.js';
import { createShellAudio, createSound, levelsFor, indoorLevels } from './sound.js';
import { makeHdSave, defaultHdSettings } from './save.js';
import { savePhoto3d } from './photo.js';
import { createTabGuard } from './tabs.js';
import { PORTRAIT_QUERY, turned, viewSize } from '../app/viewport.js';
import { systemReduced } from '../app/settings.js';
import { createShopUi } from '../economy/shopUi.js';
import { createShopView } from './shop.js';
import { createRepairView, createQuestsView, paintFace, condWord } from './panels.js';
import { createFightUi } from './fightUi.js';
import { drawEco } from '../art/ecoIcons.js';
import { paintUiIcons } from '../art/uiIcons.js';
import { createMenu } from './ui/menu.js';
import { createCoach, TIPS } from './ui/coach.js';
import { createPanelStack } from './ui/panelStack.js';
import { createTooltips } from './ui/tooltip.js';
import { createBagView } from './ui/bag.js';
import { wireNav } from './ui/listNav.js';
import { wrapTab, returnTo } from './ui/focusOrder.js';
import { folkSheet, FOLK } from '../art/folk.js';
import { VILLAGERS } from '../data/map.js';
import { SHOP, BAITS, FLOATS } from '../data/economy.js';
import { betterHere, gearOf, effectiveSpecies, gearMods } from '../economy/draw.js';
import { SPRITES_ALL, DREAM_SPECIES } from '../data/allSpecies.js';
import { CHARACTERS, DIALOGUES, COUPLETS } from '../data/story.js';
import { ROOM_CHARACTERS, ROOM_DIALOGUES, ROOM_AMBIENT } from '../data/dialogues-interior.js';
import { pickAmbient } from '../story/dialogue.js';
import { createRunner } from '../story/dialogue.js';
import { dialogueEnv, ambientFor, greetingKey } from '../story/env.js';
import { createDialogueUi } from './dialogueUi.js';
import { createDreamPage, createLettersPage, storyBlock } from './storyPanels.js';
import { createLullaby } from './lullaby.js';
import { createFinale } from '../story/finale.js';
import { BOAT_UNLOCK } from '../data/boat.js';

const FOCUSABLE = 'button:not([disabled]),input:not([disabled]),[href],select,textarea,[tabindex]:not([tabindex="-1"])';
const NOTICE_KEY = { fresh: 'save.corrupt', restored: 'save.restored', future: 'save.future', memory: 'save.memory', 'other-tab': 'r.save.otherTab' }; // the second tab: it does not save, the first one does
const LASTING = new Set(['future', 'memory', 'other-tab']); // conditions that stay true: also written in Settings

export function createShell(ctx) {
  const { $, game, settings, boot, query, eco, chal, story, boat } = ctx;
  const root = $('app');
  const dbg = boot.dbg;
  const announcer = createAnnouncer($('live'));
  const t = (k, p) => ctx.i18n.t(k, p);
  let state = initialState();
  let app = null; // { view, tiers, input, hud, loop, walk } once the 3D world exists
  let hidden = document.hidden;
  let deferred = false; // a charge was released on leaving the game: the core is paused after the frame that casts it
  let started = false;
  let saveObj = boot.save;
  const hints = { ...saveObj.hints };
  let playS = saveObj.playS || 0;
  let importedNote = false;

  // ---------------------------------------------------------------- sound
  const audio = createShellAudio({
    makeContext: () => {
      const C = window.AudioContext || window.webkitAudioContext;
      return C ? new C({ latencyHint: 'playback' }) : null;
    },
    fetchImpl: (u, o) => fetch(u, o),
    rng: fork(ctx.seed, 'audio#' + boot.sessions),
    analyser: !!dbg.debug,
  });
  const { engine } = audio;
  const sound = createSound({ engine, settings, say: (k) => announcer.say(t(k)), reflect: () => settingsUi.reflect() });
  document.addEventListener('click', (ev) => {
    if (ev.target.closest && ev.target.closest('button')) engine.sfx('click');
  });

  // ---------------------------------------------------------------- save
  const keptWorld = { clock: saveObj.clock, weather: saveObj.weather };
  function snapshot() {
    const st = game.getState();
    const w = ctx.worldPinned ? keptWorld : game.exportWorld();
    const keep = {};
    for (const k of Object.keys(defaultHdSettings())) keep[k] = settings[k];
    keep.muted = sound.persistedMuted();
    let world = saveObj.world;
    if (app && app.walk) {
      world = { x: +app.walk.pl.x.toFixed(2), z: +app.walk.pl.z.toFixed(2), dir: app.walk.pl.dir, zone: app.hud.zone ? app.hud.zone.id : null };
      const bs = app.walk.boatSave ? app.walk.boatSave() : null; // J12-B: saved while rowing = the boat is moored at the nearest dock and the angler stands on it
      if (bs) world = { x: bs.x, z: bs.z, dir: bs.dir, zone: world.zone };
    }
    saveObj = makeHdSave(saveObj, { seed: ctx.seed, sessions: boot.sessions, clock: w.clock, weather: w.weather, pity: st.pity, book: st.book, settings: keep, world, hints, playS, economy: eco.get(), challenge: chal.get(), story: story.get(), boat: boat.get() });
    return saveObj;
  }
  let saveTimer = null;
  function writeNow() {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    if (!started) return false; // a visit that never started changes nothing on disk (the import offer would vanish otherwise)
    return boot.persist.write(snapshot());
  }
  function scheduleSave() {
    if (started && !saveTimer) saveTimer = setTimeout(writeNow, 400);
  }
  let noticeKind = null;
  let lastingKind = null;
  let noticeShown = false;
  let noticeTimer = null;
  function renderNotice() {
    const note = $('saveNote');
    note.hidden = !(noticeShown && noticeKind);
    note.textContent = noticeKind ? t(NOTICE_KEY[noticeKind]) : '';
    const line = $('saveState');
    line.hidden = !lastingKind;
    line.textContent = lastingKind ? t(NOTICE_KEY[lastingKind]) : '';
  }
  function showNotice(kind) {
    if (!NOTICE_KEY[kind]) return;
    noticeKind = kind;
    noticeShown = true;
    if (LASTING.has(kind)) lastingKind = kind;
    renderNotice();
    announcer.say(t(NOTICE_KEY[kind]));
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => {
      noticeShown = false;
      renderNotice();
    }, 12000);
  }
  window.addEventListener('pagehide', writeNow);
  window.addEventListener('storage', (ev) => {
    if (!boot.memoryOnly && ev.key === boot.persist.keys.main) boot.persist.otherTab(); // another tab wrote the save: this one stops writing
  });
  if (!boot.memoryOnly && typeof BroadcastChannel !== 'undefined') {
    try {
      createTabGuard({ channel: new BroadcastChannel('lullaby-lake:hd2d-tabs' + (dbg.debug ? '-debug' : '')), isStarted: () => started, onOther: () => boot.persist.otherTab() });
    } catch {
      /* no channel: the storage event still protects the save */
    }
  }
  setInterval(() => {
    if (playing(state)) writeNow();
  }, ctx.data.config.autosaveS * 1000);

  // ---------------------------------------------------------------- language, text size, reduced motion
  function applyTextScale() {
    document.documentElement.style.setProperty('--fs', String(settings.textScale));
    document.documentElement.dataset.fs = String(settings.textScale);
  }
  function applyReduced() {
    if (ctx.query.get('rm') !== '1') ctx.reduced = ctx.isReduced();
    document.body.classList.toggle('rm', ctx.reduced);
  }
  function applyLangAll() {
    applyDom(ctx.i18n);
    for (const o of $('quality').options) o.textContent = t('r.q.' + o.value);
    $('scene').setAttribute('aria-label', t('r.scene'));
    if (boot.offer) $('offerBody').textContent = t('r.import.body', { n: boot.offer.books });
    if (book) book.refresh();
    if (app) app.hud.applyLang();
    renderNotice();
    renderPhotoMsg();
    renderCoach();
    refreshMenu();
    if (state.screen === 'bag') bag.render();
    if (settingsUi) settingsUi.reflect();
    renderPurse();
    renderGear();
    renderChal();
    fightUi.applyLang();
    if (state.screen === 'shop') shop.refresh();
    if (state.screen === 'repair') repairView.refresh();
    if (state.screen === 'quests') questsView.refresh();
    dialogueUi.applyLang();
    setBookPage(bookPage);
    if (state.screen === 'book') {
      dreamPage.refresh();
      lettersPage.refresh();
    }
  }

  // ---------------------------------------------------------------- journal and settings
  const book = createBook({ grid: $('grid'), page: $('page'), pips: $('pips'), i18n: ctx.i18n, data: { species: ctx.data.species, sprites: SPRITES_ALL } });
  // brief 33: the selected fish / dream fish / letter is said to the screen reader too (aria-current), not only drawn (the grids of src/ui/book.js and storyPanels.js mark it with `.sel`)
  {
    const sync = (box) => {
      for (const b of box.querySelectorAll('button')) {
        const on = b.classList.contains('sel');
        if (on && b.getAttribute('aria-current') !== 'true') b.setAttribute('aria-current', 'true');
        else if (!on && b.hasAttribute('aria-current')) b.removeAttribute('aria-current');
      }
    };
    for (const id of ['grid', 'dreamGrid', 'letterList']) {
      const box = $(id);
      new MutationObserver(() => sync(box)).observe(box, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
      sync(box);
    }
  }
  const settingsUi = createSettingsUi({
    root: $('s-settings'),
    homeLang: $('homeLang'),
    settings,
    systemReducedMotion: systemReduced,
    getLang: () => ctx.lang,
    onChange(key) {
      if (key === 'volume' || key === 'musicStyle') sound.applyVolumes();
      else if (key === 'muted') sound.setMuted(settings.muted);
      else if (key === 'lang') {
        ctx.setLang(pickLang(navigator.language, settings.lang));
        applyLangAll();
      } else if (key === 'textScale') applyTextScale();
      else if (key === 'reducedMotion') applyReduced();
      else if (key === 'fishWaitsForever') game.setFishWaitsForever(settings.fishWaitsForever);
      scheduleSave();
    },
  });
  // J11: the automatic-fight setting lives in the challenge state (saved with it); its box is wired here (the 2D settings module does not know it)
  const chkAuto = $('chkAuto');
  chkAuto.checked = chal.autoFight();
  chkAuto.addEventListener('change', () => chal.setAuto(chkAuto.checked));
  $('quality').value = settings.quality;
  $('quality').addEventListener('change', (e) => {
    settings.quality = e.target.value;
    if (app) app.tiers.select(e.target.value);
    scheduleSave();
  });

  // ---------------------------------------------------------------- economy: HUD purse, gear line, shop (J10)
  const amount = (n) => t(n === 1 ? 'eco.pearl' : 'eco.pearls', { n });
  function renderPurse() {
    const e = eco.get();
    const txt = t('eco.purse', { money: e.money, n: e.bucket.length });
    if ($('purseText').textContent !== txt) $('purseText').textContent = txt;
    if ($('pearlNum').textContent !== String(e.money)) $('pearlNum').textContent = String(e.money);
    if ($('bucketNum').textContent !== String(e.bucket.length)) $('bucketNum').textContent = String(e.bucket.length);
    $('purse').setAttribute('aria-label', t('eco.purseAria', { money: e.money, n: e.bucket.length }));
  }
  function gearLine() {
    const e = eco.get();
    const q = e.equipped;
    const bait = t('eco.bait.' + q.bait) + (q.bait !== 'ver' ? ' × ' + (e.gear.baits[q.bait] || 0) : '');
    return t('eco.gear.line', { rod: t('eco.rod.' + q.rod), bait, float: q.float ? t('eco.float.' + q.float) : t('eco.none'), lantern: e.gear.lantern ? (q.lantern ? t('eco.on') : t('eco.off')) : t('eco.none') });
  }
  function renderGear() {
    $('gearLine').textContent = t('eco.gear.title') + ' — ' + gearLine();
  }
  const shopUi = createShopUi(eco);
  const shop = createShopView({
    root: $('s-shop'),
    ui: shopUi,
    store: eco,
    t,
    getLang: () => ctx.lang,
    species: ctx.data.allSpecies,
    sprites: SPRITES_ALL,
    say: (text) => announcer.say(text),
    toast: (text) => app && app.hud.showToast(text, 3),
    sfx: (name) => engine.sfx(name),
    onChange: () => {
      renderPurse();
      renderGear();
    },
  });
  {
    // the shopkeeper's face: the front frame of her sprite sheet (painted by code like the villager in the world)
    const look = (VILLAGERS.find((v) => v.id === SHOP.keeperId) || VILLAGERS[0]).look;
    const sheet = folkSheet(look);
    const face = $('shopFace');
    face.width = FOLK.cellW;
    face.height = FOLK.cellH;
    const cell = new ImageData(FOLK.cellW, FOLK.cellH);
    for (let y = 0; y < FOLK.cellH; y++) for (let x = 0; x < FOLK.cellW; x++) for (let c = 0; c < 4; c++) cell.data[(y * FOLK.cellW + x) * 4 + c] = sheet.data[(y * sheet.w + x) * 4 + c];
    face.getContext('2d').putImageData(cell, 0, 0);
  }
  // ---------------------------------------------------------------- challenge (J11): condition in the HUD, the Atelier, the board, the fight
  const fightUi = createFightUi({ $, t, say: (text) => announcer.say(text) });
  const panelDeps = {
    chal,
    eco,
    t,
    say: (text) => announcer.say(text),
    toast: (text) => app && app.hud.showToast(text, 3),
    sfx: (name) => audio.hooks.play(name),
    onChange: () => {
      renderPurse();
      renderGear();
      renderChal();
    },
  };
  const repairView = createRepairView({ root: $('s-repair'), ...panelDeps });
  const questsView = createQuestsView({ root: $('s-quests'), ...panelDeps, getLang: () => ctx.lang, species: ctx.data.species, sprites: SPRITES_ALL, extra: (list) => storyBlock(list, { story, t, rewardText: (r) => questsView.rewardText(r) }) });
  {
    const v = VILLAGERS.find((x) => x.id === 'repairer') || VILLAGERS[0];
    paintFace($('repFace'), folkSheet(v.look), FOLK);
  }
  let questsMode = 'log';
  let bookWanted = null; // the page the journal opens on ('letters' from the cabin desk), once
  let repairMode = 'workshop';
  function renderChal() {
    const w = chal.get().wear;
    const txt = t('chal.hud.cond', { line: Math.round(w.line), rod: Math.round(w.rod) });
    const worn = Math.min(w.line, w.rod) < 60;
    $('condText').textContent = (worn ? '◇ ' : '') + txt;
    $('condCap').hidden = !worn; // the gear's condition shows in the HUD only when it is worn (it is always in the bag)
    if (state.screen === 'bag') bag.render();
    $('condText').setAttribute('aria-label', t('chal.hud.condAria', { line: Math.round(w.line), rod: Math.round(w.rod) }));
    const o = chal.get().quests.active[0];
    const ot = o ? t('chal.hud.order', { text: questsView.shortOrder(o) }) : '';
    if ($('orderText').textContent !== ot) $('orderText').textContent = ot;
    $('orderShort').textContent = o ? questsView.shortOrder(o) : '';
    $('tracker').hidden = !o;
    $('tracker').setAttribute('aria-label', o ? t('hud2.trackerAria', { text: questsView.shortOrder(o) }) : '');
    $('condLine').textContent = `${t('chal.cond.line')} ${Math.round(w.line)} % (${condWord(t, w.line)}) · ${t('chal.cond.rod')} ${Math.round(w.rod)} % (${condWord(t, w.rod)})`;
  }
  chal.on((ev) => {
    renderChal();
    scheduleSave();
    if (!app) return;
    if (ev.type === 'milestone') {
      const rw = questsView.rewardText(ev.given);
      app.hud.showToast(t('chal.m.got', { text: t('chal.m.' + ev.id) }) + (rw ? ' · ' + rw : ''), 4);
      announcer.say(t('chal.m.got', { text: t('chal.m.' + ev.id) }));
    } else if (ev.type === 'fight' && ev.status === 'won' && Math.min(ev.before.line, ev.before.rod) >= 60 && Math.min(ev.after.line, ev.after.rod) < 60) hint('worn', 'chal.worn.hint');
    if (ev.type === 'settings') {
      chkAuto.checked = chal.autoFight();
      fightUi.setAuto(chal.autoFight());
    }
    if (state.screen === 'repair') repairView.refresh();
    if (state.screen === 'quests') questsView.refresh();
  });
  eco.on((ev) => {
    renderPurse();
    renderGear();
    scheduleSave();
    if (ev.type === 'buy') story.event('item-gained', { kind: ev.kind, id: ev.id }); // J12-A: a hook for the story (the boat of J12-B will use it)
    if (ev.type === 'catch' || ev.type === 'sell' || ev.type === 'handIn') renderChal();
    if (ev.type === 'catch' && ev.baitOut && app) app.hud.showToast(t('eco.baitOut', { name: t('eco.bait.' + ev.baitOut) }), 3.5);
  });

  // ---------------------------------------------------------------- the story (J12-A): dialogues, journal pages, the lullaby
  const lullaby = createLullaby({ engine, volume: () => settings.fx });
  ctx.finale = createFinale({ reduced: () => ctx.reduced });
  ctx.onSting = (n) => lullaby.play(n);
  const lastAmbient = {};
  const ambRng = fork(ctx.seed, 'story-ambient');
  let afterDialogue = null; // what to open when the talk is over ('shop' | 'letters')
  const pendingBeats = []; // the story beat of a couplet waits until the catch card is closed
  const dlgEnv = () => dialogueEnv({ story: story.get(), world: game.getState().world, eco: eco.get(), t });
  function applyEffect(e) {
    if (e.set) story.setFlag(e.set, true);
    else if (e.unset) story.setFlag(e.unset, false);
    else if (e.give) eco.reward({ ...(e.give.pearls ? { pearls: e.give.pearls } : {}), ...(e.give.bait ? { bait: e.give.bait } : {}) }, 0);
    else if (e.couplet) story.markCouplet(e.couplet);
    else if (e.sting) lullaby.play(Number(e.sting) || 1);
    else if (e.open) afterDialogue = e.open;
    else if (e.lullaby) lullaby.playAll(e.lullaby === 'all' ? story.get().couplets : [e.lullaby]);
    else if (e.seen) story.markSeen(e.seen);
    else if (e.letter) wantLetter = e.letter;
    else if (e.sleep) afterDialogue = 'sleep:' + e.sleep; // the bed of the cabin (brief 29): the sleep starts when the talk is over
    else if (e.boat) giveBoat(e.boat);
    else if (e.finale === 'start') {
      ctx.finale.start();
      lullaby.playTune([1, 2, 3, 4, 5, 6, 7, 8]); // the whole lullaby as one slow tune
    } else if (e.finale === 'end') ctx.finale.end();
  }
  let wantLetter = null; // the letter the journal selects when it opens on the Letters page (the last one after the finale)
  /** Roseau's boat: three fish from the bucket (the cheapest three, any kind) or a modest price. All or nothing, money never negative. */
  function giveBoat(how) {
    if (boat.get().owned) return;
    let ok = false;
    if (how === 'fish') {
      const idx = eco.get().bucket.map((f, i) => [f.p, i]).sort((a, b) => a[0] - b[0] || a[1] - b[1]).slice(0, BOAT_UNLOCK.fish).map((x) => x[1]);
      if (idx.length === BOAT_UNLOCK.fish) {
        eco.handIn(idx);
        ok = true;
      }
    } else if (how === 'pearls') ok = eco.spend(BOAT_UNLOCK.pearls, 'boat');
    if (!ok) return;
    boat.own();
    story.setFlag('boat.ready', true);
    story.event('item-gained', { kind: 'boat', id: 'boat' });
    if (app) app.hud.showToast(t('boat.got'), 5, true);
    announcer.say(t('boat.got'));
  }
  const CHARS = { ...CHARACTERS, ...ROOM_CHARACTERS };
  const runner = createRunner({
    dialogues: { ...DIALOGUES, ...ROOM_DIALOGUES },
    env: dlgEnv,
    effect: applyEffect,
    ambient: (c, env) => {
      const r = ROOM_AMBIENT[c] ? pickAmbient(ROOM_AMBIENT[c], env, lastAmbient[c], ambRng()) : ambientFor(c, env, lastAmbient[c], ambRng());
      if (!r) return null;
      lastAmbient[c] = r.id;
      return r.key;
    },
    onEnd: (info) => {
      story.event('dialogue-ended', { id: info.id, reason: info.reason });
      if (info.id === 'intro') story.setFlag('intro.done', true); // seen or skipped: never again
      if (info.id === 'finale') {
        // seen or skipped (Escape): the scene ends, a melody still waiting for its notes is cancelled, the story is done and never forced twice
        if (info.reason === 'later') lullaby.cancel();
        ctx.finale.end();
        story.setFlag('finale.done', true);
      }
      ctx.talkingTo = null;
      scheduleSave();
    },
  });
  const dialogueUi = createDialogueUi({
    root: $('s-dialogue'),
    t,
    runner,
    say: (text) => announcer.say(text),
    reduced: () => ctx.reduced,
    face: (canvas, speaker) => {
      const c = CHARS[speaker];
      const v = c && c.villager ? VILLAGERS.find((x) => x.id === c.villager) : null;
      if (!v) return false;
      paintFace(canvas, folkSheet(v.look), FOLK);
      return true;
    },
    onEnded: () => {
      act('back');
      const next = afterDialogue;
      afterDialogue = null;
      if (next === 'shop') S.openShop();
      else if (next === 'letters') S.openLetters();
      else if (next === 'finale') S.openDialogue('finale');
      else if (typeof next === 'string' && next.startsWith('sleep:') && app && app.interior) app.interior.sleep(next.slice(6));
    },
  });
  // the shop asks for the keeper's greeting of the story state (a stable text: it is redrawn at every refresh)
  shop.setDialogueHandler((id) => (id === 'ondine.greeting' ? t(greetingKey(story.get())) : false));
  const dreamPage = createDreamPage({ titlesEl: $('dreamTitles'), grid: $('dreamGrid'), page: $('dreamPage'), pips: $('dreamPips'), i18n: ctx.i18n, species: DREAM_SPECIES, sprites: SPRITES_ALL, getBook: () => game.getState().book, titles: () => [...(story.flag('finale.done') ? ['story.title.lake'] : []), ...(story.flag('gift.ondine') ? ['story.title.friend'] : [])] });
  const lettersPage = createLettersPage({ list: $('letterList'), page: $('letterPage'), count: $('letterCount'), i18n: ctx.i18n, story, onRead: () => scheduleSave() });
  let bookPage = 'fish';
  function setBookPage(p) {
    bookPage = p;
    $('s-book').dataset.page = p;
    $('t-book').textContent = t(p === 'dreams' ? 'story.book.dreams' : p === 'letters' ? 'story.book.letters' : 'title.book');
    for (const b of $('bookTabs').querySelectorAll('button')) {
      const on = b.dataset.bp === p;
      b.setAttribute('aria-pressed', String(on));
      b.textContent = t('story.tab.' + b.dataset.bp) + (b.dataset.bp === 'letters' && story.unreadLetters().length ? ' ✦' : '');
    }
  }
  $('bookTabs').addEventListener('click', (ev) => {
    const b = ev.target.closest('button[data-bp]');
    if (!b) return;
    setBookPage(b.dataset.bp);
    if (b.dataset.bp === 'dreams') {
      dreamPage.refresh();
      dreamPage.focusFirst();
    } else if (b.dataset.bp === 'letters') {
      lettersPage.openFirstUnread();
      setBookPage('letters');
      lettersPage.focusSelected();
    } else {
      book.refresh(game.getState().book);
      const first = $('grid').querySelector('button');
      if (first) first.focus({ preventScroll: true });
    }
  });
  story.on((ev) => {
    if (ev.type === 'couplet') {
      const title = t(`story.couplet.${ev.n}.title`);
      const msg = t('story.couplet.found', { n: ev.n, title });
      if (app) {
        app.hud.showToast(msg, 5, true);
        hint('letter', 'story.letter.newToast'); // once per save: the first new letter waits on the desk (the journal's Letters tab shows a mark afterwards)
      }
      announcer.say(msg + '. ' + t('story.letter.newAria'));
      pendingBeats.push(ev.n === 8 ? 'finale' : 'beat' + ev.n); // the 8th couplet's beat is the finale
      if (state.screen === 'quests') questsView.refresh();
    }
    if (ev.type !== 'load') scheduleSave();
  });

  // ---------------------------------------------------------------- photo mode
  let photoBusy = false;
  let photoMsg = null;
  function renderPhotoMsg() {
    const el = $('photoMsg');
    el.hidden = !photoMsg;
    el.textContent = photoMsg ? t(photoMsg.key, photoMsg.params) : '';
  }
  let lastFlashAt = -1e9;
  function flash() {
    if (ctx.reduced) return; // no screen flash in reduced motion
    const now = performance.now();
    if (now - lastFlashAt < 400) return; // never more than 2.5 flashes a second (WCAG 2.3.1)
    lastFlashAt = now;
    const el = $('shutter');
    el.hidden = false;
    el.classList.remove('go');
    void el.offsetWidth;
    el.classList.add('go');
    setTimeout(() => (el.hidden = true), 320);
  }
  async function takePhoto() {
    if (photoBusy || !app || !started) return null;
    photoBusy = true;
    try {
      const room = app.interior && app.interior.photoView();
      const r = await savePhoto3d(room ? { view: room.view, tiers: room.tiers, draw: room.draw, viewSize } : { view: app.view, tiers: app.tiers, draw: app.loop.renderNow, viewSize });
      photoMsg = { key: 'photo.saved', params: { name: r.name } };
      flash();
      announcer.say(t('photo.saved', { name: r.name }));
      renderPhotoMsg();
      return r;
    } catch {
      photoMsg = { key: 'photo.fail' };
      announcer.say(t('photo.fail'));
      renderPhotoMsg();
      return null;
    } finally {
      photoBusy = false;
    }
  }
  $('btnShot').addEventListener('click', takePhoto);

  // ---------------------------------------------------------------- UI redesign (brief 27): the menu, the coach, the bag, the tooltips, the quiet interface
  const stack = createPanelStack(); // the layers Escape closes, top first (the menu; the full screens are the machine's own)
  let menuOpen = false;
  const menu = createMenu({
    wrap: $('menuWrap'),
    button: $('btnMenu'),
    stack,
    returnTo: () => $('scene'),
    onOpen() {
      menuOpen = true;
      refreshMenu();
      updatePause();
    },
    onClose() {
      menuOpen = false;
      updatePause();
    },
  });
  $('menuResume').addEventListener('click', () => menu.close());
  function refreshMenu() {
    const unread = story.unreadLetters().length + newFish.size;
    $('menuBookNew').textContent = unread ? '✦ ' + t('menu.new') : t('menu.bookCount', { n: bookCount(), total: ctx.data.species.length });
    $('menuBookNew').classList.toggle('isnew', unread > 0);
  }
  const coach = createCoach({
    seen: (id) => !!hints[id],
    mark: (id) => {
      hints[id] = true;
      scheduleSave();
    },
  });
  const newFish = new Set(); // species caught for the first time since the journal was last opened: a ✦ on their slot and in the menu
  let lastScreen = 'home';
  function markNew() {
    const grid = $('grid');
    ctx.data.species.forEach((sp, i) => {
      const b = grid.children[i];
      if (b) b.classList.toggle('isnew', newFish.has(sp.id));
    });
  }
  let coachCur = null; // the tip on screen: { id, key }
  let coachFrom = null; // where the angler stood when it appeared (the walk tip goes away once she has walked)
  function renderCoach() {
    const box = $('coach');
    box.hidden = !coachCur;
    if (coachCur) $('coachText').textContent = t(coachCur.key);
    if (app) app.hud.setCoachShown(!!coachCur);
  }
  $('coachOk').addEventListener('click', () => {
    coach.dismiss();
    coachCur = null;
    renderCoach();
    if (app) $('scene').focus({ preventScroll: true });
  });
  function stepCoach(dt) {
    const phase = game.getState().fishing.phase;
    const quiet = isPlaying() && !app.hud.cardShown() && !(app.fightFlow && app.fightFlow.active) && root.dataset.calm !== '1';
    const cur = coach.step(dt, quiet);
    if (cur && coachCur && cur.id === coachCur.id) {
      const pl = app.walk && app.walk.pl;
      if ((cur.id === 'walk' && pl && coachFrom && Math.hypot(pl.x - coachFrom[0], pl.z - coachFrom[1]) > 2.5) || (cur.id === 'cast' && (phase !== 'idle' || ctx.spotId === null)) || (cur.id === 'bite' && phase !== 'bite')) coach.dismiss();
    }
    const now = coach.current();
    if ((now && now.id) !== (coachCur && coachCur.id)) {
      coachCur = now;
      if (now) {
        const pl = app.walk && app.walk.pl;
        coachFrom = pl ? [pl.x, pl.z] : null;
        announcer.say(t(now.key));
      }
      renderCoach();
    }
  }
  const bag = createBagView({ root: $('s-bag'), t, eco, chal, summary: () => shopUi.summary(), condWord });
  createTooltips({ host: $('hud'), tipEl: $('tip'), root });
  wireNav($('s-settings'), '.seg button', { horizontal: true });
  wireNav($('s-bag'), 'button', {});
  // the quiet interface ("interface discrète"): fewer things on screen; kept in the save's hints (a boolean map), no new field
  function applyCalm() {
    root.dataset.calm = hints['ui.calm'] ? '1' : '0';
    $('chkCalm').checked = !!hints['ui.calm'];
    if (app) app.hud.setCalm(!!hints['ui.calm']);
  }
  $('chkCalm').addEventListener('change', () => {
    hints['ui.calm'] = $('chkCalm').checked;
    applyCalm();
    scheduleSave();
  });
  function applyTracker() {
    root.dataset.trk = hints['ui.trkFold'] ? 'fold' : '';
    $('tracker').setAttribute('aria-expanded', String(!hints['ui.trkFold']));
    $('trkChev').textContent = hints['ui.trkFold'] ? '▸' : '▾';
  }
  $('tracker').addEventListener('click', () => {
    hints['ui.trkFold'] = !hints['ui.trkFold'];
    applyTracker();
    scheduleSave();
  });
  $('btnTipsAgain').addEventListener('click', () => {
    for (const id of Object.keys(TIPS)) delete hints[id];
    $('tipsAgainMsg').textContent = t('set.tipsAgainDone');
    announcer.say(t('set.tipsAgainDone'));
    scheduleSave();
  });
  // Escape closes the top layer first (the menu); with no layer it does what it always did (the machine closes the screen)
  document.addEventListener(
    'keydown',
    (ev) => {
      if (ev.key !== 'Escape' || stack.size() === 0) return;
      ev.preventDefault();
      ev.stopPropagation();
      stack.escape();
    },
    true,
  );

  // ---------------------------------------------------------------- screens, pause
  const blocked = () => window.matchMedia(PORTRAIT_QUERY).matches && !turned();
  const isPlaying = () => playing(state) && !blocked() && !menuOpen;
  ctx.playing = isPlaying;
  function updatePause() {
    const want = !isPlaying() || hidden;
    if (!want) {
      deferred = false;
      game.setPaused(false);
      return;
    }
    if (app) app.input.reset(); // keys and stick forgotten; a charge in progress is released
    if (app && app.walk && app.walk.cancelRoute && !hidden) app.walk.cancelRoute(); // a walk under way stops when a panel or the menu opens (the angler no longer strolls behind it)
    if (game.getState().fishing.phase === 'charging' && !game.isPaused()) deferred = true; // the release reaches the core in the next frame, then it pauses
    else game.setPaused(true);
  }
  ctx.onHidden = (h) => {
    hidden = h;
    if (h) {
      writeNow();
      engine.hide();
    } else engine.show();
    updatePause();
  };
  window.matchMedia(PORTRAIT_QUERY).addEventListener('change', updatePause);
  function enter(name) {
    root.dataset.screen = name === 'interior' ? 'game' : name; // the interior is the game's own interface: the same HUD, styled by #app[data-inside]
    root.dataset.inside = state.inside ? '1' : '';
    ctx.frozen = name === 'photo';
    if (lastScreen === 'book' && name !== 'book') {
      newFish.clear();
      markNew();
    }
    lastScreen = name;
    if (name === 'bag') bag.render();
    if (name === 'book') {
      book.refresh(game.getState().book);
      markNew();
      dreamPage.refresh();
      if (bookWanted === 'letters') {
        setBookPage('letters');
        lettersPage.openFirstUnread();
        if (wantLetter) {
          lettersPage.show(wantLetter);
          wantLetter = null;
        }
      } else lettersPage.refresh();
      setBookPage(bookWanted || 'fish');
      bookWanted = null;
    }
    if (name !== 'dialogue') {
      dialogueUi.close();
      if (runner.active()) runner.close(); // Escape = "later": closes at once
    }
    if (name !== 'shop') shop.close();
    if (name !== 'repair') repairView.close();
    if (name !== 'quests') questsView.close();
    if (name !== 'photo' && photoMsg) {
      photoMsg = null;
      renderPhotoMsg();
    }
    updatePause();
    if (name === 'game' || name === 'interior') {
      // brief 33: the focus goes back where it was when the panel opened (a HUD capsule, the context button), else to the game picture
      const back = returnTo(opener, { usable: (el) => el.isConnected && !el.disabled && el.offsetParent !== null && $('hud').contains(el), fallback: $('scene'), never: [$('btnMenu'), (el) => !!el.closest('#menuWrap')] });
      opener = null;
      back.focus({ preventScroll: true });
    } else if (name === 'shop') shop.open();
    else if (name === 'dialogue') dialogueUi.open(runner.view());
    else if (name === 'repair') repairView.open(repairMode);
    else if (name === 'quests') questsView.open(questsMode);
    else if (name === 'book' && bookPage === 'letters') lettersPage.focusSelected();
    else if (name !== 'home') {
      const first = $('s-' + name).querySelector(FOCUSABLE);
      if (first) first.focus({ preventScroll: true });
    }
  }
  let opener = null; // brief 33: what had the focus when a panel opened over the game (shell/ui/focusOrder.js returnTo)
  function act(action) {
    const next = reduce(state, action);
    if (next.screen === state.screen && next.started === state.started && !!next.inside === !!state.inside) return;
    if (atBase(state) && !atBase(next) && next.screen !== 'home') opener = document.activeElement;
    state = next;
    enter(state.screen);
  }
  root.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-go]');
    if (!b) return;
    if (menu.isOpen()) menu.close(false); // an entry of the menu opens another screen: the menu steps aside
    if (b.dataset.go === 'game') act('back');
    else if (b.dataset.go === 'quests') S.openQuests('log');
    else act(b.dataset.go);
  });
  // Tab stays inside the open panel (a modal dialog); a focus lost outside it (a click on the dim layer) comes back in (shell/ui/focusOrder.js wrapTab)
  document.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Tab' || atBase(state) || state.screen === 'home' || menuOpen) return;
    const items = [...$('s-' + state.screen).querySelectorAll(FOCUSABLE)].filter((n) => n.offsetParent !== null);
    const j = wrapTab(items.indexOf(document.activeElement), items.length, ev.shiftKey);
    if (j === null) return;
    ev.preventDefault();
    items[j].focus();
  });

  // keyboard shortcuts (C journal, R settings, P photo, M sound, Escape back): the router of the 2D game
  const router = createRouter(
    (a) => {
      if (a === 'book' || a === 'settings' || a === 'photo') act(a);
      else if (a === 'mute') {
        if (started) sound.setMuted(!settings.muted);
      } else if (a === 'back') {
        if (state.screen === 'interior') {
          if (app && app.interior) app.interior.escape(); // Escape asks nothing: it leaves when the angler stands by the door, and does nothing elsewhere
        } else act('back');
      }
    },
    () => ({ screen: state.screen === 'interior' ? 'game' : state.screen, blocked: blocked(), shortcuts: settings.shortcuts }),
  );
  const targetKind = (el) => (!el || !el.closest ? 'body' : el.closest('input,select,textarea,[contenteditable="true"]') ? 'field' : el.closest('button,a,summary,[role="button"]') ? 'control' : el === $('scene') ? 'canvas' : 'body');
  const onKey = (type) => (ev) => {
    if (router.key({ type, key: ev.key, repeat: ev.repeat, target: targetKind(ev.target), mod: ev.ctrlKey || ev.altKey || ev.metaKey })) ev.preventDefault();
  };
  document.addEventListener('keydown', onKey('down'));
  document.addEventListener('keyup', onKey('up'));
  // J11: O = the orders and milestones (the Q key already turns the view; the 2D router does not know this one)
  document.addEventListener('keydown', (ev) => {
    if ((ev.key !== 'o' && ev.key !== 'O') || ev.repeat || ev.ctrlKey || ev.altKey || ev.metaKey || !settings.shortcuts || !started || blocked()) return;
    if (targetKind(ev.target) === 'field') return;
    if (state.screen === 'quests') act('quests');
    else if (atBase(state) || state.screen === 'book') S.openQuests('log');
    else return;
    ev.preventDefault();
  });

  // B = the bag (UI redesign): opens from the game, closes when open
  document.addEventListener('keydown', (ev) => {
    if ((ev.key !== 'b' && ev.key !== 'B') || ev.repeat || ev.ctrlKey || ev.altKey || ev.metaKey || !settings.shortcuts || !started || blocked()) return;
    if (targetKind(ev.target) === 'field') return;
    if (state.screen === 'bag') act('bag');
    else if (atBase(state) && !menuOpen) act('bag');
    else return;
    ev.preventDefault();
  });

  // "Play anyway": the page turns a quarter turn, the 3D view takes the turned box
  $('rotateAnyway').addEventListener('click', () => {
    document.documentElement.dataset.rot = '1';
    window.dispatchEvent(new Event('resize'));
    updatePause();
  });

  // ---------------------------------------------------------------- start, import
  function begin(withSound, silent = false) {
    if (state.started) return;
    started = true;
    sound.begin(withSound);
    act('begin');
    chal.check(); // milestones already reached (an imported carnet) are given once
    writeNow(); // this visit is one more session: written now (a brand new game gets its first file)
    if (!silent && !hints.walk) hint('walk', 'r.first.walk');
    if (introWanted()) S.openDialogue('intro'); // the very first start (never again once seen or skipped; not in the debug runs unless &intro=1)
  }
  const introWanted = () => !story.flag('intro.done') && (!S.skip || query.get('intro') === '1');
  /** A one-time tip (shown once per save: the name is the key in the save's `hints`): it goes to the small coach, never to a bar. */
  function hint(name, key) {
    if (hints[name] || !app) return;
    coach.offer(name, key);
  }
  $('btnStart').addEventListener('click', () => begin(true));
  $('btnStartMuted').addEventListener('click', () => begin(false));
  function showOffer() {
    const on = !!boot.offer;
    $('offer').hidden = !on;
    for (const id of ['btnStart', 'btnStartMuted']) $(id).parentElement.hidden = on;
    if (on) $('offerBody').textContent = t('r.import.body', { n: boot.offer.books });
  }
  $('btnImport').addEventListener('click', () => {
    const imported = boot.take();
    Object.assign(settings, boot.settings);
    saveObj = imported;
    game.loadSave({ book: imported.book, pity: {}, clock: null, weather: null });
    if (settings.lang) ctx.setLang(pickLang(navigator.language, settings.lang));
    applyTextScale();
    applyReduced();
    game.setFishWaitsForever(settings.fishWaitsForever);
    sound.applyVolumes();
    importedNote = true;
    boot.persist.write(snapshot()); // the HD-2D key is written now (an explicit choice); the game itself starts with Commencer
    showOffer();
    applyLangAll();
    announcer.say(t('r.import.done'));
    $('btnStart').focus();
  });
  $('btnNoImport').addEventListener('click', () => {
    boot.offer = null;
    showOffer();
    $('btnStart').focus();
  });

  // ---------------------------------------------------------------- the frame hooks used by the app
  let levelsAt = -9;
  let indoor = false;
  let lullabyAt = 0;
  let wall = 0;
  const baseIds = new Set(ctx.data.species.map((x) => x.id));
  const bookCount = () => Object.keys(game.getState().book).filter((id) => baseIds.has(id)).length;
  // loading progress of the 3D world (0..1), told by app/view.js and app.js: a pixel bar under the buttons; the buttons wake up when it is done (attach)
  ctx.onLoad = (f) => {
    const pct = Math.max(0, Math.min(100, Math.round(f * 100)));
    $('loadBar').firstElementChild.style.width = pct + '%';
    $('loadBar').setAttribute('aria-valuenow', String(pct));
  };
  const S = {
    announcer,
    engine,
    sound,
    book,
    settingsUi,
    screen: () => state.screen,
    started: () => state.started,
    playing: isPlaying,
    act,
    begin,
    takePhoto,
    /** Walking up to the Boutique door and pressing the action key / tapping its marker: the shop opens (only while playing). */
    openShop() {
      if (!isPlaying()) return false;
      act('shop');
      return state.screen === 'shop';
    },
    shop,
    repairView,
    questsView,
    fightUi,
    sfx: (name) => audio.hooks.play(name),
    /** Walking up to the Atelier door / the cabin door and pressing the action key: the repair panel opens (mode 'workshop' | 'cabin'). */
    openRepair(mode = 'workshop') {
      if (!isPlaying()) return false;
      repairMode = mode;
      act('repair');
      return state.screen === 'repair';
    },
    /** The notice board (mode 'board': hand-in works) or the quest log (mode 'log'). Opens from the game or the journal. */
    openQuests(mode = 'log') {
      if (!started || blocked() || !(atBase(state) || state.screen === 'book')) return false;
      questsMode = mode;
      act('quests');
      return state.screen === 'quests';
    },
    /** Talking to someone / a story scene: starts the dialogue `id` (data/story.js DIALOGUES) and shows the box. False when it cannot start now. */
    openDialogue(id) {
      if (!isPlaying() || runner.active()) return false;
      if (!runner.start(id)) return false;
      const ch = CHARS[id];
      ctx.talkingTo = ch && ch.villager ? ch.villager : null;
      act('dialogue');
      return state.screen === 'dialogue';
    },
    /** The cabin desk: the journal opens on Grandma's letters (the first unread one). */
    openLetters() {
      if (!isPlaying()) return false;
      bookWanted = 'letters';
      act('book');
      return state.screen === 'book';
    },
    dialogueUi,
    runner,
    lullaby,
    story,
    gearLine,
    writeNow,
    scheduleSave,
    hint,
    notice: () => ({ kind: noticeKind, shown: noticeShown && !$('saveNote').hidden, text: $('saveNote').textContent, line: $('saveState').hidden ? '' : $('saveState').textContent }),
    hints: () => ({ ...hints }),
    playS: () => playS,
    imported: () => importedNote,
    saved: () => saveObj,
    /** After the core stepped this frame: a released charge has been handed over, so the pause may now take effect. */
    afterCore() {
      if (deferred) {
        deferred = false;
        if (!isPlaying() || hidden) game.setPaused(true);
      }
    },
    /** Events of the core for this frame: sounds, the world line, announcements, the save. */
    onEvents(events) {
      for (const e of events) {
        if (e.type === 'cast') audio.hooks.play('cast');
        else if (e.type === 'landed') audio.hooks.play('splash');
        else if (e.type === 'bite') {
          hint('bite', 'tip.bite');
          audio.hooks.play(e.returning ? 'bite-soft' : 'bite');
          announcer.say(t(game.getState().holdS == null ? 'hud.biteForever' : 'hud.biteTimed'));
        } else if (e.type === 'caught') {
          audio.hooks.play('catch');
          if (e.isNew) newFish.add(e.speciesId);
          const sp = game.speciesById(e.speciesId);
          announcer.say(t('card.caught', { name: sp.name[ctx.lang], cm: e.sizeCm }));
          eco.caught(e.speciesId, e.sizeCm); // the fish goes to the bucket (the carnet was updated by the core); one bait is used
          chal.caught({ phase: game.getState().world.phase, weather: game.getState().world.weather }); // J11: night / rain flags, milestones
          story.event('fish-caught', { speciesId: e.speciesId }); // J12-A: a dream fish of the current couplet finds the couplet
          hint('shop', 'eco.hint.shop'); // shown once per save
          hint('book', 'tip.book');
          scheduleSave();
        } else if (e.type === 'retract') audio.hooks.play('reel');
        else if (e.type === 'escaped') announcer.say(t('hud.escaped'));
        else if (e.type === 'phaseChanged' || e.type === 'weatherChanged') {
          const w = game.getState().world;
          const wn = (ctx.data.weatherList.find((x) => x.id === w.weather) || {}).name;
          announcer.say(t('announce.world', { text: t('badge.text', { phase: t('phase.' + w.phase), weather: wn ? wn[ctx.lang] : w.weather }) }));
        }
        const key = announceKey(e);
        if (key && app) app.hud.showToast(t(key), 3);
      }
    },
    /** Brief 29: inside a room the outdoor ambience is muffled (shell/sound.js indoorLevels). */
    setIndoor(v) {
      indoor = !!v;
      levelsAt = -9; // the level changes at the next frame
    },
    /** Each frame (wall-clock dt): the sound levels from the clock and the weather, the play time. */
    tick(dt) {
      wall += dt;
      if (playing(state) && !hidden) playS += dt;
      if (app && started) {
        if (playS > 150) hint('log', 'tip.log');
        stepCoach(dt);
      }
      if (pendingBeats.length && app && isPlaying() && !app.hud.cardShown() && game.getState().fishing.phase === 'idle') S.openDialogue(pendingBeats.shift());
      // at night, standing at the end of the pier: the lullaby comes back softly (the last couplet found), at most once every 90 s
      if (playing(state) && !hidden && ctx.spotId === 'pier' && game.getState().world.phase === 'night' && story.get().couplets.length && wall - lullabyAt > 90) {
        lullabyAt = wall;
        lullaby.play(story.get().couplets[story.get().couplets.length - 1], 0.6);
      }
      if (engine.started && wall - levelsAt > 0.25) {
        levelsAt = wall;
        const lv = levelsFor(game.getState().world, ctx.data);
        const sent = indoor ? indoorLevels(lv) : lv;
        engine.setLevels(sent);
        if (app && app.interior) app.interior.setLevels({ indoor, sent, outdoor: lv });
      }
    },
    /** The 3D world exists: the Start buttons come alive. `restore` = the saved place was put back. */
    attach(a) {
      app = a;
      app.hud.applyLang();
      app.hud.setCalm(!!hints['ui.calm']);
      $('loadWrap').hidden = true;
      for (const id of ['btnStart', 'btnStartMuted']) $(id).disabled = false;
      renderChal();
      if (!boot.offer && state.screen === 'home') $('btnStart').focus({ preventScroll: true });
      root.dataset.ready = '1';
    },
    bookCount,
  };

  // ---------------------------------------------------------------- first paint of the interface
  applyTextScale();
  document.body.classList.toggle('rm', ctx.reduced);
  paintIcons(document);
  document.querySelectorAll('canvas[data-eco]').forEach((c) => drawEco(c, c.dataset.eco, '#fdf2dc'));
  paintUiIcons(document);
  applyCalm();
  applyTracker();
  chal.ensureOrders();
  applyLangAll();
  showOffer();
  boot.listen(showNotice);
  root.dataset.screen = 'home';
  // debug runs skip the start screen (?debug=1, not with &home=1; or &skip=1): straight into the game, started, silent, as "Sans le son"
  window.__j9 = {
    ready: true,
    screen: () => state.screen,
    started: () => state.started,
    playing: () => isPlaying(),
    paused: () => game.isPaused(),
    settings: () => ({ ...settings }),
    lang: () => ctx.lang,
    book: () => bookCount(),
    hints: () => ({ ...hints }),
    playS: () => playS,
    imported: () => importedNote,
    offer: () => (boot.offer ? { books: boot.offer.books } : null),
    notice: S.notice,
    save: { status: boot.loaded.status, memoryOnly: boot.memoryOnly, keys: boot.keys, mode: () => boot.storage.mode, readOnly: () => boot.persist.readOnly, peek: () => boot.persist.peek(), sessions: boot.sessions },
    audio: () => ({ ...engine.stats(), muted: engine.muted, persistedMuted: sound.persistedMuted() }),
    photo: () => ({ msg: photoMsg ? t(photoMsg.key, photoMsg.params) : null }),
  };
  // UI redesign (brief 27): read-only state of the interface for the checks; the mutators only with ?debug=1
  window.__j16 = {
    ready: true,
    ui: () => ({ screen: state.screen, menuOpen, layers: stack.ids(), coach: coach.current(), waiting: coach.waiting(), calm: root.dataset.calm === '1', msg: root.dataset.msg || '', trk: root.dataset.trk || '', touch: root.dataset.touch === '1', hints: Object.keys(hints).filter((k) => hints[k]) }),
    menu: () => ({ open: menu.isOpen(), items: [...document.querySelectorAll('#menu .mi')].map((n) => n.id) }),
    bag: () => ({ text: $('bagBody').textContent }),
  };
  if (dbg.debug) Object.assign(window.__j16, { openMenu: () => menu.open(), closeMenu: () => menu.close(), offerTip: (id) => coach.offer(id), openBag: () => act('bag') });
  // J10: read-only state of the economy and the shop for the checks; the mutators only with ?debug=1
  window.__j10 = {
    ready: true,
    eco: () => JSON.parse(JSON.stringify(eco.get())),
    place: () => ctx.place,
    shop: () => ({ open: state.screen === 'shop', tab: shopUi.tab, confirm: shopUi.confirm ? { ...shopUi.confirm } : null, rows: shopUi.rows().map((r) => ({ ...r })) }),
    gear: gearLine,
    available: (place = null) => effectiveSpecies(ctx.data.species, gearOf(eco.get(), place)).map((x) => x.id),
    betterHere: (place = null) => betterHere(ctx.data.species, gearOf(eco.get(), place)),
    mods: () => gearMods(eco.get()),
    purse: () => $('purseText').textContent,
    toast: () => (app ? app.hud.toastShown() : ''),
    hasDialogueHook: () => typeof shop.openDialogue === 'function',
  };
  if (dbg.debug) {
    Object.assign(window.__j10, {
      give: (id, cm) => eco.caught(id, cm),
      setEco: (e) => eco.load(e),
      openShop: () => S.openShop(),
      closeShop: () => act('back'),
    });
  }
  // J11: read-only state of the challenge for the checks; the mutators only with ?debug=1
  window.__j12 = {
    ready: true,
    chal: () => JSON.parse(JSON.stringify(chal.get())),
    screen: () => state.screen,
    cond: () => $('condText').textContent,
    order: () => $('orderText').textContent,
    condLine: () => $('condLine').textContent,
    fight: () => {
      const f = app && app.fightFlow ? app.fightFlow.fight() : null;
      return f ? { status: f.status, pos: f.pos, vel: f.vel, c: f.c, w: f.w, progress: f.progress, cue: f.cue, auto: f.auto, t: f.t, outside: f.outside } : null;
    },
    fightUi: () => ({ shown: !$('fight').hidden, cue: fightUi.cueText(), pct: $('fightPct').textContent, hold: $('fightHold').textContent, auto: $('fightAuto').textContent, rect: JSON.parse(JSON.stringify($('fight').getBoundingClientRect())) }),
    repair: () => ({ open: state.screen === 'repair', mode: repairView.mode(), rows: repairView.rows(), msg: $('repMsg').textContent }),
    quests: () => ({ open: state.screen === 'quests', mode: questsView.mode(), rows: questsView.rows(), msg: $('qMsg').textContent, note: $('qNote').textContent }),
    hasDialogueHook: () => typeof repairView.openDialogue === 'function',
    emergencyOk: () => chal.emergencyOk(),
    costs: () => chal.costs(),
  };
  if (dbg.debug) {
    Object.assign(window.__j12, {
      /** A practice fight (no fish on the line): species id, size, auto. Ends like a real one (a toast, wear for a win). */
      startFight: (id, cm, auto) => (app && app.fightFlow ? app.fightFlow.begin(id, cm, { auto }) : false),
      wear: (line, rod = line) => chal.load({ ...chal.get(), wear: { line: chal.clampWear(line), rod: chal.clampWear(rod) } }),
      openRepair: (mode) => S.openRepair(mode),
      openQuests: (mode) => S.openQuests(mode),
      setChal: (c) => chal.load(c),
      giveCatch: (id, cm) => eco.caught(id, cm),
      leaveFight: () => app && app.fightFlow && app.fightFlow.leave(),
    });
  }
  // J12-A: read-only state of the story for the checks; the mutators only with ?debug=1
  window.__j13 = {
    ready: true,
    story: () => JSON.parse(JSON.stringify(story.get())),
    dialogue: () => ({ ...dialogueUi.state(), screen: state.screen, active: runner.active(), id: runner.id() }),
    flag: (name) => story.flag(name),
    letters: () => ({ all: story.letters(), unread: story.unreadLetters() }),
    bookPage: () => bookPage,
    dream: () => ({ count: dreamPage.count(), caught: dreamPage.caughtCount() }),
    audio: () => lullaby.stats(),
    pending: () => [...pendingBeats],
    species: () => ctx.data.allSpecies.map((x) => x.id),
    couplets: () => COUPLETS.length,
    talkingTo: () => ctx.talkingTo,
    log: () => ({ rows: questsView.rows().map((r) => r.text) }),
  };
  if (dbg.debug) {
    Object.assign(window.__j13, {
      talk: (id) => S.openDialogue(id),
      jump: (n) => story.jumpTo(n),
      mark: (n) => story.markCouplet(n),
      setFlag: (name, v = true) => story.setFlag(name, v),
      openLetters: () => S.openLetters(),
      sting: (n) => lullaby.play(n),
      give: (id, cm) => {
        eco.caught(id, cm);
        story.event('fish-caught', { speciesId: id });
      },
      close: () => act('back'),
    });
  }
  if (dbg.debug) Object.assign(window.__j9, { act, flush: writeNow, takePhoto, showNotice, engine });
  S.skip = dbg.debug ? query.get('home') !== '1' : query.get('skip') === '1';
  S.finishSkip = () => {
    if (!S.skip || state.started) return;
    boot.offer = null;
    showOffer();
    started = true;
    sound.begin(false);
    state = skipped();
    enter('game');
    writeNow();
    if (introWanted()) S.openDialogue('intro');
    if (dbg.debug && query.get('finale') === '1') S.openDialogue('finale'); // J12-B (debug): start the finale at once
  };
  return S;
}
