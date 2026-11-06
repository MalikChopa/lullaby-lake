// Start-up: assembles the modules and runs the loop. The core never reads the page; the page only reads the core.

import config from './data/config.js';
import speciesAll from './data/species.js';
import weatherAll from './data/weather.js';
import sprites from './data/fishSprites.js';
import presets, { getPreset, isPresetName, PRESET_NAMES } from './data/palettes.js';
import skyData from './data/sky.js';
import fr from './data/strings.fr.js';
import en from './data/strings.en.js';
import { validateConfig, validateSpecies, validateWeather } from './core/validate.js';
import { pickLang } from './core/lang.js';
import { createGame } from './core/game.js';
import { distinctCount } from './core/collection.js';
import { phaseIcon } from './core/look.js';
import { lookParams, pinnedLook, nominalMood } from './core/sky.js';
import { createCritters, createCat, envFromLook, parseCritterParams } from './core/critters.js';
import { audioLevels } from './core/audioMix.js';
import { announceKey, createToasts } from './core/toast.js';
import { fork } from './core/rng.js';
import { makeSave, newSave } from './core/save.js';
import { createLiveScene } from './art/compose.js';
import { computeAnglerParams } from './render/angler.js';
import { createFrameLayer } from './render/layers.js';
import { savePhoto } from './render/photo.js';
import { createStage, createStillStage } from './render/stage.js';
import { createBackdrop } from './render/backdrop.js';
import { createRouter, attachDom } from './input/input.js';
import { createI18n, applyDom } from './ui/i18n.js';
import { createScreens } from './ui/screens.js';
import { createHud } from './ui/hud.js';
import { createBook } from './ui/book.js';
import { createSettingsUi, defaultSettings } from './ui/settings.js';
import { createAnnouncer } from './ui/announce.js';
import { installFrames } from './ui/frames.js';
import { paintIcons, drawIcon } from './ui/icons.js';
import { createAudioHooks } from './audio/hooks.js';
import { createAudioEngine } from './audio/engine.js';
import { parseDebug } from './platform/debug.js';
import { createPerf } from './platform/perf.js';
import { createStorage, createMemoryBackend } from './platform/storage.js';
import { createPersist } from './platform/persist.js';
import { setupWorker } from './platform/worker.js';

const STEP = 1 / 60;
const SPLASH_S = 0.7; // the splash where the float lands
const PORTRAIT_QUERY = '(orientation: portrait) and (pointer: coarse) and (max-width: 600px)';

async function main() {
  const dbg = parseDebug(location.search);
  const $ = (id) => document.getElementById(id);
  const stageEl = $('stage');
  let canvas = $('scene');

  // ---- data (an invalid species is dropped with a warning, the game goes on)
  for (const e of validateConfig(config)) console.warn(e);
  for (const e of validateWeather(weatherAll)) console.warn(e);
  const checkOpt = { weatherIds: weatherAll.map((w) => w.id), rarityWeights: config.paceSets[config.pace] && config.paceSets[config.pace].rarityWeights };
  const speciesList = speciesAll.filter((s) => {
    const errs = validateSpecies([s], sprites, checkOpt);
    errs.forEach((e) => console.warn(e));
    return errs.length === 0;
  });
  const data = { config, species: speciesList, sprites, weather: weatherAll, sky: skyData };
  const weatherById = new Map(weatherAll.map((w) => [w.id, w]));

  // ---- offline support (service worker); not in ?debug=1 / ?perf=1 pages, so the measurements stay what they were
  setupWorker({ win: window, nav: navigator, loc: location, enabled: !dbg.debug && !dbg.perf && !dbg.nosw, remove: dbg.nosw });

  // ---- save: read once here, then written after each catch / setting change (debounced), when the page hides, every 30 s.
  // ?debug=1 keeps its OWN keys (never the player's save); ?debug=1&seed=N is a reproducible test: nothing is read or written.
  const memoryOnly = dbg.debug && dbg.seed !== null;
  const pendingNotices = []; // raised while loading, shown once the interface exists
  let noticeHook = (kind) => pendingNotices.push(kind);
  const storage = memoryOnly ? createStorage(createMemoryBackend, { probe: false }) : createStorage(() => window.localStorage);
  const persist = createPersist({ storage, ns: dbg.debug ? 'lullaby-lake:debug:' : 'lullaby-lake:', onNotice: (kind) => noticeHook(kind) });
  const loaded = persist.load();
  const randomSeed = () => crypto.getRandomValues(new Uint32Array(1))[0];
  let saveObj = loaded.save || newSave(dbg.seed ?? randomSeed()); // a damaged / future / absent save: defaults, a new seed
  const sessions = memoryOnly ? 0 : saveObj.sessions + 1; // this page load is one more session (the draw sequences differ)
  const seed = dbg.seed ?? saveObj.seed;

  // ---- settings and language
  const settings = { ...defaultSettings(), ...saveObj.settings };
  let persistedMuted = settings.muted; // "No sound" at the start mutes this visit only, it is not remembered
  if (dbg.rm) settings.reducedMotion = true;
  const systemRm = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isReduced = () => (settings.reducedMotion === null ? systemRm() : settings.reducedMotion);
  const i18n = createI18n({ fr, en }, pickLang(navigator.language, settings.lang));
  applyDom(i18n);
  if (settings.textScale !== 1) {
    document.documentElement.style.setProperty('--fs', String(settings.textScale));
    document.documentElement.dataset.fs = String(settings.textScale);
  }
  document.body.classList.toggle('rm', isReduced());
  installFrames(stageEl);
  paintIcons(document);

  // ---- game: the clock and the weather run (default session starts at dusk); ?phase= / ?weather= set the start and freeze
  const runClock = dbg.clock === 'run';
  const game = createGame({
    data,
    seed,
    sessions,
    settings,
    start: { phase: dbg.phase || undefined, weather: dbg.weather || undefined, freezeClock: !!dbg.phase && !runClock, freezeWeather: !!dbg.weather && !runClock },
  });
  // a saved game resumes where the lake was; ?phase= / ?weather= (tests) leave the save's world alone and do not overwrite it
  const worldPinned = !!(dbg.phase || dbg.weather);
  const resumeWorld = !worldPinned && !!saveObj.clock;
  game.loadSave({ book: saveObj.book, pity: saveObj.pity, clock: resumeWorld ? saveObj.clock : null, weather: resumeWorld ? saveObj.weather : null });
  if (!dbg.phase && !resumeWorld) game.setWorld({ dayFrac: skyData.startFrac }); // the pure dusk mood at a new game's start (not half way from day)
  game.setPaused(true); // nothing moves until "Start"
  if (dbg.book === 'half' || dbg.book === 'all') {
    const n = dbg.book === 'all' ? speciesList.length : Math.ceil(speciesList.length / 2);
    game.loadBook(Object.fromEntries(speciesList.slice(0, n).map((s, i) => [s.id, { count: 1 + (i % 3), recordCm: s.sizeCm.mode, firstDay: 1 }])));
  }

  // ---- picture: the live scene blends the five baked moods by the clock and the weather (core/sky.js), no hard cut
  // `presetOverride` (?preset=<name> or the debug hook) pins the picture and the badge to one mood, as in J1b.
  let presetOverride = isPresetName(dbg.preset) ? dbg.preset : null;
  const scene = createLiveScene({ budgetPx: 4000 }); // the colour blend of a step is spread over ~12 frames (art/compose.js)
  const blendLog = []; // debug: cost of each recomputation of the blended colours { ms, baked }
  const switches = []; // debug: each change of the nominal mood { to, frameMs }
  let pendingSwitch = null;
  const layer = createFrameLayer();
  // "Play anyway" (portrait phone that cannot turn): the page is turned a quarter turn by CSS (html[data-rot]); the picture lives in the turned box
  const turned = () => document.documentElement.dataset.rot === '1' && window.matchMedia(PORTRAIT_QUERY).matches;
  const backdrop = createBackdrop({ canvas: $('backdrop'), source: layer.canvas, size: () => (turned() ? { w: window.innerHeight, h: window.innerWidth } : { w: window.innerWidth, h: window.innerHeight }) });
  const rotateBtn = $('rotateAnyway');
  if (rotateBtn) rotateBtn.addEventListener('click', () => { document.documentElement.dataset.rot = '1'; backdrop.layout(); });
  const lookNow = (gs) => {
    if (presetOverride) return pinnedLook(presetOverride, presets, skyData);
    const w = gs.world;
    return lookParams(w.dayFrac, w.mix, weatherAll, config, skyData);
  };
  const moodNow = () => {
    if (presetOverride) return presetOverride;
    const w = game.getState().world;
    return nominalMood(w.phase, w.weather, skyData);
  };
  let presetName = moodNow();
  /** Makes the cached colours of the scene match a look; times the recomputation (debug log). */
  function prepareLook(look) {
    const baked0 = scene.baked().length;
    const t0 = performance.now();
    const worked = scene.prepare(look);
    if (worked) {
      const ms = +(performance.now() - t0).toFixed(3);
      scene.stat.lastBlendMs = ms;
      blendLog.push({ ms, baked: scene.baked().length - baked0 });
      if (blendLog.length > 1500) blendLog.shift();
    }
  }
  prepareLook(lookNow(game.getState()));

  function badgeInfo() {
    const w = game.getState().world;
    if (presetOverride) {
      const P = getPreset(presetOverride);
      return { text: i18n.t(P.labelKey), icon: P.icon, cloud: false, aria: i18n.t('scene.label.' + presetOverride) };
    }
    const wx = weatherById.get(w.weather);
    const weatherName = wx ? wx.name[i18n.getLang()] : w.weather;
    return {
      text: i18n.t('badge.text', { phase: i18n.t('phase.' + w.phase), weather: weatherName }),
      icon: phaseIcon(w.phase),
      cloud: w.weather !== 'clear',
      aria: i18n.t('scene.label', { when: i18n.t('scene.when.' + w.phase), sky: i18n.t('scene.sky.' + w.weather) }),
    };
  }
  let lastBadgeText = '';
  function applyBadge(announce = false) {
    const b = badgeInfo();
    $('phaseTxt').textContent = b.text;
    drawIcon($('phaseIc'), b.icon, '#fdf2dc');
    const wx = $('wxIc');
    wx.hidden = !b.cloud;
    if (b.cloud) drawIcon(wx, 'cloud', '#fdf2dc');
    canvas.setAttribute('aria-label', b.aria);
    if (announce && b.text !== lastBadgeText) announcer.say(i18n.t('announce.world', { text: b.text }));
    lastBadgeText = b.text;
  }
  /** Refreshes the badge (and the debug record of the nominal mood) after a change of phase, weather or pinned mood. */
  function refreshLook(announce = false) {
    const name = moodNow();
    if (name !== presetName) {
      presetName = name;
      pendingSwitch = { to: name };
    }
    applyBadge(announce);
  }
  function setPreset(name) {
    if (!isPresetName(name)) return false;
    presetOverride = name;
    refreshLook();
    return true;
  }
  /** After the first frame, bakes the other moods one at a time while the browser is idle (no hitch at the first fade). */
  function bakeOthersLater() {
    if (presetOverride) return;
    const todo = PRESET_NAMES.filter((n) => !scene.baked().includes(n));
    const later = (fn) => (window.requestIdleCallback ? window.requestIdleCallback(fn, { timeout: 1500 }) : setTimeout(fn, 120));
    const run = () => {
      const n = todo.shift();
      if (n) scene.bake(n, () => performance.now());
      if (todo.length) later(run);
    };
    if (todo.length) later(run);
  }

  let stage;
  let fallback = false;
  const announcer = createAnnouncer($('live'));
  try {
    stage = await createStage({ canvas, layer });
  } catch (err) {
    fallback = true;
    const fresh = document.createElement('canvas');
    for (const a of canvas.attributes) fresh.setAttribute(a.name, a.value);
    canvas.replaceWith(fresh);
    canvas = fresh;
    stage = createStillStage({ canvas, layer });
  }
  applyBadge();

  const idleFishing = { phase: 'idle', t: 0, power: 0, distPx: 0, casts: 0 };
  if (fallback) {
    // still picture + a sentence, no game
    stageEl.querySelectorAll('.scr').forEach((s) => s.classList.remove('on'));
    $('webglMsg').hidden = false;
    stage.draw(scene.render({ time: 0, reduced: true, cast: computeAnglerParams(idleFishing, 0, true, config), splash: null, look: lookNow(game.getState()) }));
    backdrop.update();
    window.__lullaby = { fallback: true, kind: stage.kind };
    return;
  }

  // ---- interface
  // sound: the engine only exists as a plain object until start() is called from a click or a key press
  const engine = createAudioEngine({
    makeContext: () => {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      return Ctx ? new Ctx({ latencyHint: 'playback' }) : null;
    },
    rng: fork(seed, 'audio#' + sessions),
    analyser: !!(dbg.debug || dbg.perf),
  });
  const audio = createAudioHooks({ engine });
  const toasts = createToasts({ durationS: 3 });
  const perf = createPerf();
  // silent creatures and the cat's poses: their own random streams (never the fish's), nothing saved, nothing heard
  const critterOpt = parseCritterParams(location.search, dbg.debug); // ?debug=1&critters=all|off or &critter=<kind>: captures and measurements only
  const critters = createCritters({ seed, session: sessions, mode: critterOpt.mode, only: critterOpt.only });
  const cat = createCat({ seed, session: sessions });
  let lastEnv = null;
  let lastEvents = [];
  let lastCat = null;
  let heldAt = null; // debug: the creatures' clock frozen at this game time
  let hidden = false; // debug: the creatures are kept but not drawn (the same frame with and without them)
  const queue = [];
  let started = false;
  let contextLost = false;
  let splashAt = -99; // animation time of the last landing
  let splashX = 0;
  let pose = null; // debug only: a fixed pose drawn instead of the live state
  const inputs = { primaryDown: 0, primaryUp: 0 }; // counted for tests (?debug=1)

  const bookInfo = () => ({ n: distinctCount(game.getState().book, speciesList), total: speciesList.length });
  const hud = createHud({ root: stageEl, i18n, announcer, getSettings: () => settings, data, getBookInfo: bookInfo });
  const book = createBook({ grid: $('grid'), page: $('page'), pips: $('pips'), i18n, data });

  // ---- save: what is kept, when it is written, what the player is told
  const keptWorld = { clock: saveObj.clock, weather: saveObj.weather };
  function snapshot() {
    const st = game.getState();
    const w = worldPinned ? keptWorld : game.exportWorld();
    const keep = {};
    for (const k of Object.keys(defaultSettings())) keep[k] = settings[k];
    keep.muted = persistedMuted;
    saveObj = makeSave(saveObj, { seed, sessions, clock: w.clock, weather: w.weather, pity: st.pity, book: st.book, settings: keep });
    return saveObj;
  }
  let saveTimer = null;
  function writeNow() {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    persist.write(snapshot());
  }
  function scheduleSave() {
    if (!saveTimer) saveTimer = setTimeout(writeNow, 400);
  }
  const NOTICE_KEY = { fresh: 'save.corrupt', restored: 'save.restored', future: 'save.future', memory: 'save.memory', 'other-tab': 'save.otherTab' };
  const LASTING = new Set(['future', 'memory', 'other-tab']); // conditions that stay true: also written in Settings
  let noticeKind = null;
  let lastingKind = null;
  let noticeTimer = null;
  let noticeShown = false;
  let screenName = 'home'; // the banner only sits over the home screen and the game (the Settings screen has its own line)
  function renderNotice() {
    const note = $('saveNote');
    note.hidden = !(noticeShown && noticeKind && (screenName === 'home' || screenName === 'game'));
    note.textContent = noticeKind ? i18n.t(NOTICE_KEY[noticeKind]) : '';
    const line = $('saveState');
    line.hidden = !lastingKind;
    line.textContent = lastingKind ? i18n.t(NOTICE_KEY[lastingKind]) : '';
  }
  function showNotice(kind) {
    if (!NOTICE_KEY[kind]) return;
    noticeKind = kind;
    noticeShown = true;
    if (LASTING.has(kind)) lastingKind = kind;
    renderNotice();
    announcer.say(i18n.t(NOTICE_KEY[kind]));
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => {
      noticeShown = false;
      renderNotice();
    }, 12000);
  }
  noticeHook = showNotice;
  pendingNotices.forEach(showNotice);
  window.addEventListener('pagehide', writeNow);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) writeNow();
  });
  window.addEventListener('storage', (ev) => {
    if (!memoryOnly && ev.key === persist.keys.main) persist.otherTab(); // another tab wrote the save: this one stops writing
  });
  setInterval(() => {
    if (started) writeNow();
  }, config.autosaveS * 1000);

  const router = createRouter(
    (a) => onAction(a),
    () => ({ screen: screens.current(), blocked: window.matchMedia(PORTRAIT_QUERY).matches && !turned(), shortcuts: settings.shortcuts }),
  );
  attachDom(router, { sceneEl: $('s-game'), canvasEl: canvas });

  const screens = createScreens({
    stage: stageEl,
    canvas,
    onChange(name) {
      screenName = name;
      renderNotice();
      const playing = name === 'game' && started;
      if (!playing) {
        // leave nothing held: a charge in progress is released (the line is cast) before everything freezes
        router.blur();
        while (queue.length) game.step(0, queue.shift());
      }
      if (name === 'book') book.refresh(game.getState().book);
      if (name !== 'photo' && photoMsgState) {
        photoMsgState = null;
        renderPhotoMsg();
      }
      game.setPaused(!playing);
    },
  });

  function toggle(name) {
    if (!started) return;
    screens.show(screens.current() === name ? 'game' : name);
  }
  function onAction(a) {
    if (a === 'primaryDown') {
      inputs.primaryDown++;
      queue.push({ down: true });
    } else if (a === 'primaryUp') {
      inputs.primaryUp++;
      queue.push({ up: true });
    }
    else if (a === 'book' || a === 'settings' || a === 'photo') toggle(a);
    else if (a === 'mute') {
      if (started) setMuted(!settings.muted);
    }
    else if (a === 'back' && screens.current() !== 'game') screens.show('game');
  }

  const settingsUi = createSettingsUi({
    root: $('s-settings'),
    homeLang: $('homeLang'),
    settings,
    systemReducedMotion: systemRm,
    getLang: () => i18n.getLang(),
    onChange(key) {
      if (key === 'volume' || key === 'musicStyle') {
        applyVolumes();
      } else if (key === 'muted') {
        setMuted(settings.muted);
      } else if (key === 'lang') {
        i18n.setLang(pickLang(navigator.language, settings.lang));
        applyDom(i18n);
        applyBadge();
        book.refresh();
        hud.refresh();
        renderToast();
        renderNotice();
        renderPhotoMsg();
      } else if (key === 'textScale') {
        document.documentElement.style.setProperty('--fs', String(settings.textScale));
        document.documentElement.dataset.fs = String(settings.textScale); // the card and the journal re-flow at the larger sizes (styles.css)
      } else if (key === 'reducedMotion') {
        document.body.classList.toggle('rm', isReduced());
      } else if (key === 'fishWaitsForever') {
        game.setFishWaitsForever(settings.fishWaitsForever);
        hud.refresh();
      }
      scheduleSave();
    },
  });

  // ---- sound settings: kept in `settings`, saved with the rest of them
  function applyVolumes() {
    for (const k of ['ambience', 'fx', 'music']) engine.setVolume(k, settings[k]);
    engine.setStyle(settings.musicStyle);
  }
  /** Mute / unmute. Unmuting for the first time creates the AudioContext, so it must come from a click or a key press. */
  function setMuted(m, say = true) {
    const before = persistedMuted;
    persistedMuted = m;
    settings.muted = m;
    if (!m && !engine.started && !engine.unavailable) {
      engine.start();
      applyVolumes();
    }
    engine.setMuted(m);
    if (!m && engine.unavailable) {
      settings.muted = true;
      persistedMuted = before;
      announcer.say(i18n.t('audio.unavailable'));
    } else if (say) announcer.say(i18n.t(m ? 'announce.muted' : 'announce.unmuted'));
    settingsUi.reflect();
  }
  function begin(withSound) {
    started = true;
    if (withSound) {
      engine.setMuted(settings.muted);
      if (engine.start()) applyVolumes();
      else if (engine.unavailable) {
        settings.muted = true;
        announcer.say(i18n.t('audio.unavailable'));
      }
    } else {
      settings.muted = true;
    }
    settingsUi.reflect();
    screens.show('game');
  }
  // ---- photo mode: the picture of the scene (layer canvas = the frame, no page interface) enlarged x4, saved as a PNG
  let photoBusy = false;
  let photoMsgState = null; // { key, params } shown in the photo screen
  function renderPhotoMsg() {
    const el = $('photoMsg');
    el.hidden = !photoMsgState;
    el.textContent = photoMsgState ? i18n.t(photoMsgState.key, photoMsgState.params) : '';
  }
  let lastFlashAt = -1e9;
  function flash() {
    if (isReduced()) return; // no screen flash in reduced motion
    const nowMs = performance.now();
    if (nowMs - lastFlashAt < 400) return; // never more than 2.5 flashes a second, however fast the button is pressed (WCAG 2.3.1)
    lastFlashAt = nowMs;
    const el = $('shutter');
    el.hidden = false;
    el.classList.remove('go');
    void el.offsetWidth;
    el.classList.add('go');
    setTimeout(() => {
      el.hidden = true;
    }, 320);
  }
  async function takePhoto() {
    if (photoBusy || !started) return null;
    photoBusy = true;
    try {
      const r = await savePhoto({ source: layer.canvas, scale: config.photoScale, date: new Date() });
      photoMsgState = { key: 'photo.saved', params: { name: r.name } };
      flash();
      renderPhotoMsg();
      announcer.say(i18n.t('photo.saved', { name: r.name }));
      return r;
    } catch (err) {
      photoMsgState = { key: 'photo.fail' };
      renderPhotoMsg();
      announcer.say(i18n.t('photo.fail'));
      return null;
    } finally {
      photoBusy = false;
    }
  }
  $('btnShot').addEventListener('click', takePhoto);
  $('btnStart').addEventListener('click', () => begin(true));
  $('btnStartMuted').addEventListener('click', () => begin(false));
  document.addEventListener('visibilitychange', () => (document.hidden ? engine.hide() : engine.show()));
  document.addEventListener('click', (ev) => {
    if (ev.target.closest && ev.target.closest('button')) engine.sfx('click');
  });
  $('btnRelease').addEventListener('click', () => {
    if (game.getState().fishing.phase === 'caught') queue.push({ down: true });
  });
  stage.onContext(
    () => {
      contextLost = true;
    },
    () => {
      contextLost = false;
    },
  );

  // ---- debug / measurement hooks (only with ?debug=1 or ?perf=1)
  let speed = dbg.speed;
  if (dbg.debug || dbg.perf) {
    window.__lullaby = {
      perf,
      audio,
      state() {
        const s = game.getState();
        return {
          screen: screens.current(),
          phase: s.fishing.phase,
          t: s.fishing.t,
          waitS: s.fishing.waitS,
          casts: s.fishing.casts,
          power: s.fishing.power,
          inputs: { ...inputs },
          returning: s.fishing.returning,
          fishId: s.fishing.fish && s.fishing.fish.id,
          holdS: s.holdS,
          paused: s.paused,
          elapsedS: s.elapsedS,
          book: s.book,
          pity: s.pity,
          world: { ...s.world, weatherLeftS: s.weatherLeftS, freezeClock: s.freezeClock, freezeWeather: s.freezeWeather },
          lang: i18n.getLang(),
          settings: { ...settings },
          reduced: isReduced(),
          preset: presetName,
          dominant: lookNow(s).dominant,
          muted: settings.muted,
          presetPinned: !!presetOverride,
          seed,
          contextLost,
          kind: stage.kind,
          renderer: stage.renderer,
          dpr: window.devicePixelRatio,
        };
      },
      engine,
      save: {
        status: loaded.status,
        memoryOnly,
        keys: persist.keys,
        mode: () => storage.mode,
        readOnly: () => persist.readOnly,
        flush: writeNow,
        peek: () => persist.peek(),
        notice: () => ({ kind: noticeKind, shown: noticeShown && !$('saveNote').hidden, text: $('saveNote').textContent, line: $('saveState').hidden ? '' : $('saveState').textContent }),
        sessions,
      },
      takePhoto,
      /** Bake and blend costs of the moods (this PC): bakeMs per mood baked in idle time, blend = each recomputation of the blended colours. */
      looks() {
        return { bakeMs: { ...scene.bakeMs }, baked: scene.baked(), switches: switches.slice(), blend: blendLog.slice(), blends: scene.stat.blends, slices: scene.stat.slices, firstFrameAt };
      },
      /** The look being drawn: coefficients of the five moods, sun, moon, stars, cover, rain, veil, lights (core/sky.js). */
      look() {
        const l = lookNow(game.getState());
        return JSON.parse(JSON.stringify(l));
      },
      pushToast: (key) => {
        if (toasts.push(key)) renderToast();
      },
      toast() {
        return { key: toasts.current, text: $('toast').hidden ? '' : $('toast').textContent, waiting: toasts.waiting };
      },
    };
  }
  if (dbg.debug) {
    window.__lullaby.debug = {
      canvasPixels: () => stage.extractPixels(),
      textureCount: () => stage.textureCount(),
      /** Shows a save message as if that condition had just happened: corrupt, restored, future, memory, other-tab (layout tests). */
      notice: (kind) => showNotice(kind),
      /** Shows the "he left" line as if the fish had just gone (layout tests). */
      showEscaped: (on = true) => hud.update(game.getState().fishing.phase, [{ type: on ? 'escaped' : 'cast' }], 0, config.bite.escapedMsgS),
      forcePhase: (p) => force(p),
      setPreset: (name) => setPreset(name),
      /** Un-pins the picture: the clock and the weather choose it again. */
      clearPreset: () => {
        presetOverride = null;
        refreshLook();
      },
      /** Moves the clock to the middle of a phase and/or sets the weather (frozen or not): { phase, weather, freezeClock, freezeWeather }. */
      setWorld: (o) => {
        game.setWorld(o);
        refreshLook(false);
      },
      /** The creatures now: { mode, events (core/critters.js active), cat (pose), force(kind) starts one at once }. */
      critters: {
        mode: critterOpt.mode + (critterOpt.only ? ':' + critterOpt.only : ''),
        events: () => JSON.parse(JSON.stringify(lastEvents.map((e) => ({ id: e.id, kind: e.kind, age: e.age, dur: e.dur, alpha: e.alpha })))),
        cat: () => ({ ...lastCat }),
        force: (kind) => !!critters.force(kind, game.getState().elapsedS, lastEnv),
        hold: (on, plusS = 0) => {
          heldAt = on ? game.getState().elapsedS + plusS : null; // freezes the creatures' clock (plusS = a jump ahead, to reach a given age)
        },
        hide: (on) => {
          hidden = !!on;
        },
      },
      /** Moves the clock to an exact day fraction (0..1), frozen or not: smooth-transition tests. */
      setDayFrac: (f, freeze = true) => {
        game.setWorld({ dayFrac: f, freezeClock: freeze });
        refreshLook(false);
      },
      /** Draws a fixed pose (fishing-like state, animation time, splash age) instead of the live state; null = back to live. */
      setPose: (fishing, animTime, splashAge) => {
        pose = fishing ? { fishing, animTime: animTime ?? 0, splashAge: splashAge ?? -1 } : null;
      },
      /** A made-up species shown on the catch card and on the journal page as if just caught (layout tests); null clears the page. */
      preview: (sp) => {
        if (sp) {
          book.preview(sp);
          hud.previewCard(sp);
        } else {
          book.preview(null);
        }
      },
      selectSlot: (i) => book.select(i),
      loseContext: () => stage.loseContext(),
      restoreContext: () => stage.restoreContext(),
      setSpeed: (n) => {
        speed = Math.min(60, Math.max(1, n));
      },
    };
  }

  // ---- loop: fixed 1/60 s logic steps, one render per screen frame
  let last = null;
  let acc = 0;
  let animT = 0;
  let firstFrame = true;
  let firstFrameAt = null; // performance.now() when the first picture was drawn (debug)
  let lastLevelsAt = -9;
  /** The 3 s world line (phase / weather change): text from the current language, hidden when there is none. */
  function renderToast() {
    const el = $('toast');
    const key = toasts.current;
    el.hidden = !key;
    el.textContent = key ? i18n.t(key) : '';
  }
  function splashParam(age, x, reduced) {
    if (age < 0 || age >= SPLASH_S) return null;
    return { age: reduced ? Math.min(age, 0.2) : age, x };
  }
  let frameErrors = 0;
  /** One animation frame. Whatever happens inside, the next frame is always queued: a bug must not freeze the lake (it is logged, and the line goes back to rest). */
  function frame(now) {
    try {
      frameBody(now);
    } catch (err) {
      if (frameErrors++ < 5) console.error(err);
      try {
        game.forcePhase('idle');
        hud.update('idle', [], 0, config.bite.escapedMsgS);
      } catch (e2) {
        /* nothing more to do */
      }
    }
    requestAnimationFrame(frame);
  }
  function frameBody(now) {
    const w0 = performance.now();
    const interval = last === null ? 1000 / 60 : now - last;
    last = now;
    animT += interval / 1000;
    const events = [];
    let dtSum = 0;
    if (!contextLost && !game.isPaused()) {
      acc = Math.min(acc + (interval / 1000) * speed, 5 * speed * STEP);
      while (acc >= STEP) {
        acc -= STEP;
        const ev = game.step(STEP, queue.shift());
        dtSum += STEP;
        for (const e of ev) events.push(e);
      }
    } else {
      acc = 0;
    }
    const f = game.getState().fishing;
    if (events.length || dtSum) {
      let worldChanged = false;
      for (const e of events) {
        if (e.type === 'cast') audio.play('cast');
        else if (e.type === 'landed') {
          splashAt = animT;
          audio.play('splash');
        }
        else if (e.type === 'bite') audio.play(e.returning ? 'bite-soft' : 'bite');
        else if (e.type === 'caught') audio.play('catch');
        else if (e.type === 'retract') audio.play('reel');
        else if (e.type === 'phaseChanged' || e.type === 'weatherChanged') worldChanged = true;
        // no sound when the fish leaves ('escaped')
      }
      if (worldChanged) refreshLook(true);
      for (const e of events) {
        const key = announceKey(e);
        if (key && toasts.push(key)) renderToast();
      }
      hud.update(f.phase, events, dtSum, config.bite.escapedMsgS);
      if (events.some((e) => e.type === 'caught')) {
        hud.focusRelease();
        scheduleSave();
      }
      if (events.some((e) => e.type === 'released')) canvas.focus({ preventScroll: true });
    }
    if (f.phase === 'charging') hud.setPower(f.power);
    if (toasts.tick(interval / 1000)) renderToast();
    const gs = game.getState();
    const look = lookNow(gs);
    if (engine.started && animT - lastLevelsAt > 0.25) {
      lastLevelsAt = animT;
      engine.setLevels(audioLevels(look));
    }
    if (!contextLost) {
      prepareLook(look);
      const reduced = isReduced();
      const live = pose ? pose.fishing : f;
      const t = pose ? pose.animTime : animT;
      const cast = computeAnglerParams(live, t, reduced, config);
      const age = pose ? pose.splashAge : animT - splashAt;
      lastEnv = envFromLook(look, { reduced, fishing: live.phase, floatX: live.phase === 'waiting' || live.phase === 'bite' ? cast.landX : null });
      const ct = heldAt ?? gs.elapsedS;
      critters.update(ct, lastEnv);
      lastEvents = critters.active(ct, lastEnv);
      lastCat = cat.update(animT, lastEnv);
      stage.draw(scene.render({ time: t, reduced, cast, splash: splashParam(age, cast.landX, reduced), look, cat: lastCat, critters: { events: hidden ? [] : lastEvents } }));
      backdrop.tick();
    }
    const work = performance.now() - w0;
    if (pendingSwitch) {
      switches.push({ ...pendingSwitch, frameMs: +work.toFixed(2) });
      if (switches.length > 500) switches.shift(); // debug record only: never grows without end in a long session
      pendingSwitch = null;
    }
    perf.frame(work, interval);
    if (firstFrame) {
      firstFrame = false;
      firstFrameAt = Math.round(performance.now());
      bakeOthersLater();
    }
  }

  hud.update('idle', [], 0, config.bite.escapedMsgS);
  writeNow(); // this visit is one more session: written now (also gives a brand new game its first file)
  requestAnimationFrame(frame);
  document.documentElement.dataset.ready = '1'; // every listener is attached, the first frame is queued: from here a tap on Start works (tests and first-contact timing read it)

  /** Debug only: jumps to a phase and shows its texts (card included). */
  function force(p) {
    game.forcePhase(p);
    const fish = game.getState().fishing.fish;
    const sp = (fish && speciesList.find((s) => s.id === fish.id)) || speciesList[0];
    const fake = p === 'caught' ? [{ type: 'caught', speciesId: sp.id, sizeCm: sp.sizeCm.mode, isNew: true, isRecord: true }] : [];
    hud.update(p, fake, 0, config.bite.escapedMsgS);
  }

  if (dbg.debug && dbg.state) {
    started = true;
    screens.show('game');
    force(dbg.state);
  }
}

main().catch((err) => {
  console.error(err);
});
