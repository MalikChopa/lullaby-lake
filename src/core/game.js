// Game core: clock + weather + fishing + book. Pure: the DOM, PixiJS, the real clock and the save are outside.
// createGame({ data, seed, sessions, settings, start }) -> { step(dt, actions) -> events[], getState(), ... }
//   data  : { config, species, weather, sprites? }
//   start : { phase?, weather?, freezeClock?, freezeWeather? }   (tests and ?phase= / ?weather= only)

import { fork } from './rng.js';
import { createFishingState, step as fishingStep } from './fishing.js';
import { emptyBook, recordCatch, resetPity } from './collection.js';
import { createClock, advanceClock, clockAtPhase, clockAtFrac, clockFromSave, currentPhase, dayFrac, dayNumber } from './clock.js';
import { createWeather, weatherNamed, advanceWeather } from './weather.js';
import { snapMix, easeMix } from './sky.js';

export function createGame({ data, seed, sessions = 0, settings = {}, start = {} }) {
  const rng = {
    fish: fork(seed, 'fish#' + sessions),
    size: fork(seed, 'size#' + sessions),
  };
  const weatherRng = fork(seed, 'weather#' + sessions);
  const config = data.config;
  const weatherList = data.weather;
  const byId = new Map(data.species.map((s) => [s.id, s]));
  let fishing = createFishingState();
  let book = emptyBook();
  let pity = {};
  let paused = false;
  let elapsedS = 0; // play clock, frozen while paused
  let fishWaitsForever = !!settings.fishWaitsForever;
  let lastCatch = null;
  let clock = start.phase ? clockAtPhase(config, start.phase) : createClock(config);
  let weather = start.weather ? weatherNamed(weatherList, start.weather, weatherRng) : createWeather(weatherList, weatherRng);
  let freezeClock = !!start.freezeClock;
  let freezeWeather = !!start.freezeWeather;
  let phase = currentPhase(clock, config);
  const fadeS = (data.sky && data.sky.weatherFadeS) || 10; // a weather change fades over this many game seconds (picture and sound)
  let mix = snapMix(weatherList, weather.id); // share of each weather in the picture: follows the weather id, never jumps

  const world = () => ({ phase, weather: weather.id, dayFrac: dayFrac(clock, config), day: dayNumber(clock, config), mix });

  function ctx() {
    return {
      config,
      species: data.species,
      phase,
      weather: weather.id,
      holdS: fishWaitsForever ? null : config.bite.holdS,
      book,
      pity,
    };
  }

  return {
    /** Advances one fixed step. While paused (book, settings, photo) nothing moves, the 8 s delay and the clock included. */
    step(dt, actions) {
      if (paused) return [];
      elapsedS += dt;
      const events = [];
      if (!freezeClock) {
        clock = advanceClock(clock, dt);
        const p = currentPhase(clock, config);
        if (p !== phase) {
          phase = p;
          events.push({ type: 'phaseChanged', phase });
        }
      }
      if (!freezeWeather) {
        const w = advanceWeather(weather, dt, weatherList, phase, weatherRng);
        weather = w.state;
        if (w.changed) events.push({ type: 'weatherChanged', weather: w.changed });
      }
      mix = easeMix(mix, weather.id, dt, fadeS);
      const r = fishingStep(fishing, dt, actions, ctx(), rng);
      fishing = r.state;
      for (const e of r.events) {
        if (e.type === 'bite' && e.pity) {
          pity = e.pity;
          events.push({ ...e, pity: undefined });
        } else if (e.type === 'caught') {
          const rec = recordCatch(book, e.speciesId, e.sizeCm, dayNumber(clock, config));
          book = rec.book;
          pity = resetPity(pity, e.speciesId);
          lastCatch = { speciesId: e.speciesId, sizeCm: e.sizeCm, isNew: rec.isNew, isRecord: rec.isRecord };
          events.push({ type: 'caught', ...lastCatch });
        } else {
          events.push(e);
        }
      }
      return events;
    },
    setPaused(p) {
      paused = !!p;
    },
    isPaused: () => paused,
    setFishWaitsForever(v) {
      fishWaitsForever = !!v;
    },
    getFishWaitsForever: () => fishWaitsForever,
    getState() {
      return { fishing, book, pity, elapsedS, paused, world: world(), weatherLeftS: weather.leftS, lastCatch, holdS: ctx().holdS, freezeClock, freezeWeather };
    },
    speciesById: (id) => byId.get(id),
    /** Loads a book (the save in J4; ?debug=1&book=half|all today). Counters of luck protection start again from 0. */
    loadBook(b) {
      book = { ...b };
      pity = {};
    },
    /**
     * Restores a saved game: { book, pity, clock?: {day, dayFrac}, weather?: {id, leftS} }. A weather id the data does not know is
     * ignored (a fresh draw stays). The luck-protection counters come back with the book: the promise "never lost" holds.
     */
    loadSave({ book: b, pity: p, clock: c, weather: w }) {
      book = { ...(b || {}) };
      pity = { ...(p || {}) };
      if (c) {
        clock = clockFromSave(c.day, c.dayFrac);
        phase = currentPhase(clock, config);
      }
      if (w && weatherList.some((x) => x.id === w.id)) {
        weather = { id: w.id, leftS: Math.max(0.1, w.leftS) };
        mix = snapMix(weatherList, weather.id);
      }
    },
    /** What the save keeps of the world: { clock: {day, dayFrac}, weather: {id, leftS} }. */
    exportWorld() {
      return { clock: { day: dayNumber(clock, config), dayFrac: dayFrac(clock, config) }, weather: { id: weather.id, leftS: weather.leftS } };
    },
    /** Debug / tests: positions the clock in the middle of a phase and/or sets the weather; flags freeze them. */
    setWorld({ phase: ph, dayFrac: df, weather: w, freezeClock: fc, freezeWeather: fw } = {}) {
      if (typeof df === 'number') {
        clock = clockAtFrac(df);
        phase = currentPhase(clock, config);
      } else if (ph) {
        clock = clockAtPhase(config, ph);
        phase = ph;
      }
      if (w) {
        weather = weatherNamed(weatherList, w, weatherRng);
        mix = snapMix(weatherList, weather.id);
      }
      if (fc !== undefined) freezeClock = !!fc;
      if (fw !== undefined) freezeWeather = !!fw;
    },
    /** Debug only (?debug=1): jumps the machine to a phase so a state can be inspected. */
    forcePhase(phaseName) {
      const f = { ...fishing };
      f.phase = phaseName;
      f.t = 0;
      f.firstCastDone = true;
      if (phaseName === 'waiting') f.waitS = 1e9;
      if (phaseName === 'bite' || phaseName === 'reeling' || phaseName === 'caught') {
        const sp = data.species.find((s) => s.phases.includes(phase)) || data.species[0];
        f.fish = f.fish || { id: sp.id, sizeCm: sp.sizeCm.mode };
      }
      if (phaseName !== 'idle' && phaseName !== 'charging') f.distPx = f.distPx || 90;
      fishing = f;
    },
  };
}
