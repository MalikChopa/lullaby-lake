// Save format, version 1 (ARCHITECTURE section 8). Pure: no storage, no DOM, no clock. Serialise, validate, migrate, assemble.
// Saved: seed, sessions, where the clock and the weather are, luck-protection counters, the book, the settings. Nothing personal.
//   { v:1, seed, sessions, clock:{day,dayFrac}|null, weather:{id,leftS}|null, pity:{id:n}, book:{id:{count,recordCm,firstDay?}},
//     settings:{ambience,fx,music,musicStyle,muted,reducedMotion,textScale,lang,fishWaitsForever,shortcuts} }
// Unknown keys (a species id the game no longer knows, a top-level key of a later minor version) are kept as they are.

import audioData from '../data/audio.js';

export const SAVE_VERSION = 1;
export const TEXT_SCALES = Object.freeze([1, 1.25, 1.5]);

/** Settings of a new game (the volume defaults come from data/audio.js). */
export function defaultSettings() {
  return { lang: null, textScale: 1, reducedMotion: null, fishWaitsForever: false, shortcuts: true, ...audioData.defaults };
}

/** A fresh save for a seed: empty book, sessions 0 (the caller counts the session that starts). */
export function newSave(seed) {
  return { v: SAVE_VERSION, seed: seed >>> 0, sessions: 0, clock: null, weather: null, pity: {}, book: {}, settings: defaultSettings() };
}

/**
 * Migrations: migrations[n](save) turns a version n save into version n + 1 (pure, returns a new object).
 * There is none yet (v1 is the first format): the table exists so that the first format change is one function and one fixture.
 */
export const MIGRATIONS = Object.freeze({});

const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const isInt = (x, min = 0) => Number.isInteger(x) && x >= min;
const isNum = (x, min = 0) => typeof x === 'number' && Number.isFinite(x) && x >= min;

/** Lists what is wrong with a version-current save object (empty = valid). */
export function validateSave(o, current = SAVE_VERSION) {
  const e = [];
  if (!isObj(o)) return ['the save is not an object'];
  if (o.v !== current) e.push('v is ' + o.v);
  if (!isInt(o.seed) || o.seed > 0xffffffff) e.push('seed');
  if (!isInt(o.sessions)) e.push('sessions');
  if (!isObj(o.book)) e.push('book');
  else {
    for (const [id, b] of Object.entries(o.book)) {
      if (!isObj(b) || !isInt(b.count, 1) || !isNum(b.recordCm)) e.push('book.' + id);
      else if (b.firstDay !== undefined && !isInt(b.firstDay, 1)) e.push('book.' + id + '.firstDay');
    }
  }
  if (o.pity !== undefined) {
    if (!isObj(o.pity)) e.push('pity');
    else for (const [id, n] of Object.entries(o.pity)) if (!isInt(n)) e.push('pity.' + id);
  }
  if (o.clock !== undefined && o.clock !== null) {
    if (!isObj(o.clock) || !isInt(o.clock.day, 1) || !isNum(o.clock.dayFrac) || o.clock.dayFrac >= 1) e.push('clock');
  }
  if (o.weather !== undefined && o.weather !== null) {
    if (!isObj(o.weather) || typeof o.weather.id !== 'string' || o.weather.id === '' || !isNum(o.weather.leftS)) e.push('weather');
  }
  if (o.settings !== undefined) {
    const s = o.settings;
    if (!isObj(s)) e.push('settings');
    else {
      for (const k of ['ambience', 'fx', 'music']) if (s[k] !== undefined && !(isInt(s[k]) && s[k] <= 100)) e.push('settings.' + k);
      for (const k of ['muted', 'fishWaitsForever', 'shortcuts']) if (s[k] !== undefined && typeof s[k] !== 'boolean') e.push('settings.' + k);
      if (s.reducedMotion !== undefined && s.reducedMotion !== null && typeof s.reducedMotion !== 'boolean') e.push('settings.reducedMotion');
      if (s.textScale !== undefined && !TEXT_SCALES.includes(s.textScale)) e.push('settings.textScale');
      if (s.lang !== undefined && s.lang !== null && s.lang !== 'fr' && s.lang !== 'en') e.push('settings.lang');
      if (s.musicStyle !== undefined && typeof s.musicStyle !== 'string') e.push('settings.musicStyle'); // an unknown NAME is not an error: it falls back (normalizeSave)
    }
  }
  return e;
}

/** A valid save with every optional part filled in (keys the game does not know are kept). Does not modify its input. */
export function normalizeSave(o) {
  const settings = { ...defaultSettings(), ...(o.settings || {}) };
  if (!audioData.styles.includes(settings.musicStyle)) settings.musicStyle = audioData.defaultStyle; // a save without the field, or from a later version with another style
  return {
    ...o,
    clock: o.clock || null,
    weather: o.weather || null,
    pity: { ...(o.pity || {}) },
    book: Object.fromEntries(Object.entries(o.book).map(([id, b]) => [id, { ...b }])),
    settings,
  };
}

/**
 * Brings an older save up to `current` by applying migrations[v], migrations[v + 1], ...
 * Returns { ok, save, from } ; ok is false when a step is missing or does not give back the next version.
 */
export function migrate(o, migrations = MIGRATIONS, current = SAVE_VERSION) {
  let cur = o;
  const from = o.v;
  let guard = 0;
  while (cur.v < current && guard++ < 100) {
    const fn = migrations[cur.v];
    if (typeof fn !== 'function') return { ok: false, save: o, from };
    const next = fn(cur);
    if (!isObj(next) || next.v !== cur.v + 1) return { ok: false, save: o, from };
    cur = next;
  }
  return { ok: cur.v === current, save: cur, from };
}

/** The text to store: compact JSON. */
export function serialize(save) {
  return JSON.stringify(save);
}

/**
 * Reads a stored text. status: 'ok' (save is valid, migrated and filled in) | 'corrupt' (errors say why) | 'future'
 * (written by a later version of the game: `version` is its v; the caller must never overwrite it).
 */
export function parseSave(text, migrations = MIGRATIONS, current = SAVE_VERSION) {
  let o;
  try {
    o = JSON.parse(text);
  } catch {
    return { status: 'corrupt', errors: ['not JSON'] };
  }
  if (!isObj(o)) return { status: 'corrupt', errors: ['not an object'] };
  if (!isInt(o.v, 1)) return { status: 'corrupt', errors: ['no version'] };
  if (o.v > current) return { status: 'future', version: o.v, errors: [] };
  let cur = o;
  if (o.v < current) {
    const m = migrate(o, migrations, current);
    if (!m.ok) return { status: 'corrupt', errors: ['no migration from v' + o.v] };
    cur = m.save;
  }
  const errors = validateSave(cur, current);
  if (errors.length) return { status: 'corrupt', errors };
  return { status: 'ok', save: normalizeSave(cur), migratedFrom: o.v < current ? o.v : null };
}

/**
 * Builds the save to store from the previous one (its unknown keys are kept) and the live parts.
 * parts: { seed, sessions, clock, weather, pity, book, settings } ; settings keeps only the keys of defaultSettings() plus
 * the unknown ones already in the previous save.
 */
export function makeSave(prev, parts) {
  const base = prev && isObj(prev) ? prev : {};
  const known = defaultSettings();
  const settings = { ...(base.settings || {}) };
  for (const k of Object.keys(known)) if (parts.settings && k in parts.settings) settings[k] = parts.settings[k];
  return {
    ...base,
    v: SAVE_VERSION,
    seed: parts.seed >>> 0,
    sessions: parts.sessions,
    clock: parts.clock ?? null,
    weather: parts.weather ?? null,
    pity: { ...parts.pity },
    book: parts.book,
    settings,
  };
}
