// Context of a run (J9-A: now built from the HD-2D save, see shell/boot.js): language and its strings, debug switches, reduced motion, the seed and the
// EXISTING game core (src/core/game.js, unchanged rules) loaded with the saved carnet, luck counters, clock and weather. Returns the shared context
// object every app module receives. The 2D game's own save is only ever READ here (one value: its reduced-motion choice, as the "Auto" default).

import config from '../../../src/data/config.js';
import weatherList from '../../../src/data/weather.js';
import skyData from '../../../src/data/sky.js';
import stringsFr from '../../../src/data/strings.fr.js';
import stringsEn from '../../../src/data/strings.en.js';
import { createGame } from '../../../src/core/game.js';
import { createI18n } from '../../../src/ui/i18n.js';
import { KEY_2D } from '../shell/save.js';
import { createStore } from '../economy/store.js';
import { createGearConfig, createSpeciesFeed } from '../economy/draw.js';
import { debugEconomy } from '../economy/debug.js';
import { createChallengeStore } from '../challenge/state.js';
import { debugChallenge, patienceMulOf } from '../challenge/debug.js';
import S from '../data/strings.js';
import { SPECIES_ALL, SPRITES_ALL, NEEDS_ALL, BASE_SPECIES as species } from '../data/allSpecies.js'; // species = the 24 of the 2D game with the refonte's text overrides
import { createStoryStore } from '../story/engine.js';
import { createBoatStore } from '../boat/boat.js';
import { DOCK_IDS } from '../data/boat.js';

export const PHASE_PARAM = { aube: 'dawn', jour: 'day', crepuscule: 'dusk', nuit: 'night', dawn: 'dawn', day: 'day', dusk: 'dusk', night: 'night' };
export const WEATHER_PARAM = { soleil: 'clear', nuages: 'cloudy', pluie: 'rain', brume: 'mist', clear: 'clear', cloudy: 'cloudy', rain: 'rain', mist: 'mist' };
/** All the interface texts of both languages: the 2D game's tables + the HD-2D ones. */
export const TABLES = { fr: { ...stringsFr, ...S.fr }, en: { ...stringsEn, ...S.en } };

/** The 2D game's saved reduced-motion choice (read only, never written), else the system preference: what "Auto" means. */
export function systemReduced() {
  let savedRm = null;
  try {
    const s = JSON.parse(localStorage.getItem(KEY_2D) || 'null');
    if (s && s.settings && typeof s.settings.reducedMotion === 'boolean') savedRm = s.settings.reducedMotion;
  } catch {
    /* no save, or unreadable: ignored (read only) */
  }
  return savedRm !== null ? savedRm : matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * @param {{lang: string, query: URLSearchParams, t0: number, boot: object}} o   boot = shell/boot.js result
 * @returns the context: { t0, query, debug, lang, tx, fmt(), $(), setLang(), i18n, settings, reduced, seed, speed, game, data, boot }
 */
export function createContext({ lang, query, t0, boot }) {
  const debug = boot.dbg.debug;
  const settings = boot.settings;
  const save = boot.save;
  const seed = boot.seed;
  const phaseQ = PHASE_PARAM[query.get('phase')] || null;
  const weatherQ = WEATHER_PARAM[query.get('weather')] || null;
  const clockRun = query.get('clock') === 'run';
  const speed = debug ? Math.max(0.1, Math.min(60, Number(query.get('speed')) || 1)) : 1;
  // J10: the economy of the run (money, bucket, gear) and what it does to the core: the waits / hold / reel come from the gear's config, and the list of species
  // the core draws from is the gear + place filtered one (economy/draw.js). The core itself is unchanged: it reads `data.config` and `data.species` as before.
  const eco = createStore(save.economy, SPECIES_ALL); // J12-A: the 24 species + the dream fish (prices, the bucket)
  if (debug) eco.load(debugEconomy(eco.get(), query, species));
  let ctx = null;
  // J12-A: the story (flags, couplets, letters): its sting (the melody) is told by the shell through ctx.onSting; the reward of a couplet is paid here
  const story = createStoryStore(save.story, { sting: (n) => ctx && ctx.onSting && ctx.onSting(n), give: (r) => eco.reward({ pearls: r.pearls }, 0) });
  if (debug && Number(query.get('couplet')) >= 1) story.jumpTo(Math.min(9, Math.floor(Number(query.get('couplet')))));
  // J12-B: the boat (saved: owned + where it lies). The item 'boat' of data/economy.js LATER_ITEMS is live: the species that wait for it (the great sturgeon) can bite once the boat is the player's
  const boat = createBoatStore(save.boat);
  if (debug) {
    const jumped = Number(query.get('couplet')) >= 7 || query.get('boat') === '1';
    if (jumped) {
      boat.own();
      story.setFlag('boat.ready', true);
    }
    const at = query.get('at');
    if (jumped && DOCK_IDS.includes(at)) boat.moor(at);
  }
  const laterItems = { boat: { get available() { return boat.get().owned; } } };
  const feed = createSpeciesFeed(SPECIES_ALL, () => eco.get(), () => (ctx ? ctx.place : null), NEEDS_ALL, laterItems, () => story.get().flags, () => (ctx ? ctx.spotId : null));
  const data = { config: createGearConfig(config, () => eco.get()), weather: weatherList, sky: skyData };
  Object.defineProperty(data, 'species', { enumerable: true, get: feed });
  const game = createGame({
    data,
    seed,
    sessions: boot.sessions,
    settings,
    start: { phase: phaseQ || undefined, weather: weatherQ || undefined, freezeClock: !!phaseQ && !clockRun, freezeWeather: (!!phaseQ || !!weatherQ) && !clockRun },
  });
  feed.arm();
  // a saved game resumes where the lake was; ?phase= / ?weather= (tests) leave the saved world alone and do not overwrite it
  const worldPinned = !!(phaseQ || weatherQ);
  const resume = !worldPinned && !!save.clock;
  game.loadSave({ book: save.book, pity: save.pity, clock: resume ? save.clock : null, weather: resume ? save.weather : null });
  const frac = query.get('frac');
  if (frac !== null && Number(frac) >= 0) game.setWorld({ dayFrac: Number(frac) % 1 });
  else if (!phaseQ && !resume) game.setWorld({ dayFrac: skyData.startFrac });
  if (boot.dbg.book) {
    const n = boot.dbg.book === 'all' ? species.length : boot.dbg.book === 'half' ? Math.ceil(species.length / 2) : 0;
    game.loadBook(Object.fromEntries(species.slice(0, n).map((s, i) => [s.id, { count: 1 + (i % 3), recordCm: s.sizeCm.mode, firstDay: 1 }])));
  }
  // debug (J12-A): &dreams=N puts the first N dream fish in the carnet (their journal page)
  if (boot.dbg.debug && Number(query.get('dreams')) > 0) {
    const d = SPECIES_ALL.filter((x) => x.dream).slice(0, Math.floor(Number(query.get('dreams'))));
    game.loadBook({ ...game.getState().book, ...Object.fromEntries(d.map((x) => [x.id, { count: 1, recordCm: x.sizeCm.mode, firstDay: 1 }])) });
  }
  game.setPaused(true); // nothing moves until the game starts (the Start button, or the debug skip)

  // J11: wear, orders, milestones, the auto-fight setting (the challenge store reads the carnet through the game)
  let chal = createChallengeStore(save.challenge, { seed, species, eco, getBook: () => game.getState().book });
  if (debug) {
    const d = debugChallenge(chal.get(), eco.get(), query, species);
    if (d.eco !== eco.get()) eco.load(d.eco);
    chal.load(d.ch);
  }
  const i18n = createI18n(TABLES, lang);
  const isReduced = () => (settings.reducedMotion === null ? systemReduced() : settings.reducedMotion);
  ctx = {
    t0,
    query,
    debug,
    boot,
    settings,
    worldPinned,
    lang,
    tx: null,
    i18n,
    isReduced,
    reduced: query.get('rm') === '1' ? true : isReduced(),
    seed,
    speed,
    game,
    eco,
    chal,
    story,
    boat,
    speciesFeed: feed, // the species list the game core draws from right now (gear + place + story filtered): for the checks
    spotId: null, // the fishing spot id the line is cast from (app.js sets it every frame; the dream fish bite at some spots only)
    talkingTo: null, // the villager id that is being talked to (walk.js makes it stand still)
    catHint: null, // () => { x, z, spot } | null : where the cat sits for the next couplet (shell.js)
    fightTune: { patienceMul: debug ? patienceMulOf(query) : 1 },
    place: null, // the water-zone tag of the spot the line is cast from (app.js sets it every frame)
    data: { config, species, allSpecies: SPECIES_ALL, sprites: SPRITES_ALL, needs: NEEDS_ALL, weatherList, skyData },
    $: (id) => document.getElementById(id),
    fmt: (k, o = {}) => (ctx.tx[k] || k).replace(/\{(\w+)\}/g, (_, n) => (o[n] === undefined || o[n] === null ? '' : o[n])), // a missing value is never written as "undefined"
    setLang(l) {
      ctx.lang = l;
      ctx.tx = TABLES[l];
      i18n.setLang(l);
    },
  };
  ctx.setLang(lang);
  return ctx;
}
