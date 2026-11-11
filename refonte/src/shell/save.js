// Save format of the HD-2D game (J9-A). It is the 2D save (src/core/save.js: carnet, luck counters, settings, clock, weather, seed, sessions) plus
// what the walking game needs: the angler's place, the hints already shown, the play time, the graphics quality. NEW KEY (never the 2D game's):
//   lullaby-lake:hd2d-save  (+ .bak, .corrupt)   ?debug=1 -> lullaby-lake:hd2d-debug:save...   ?debug=1&seed=N -> nothing is read or written
// Versioned on its own (HD_VERSION), same rules as the 2D game: a later version is read-only, a damaged text is kept as .corrupt, the .bak is tried.
// Pure: no storage, no DOM, no clock.

import { parseSave, makeSave, newSave, serialize, defaultSettings } from '../../../src/core/save.js';
import { newEconomy, validateEconomy, cloneEconomy, migrateV1toV2 } from '../economy/model.js';
import { newChallenge, validateChallenge, cloneChallenge, migrateV2toV3 } from '../challenge/state.js';
import { newStory, validateStory, cloneStory, migrateV3toV4 } from '../story/engine.js';
import { newBoat, validateBoat, cloneBoat, migrateV4toV5 } from '../boat/boat.js';

// v2 (J10) adds `economy` (money, bucket, gear, equipped, stats). v1 -> v2 (migrateV1toV2): money 0, tier-1 gear, an empty bucket; carnet and settings kept.
// v3 (J11) adds `challenge` (wear, orders and milestones, fight stats, the auto-fight setting). v2 -> v3 (migrateV2toV3): full condition, no orders yet, nothing done, auto fight off.
// v4 (J12-A) adds `story` (flags, step, couplets found, letters read, dialogues seen, dream fish caught). v3 -> v4 (migrateV3toV4): the story starts at step 1 with the first letter only; the rest is kept.
// v5 (J12-B) adds `boat` { owned, at } (the boat of Captain Roseau: the player's or not, and the dock where it lies). v4 -> v5 (migrateV4toV5): not owned, at the landing; the rest is kept.
export const HD_VERSION = 5;
export const HD_NS = 'lullaby-lake:hd2d-';
export const HD_DEBUG_NS = 'lullaby-lake:hd2d-debug:';
export const KEY_2D = 'lullaby-lake:save'; // the 2D game's key: READ ONLY here, never written or removed
export const QUALITIES = Object.freeze(['auto', 'low', 'mid', 'high']); // ('ultra' was removed on 2026-11-10: a save holding it is read as 'high')
export const DIRS = Object.freeze(['up', 'down', 'left', 'right']);
/** Migrations of the HD-2D format. migrations[n] turns a version n save into n + 1 (1 -> 2: the economy, 2 -> 3: the challenge, 3 -> 4: the story). */
export const HD_MIGRATIONS = Object.freeze({ 1: migrateV1toV2, 2: migrateV2toV3, 3: migrateV3toV4, 4: migrateV4toV5 });

const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const num = (x) => typeof x === 'number' && Number.isFinite(x);

/** Settings of a new HD-2D game: the 2D ones (volumes, music style 'real', text size, language...) + the graphics quality. */
export function defaultHdSettings() {
  return { ...defaultSettings(), quality: 'auto' };
}

/** A fresh save. `sessions` is 0: the caller counts the session that starts. */
export function newHdSave(seed) {
  return { ...newSave(seed), v: HD_VERSION, settings: defaultHdSettings(), world: null, hints: {}, playS: 0, imported: null, economy: newEconomy(), challenge: newChallenge(), story: newStory(), boat: newBoat() };
}

function extras(o) {
  const e = [];
  if (o.world !== undefined && o.world !== null) {
    const w = o.world;
    if (!isObj(w) || !num(w.x) || !num(w.z) || (w.dir !== undefined && !DIRS.includes(w.dir)) || (w.zone !== undefined && w.zone !== null && typeof w.zone !== 'string')) e.push('world');
  }
  if (o.hints !== undefined) {
    if (!isObj(o.hints) || Object.values(o.hints).some((v) => typeof v !== 'boolean')) e.push('hints');
  }
  if (o.playS !== undefined && !(num(o.playS) && o.playS >= 0)) e.push('playS');
  if (o.imported !== undefined && o.imported !== null && o.imported !== '2d') e.push('imported');
  if (o.economy !== undefined) for (const m of validateEconomy(o.economy)) e.push(m);
  if (o.challenge !== undefined) for (const m of validateChallenge(o.challenge)) e.push(m);
  if (o.story !== undefined) for (const m of validateStory(o.story)) e.push(m);
  if (o.boat !== undefined) for (const m of validateBoat(o.boat)) e.push(m);
  if (isObj(o.settings) && o.settings.quality !== undefined && !QUALITIES.includes(o.settings.quality) && o.settings.quality !== 'ultra') e.push('settings.quality'); // the old 'ultra' is read as 'high' below
  return e;
}

/** Reads a stored text: { status: 'ok', save } | { status: 'corrupt', errors } | { status: 'future', version }. */
export function parseHdSave(text) {
  const r = parseSave(text, HD_MIGRATIONS, HD_VERSION);
  if (r.status !== 'ok') return r;
  const errors = extras(r.save);
  if (errors.length) return { status: 'corrupt', errors };
  const s = r.save;
  const save = {
    ...s,
    world: s.world ? { x: s.world.x, z: s.world.z, dir: s.world.dir || 'up', zone: s.world.zone ?? null } : null,
    hints: { ...(s.hints || {}) },
    playS: s.playS || 0,
    imported: s.imported || null,
    settings: { ...defaultHdSettings(), ...s.settings, ...(s.settings && s.settings.quality === 'ultra' ? { quality: 'high' } : {}) }, // 2026-11-10: 'ultra' removed -> 'high', silently, same version
    economy: s.economy ? cloneEconomy(s.economy) : newEconomy(),
    challenge: s.challenge ? cloneChallenge(s.challenge) : newChallenge(),
    story: s.story ? cloneStory(s.story) : newStory(),
    boat: s.boat ? cloneBoat(s.boat) : newBoat(),
  };
  return { status: 'ok', save };
}

export const serializeHd = (save) => serialize(save);
export const hdCodec = Object.freeze({ parse: parseHdSave, serialize: serializeHd });

/** The save to store from the previous one (unknown keys are kept) and the live parts { seed, sessions, clock, weather, pity, book, settings, world, hints, playS, economy, challenge, story }. */
export function makeHdSave(prev, parts) {
  const base = makeSave(prev, parts);
  base.v = HD_VERSION;
  base.economy = parts.economy ? cloneEconomy(parts.economy) : prev && prev.economy ? cloneEconomy(prev.economy) : newEconomy();
  base.challenge = parts.challenge ? cloneChallenge(parts.challenge) : prev && prev.challenge ? cloneChallenge(prev.challenge) : newChallenge();
  base.story = parts.story ? cloneStory(parts.story) : prev && prev.story ? cloneStory(prev.story) : newStory();
  base.boat = parts.boat ? cloneBoat(parts.boat) : prev && prev.boat ? cloneBoat(prev.boat) : newBoat();
  base.settings = { ...base.settings, quality: parts.settings && parts.settings.quality !== undefined ? parts.settings.quality : base.settings.quality || 'auto' };
  if (base.settings.quality === 'ultra') base.settings.quality = 'high'; // (the removed tier is never written again)
  base.world = parts.world ? { x: parts.world.x, z: parts.world.z, dir: parts.world.dir || 'up', zone: parts.world.zone ?? null } : null;
  base.hints = { ...(parts.hints || {}) };
  base.playS = Math.max(0, Math.round((parts.playS || 0) * 10) / 10);
  base.imported = parts.imported ?? (prev && prev.imported) ?? null;
  return base;
}

/**
 * One-time import of a 2D save text: the CARNET (book) and the SETTINGS are copied, nothing else (not the clock, the weather, the seed, the sessions,
 * the luck counters). Pure: reads a string, returns a new HD-2D save. { status: 'ok', save, books } | { status: 'none' | 'corrupt' | 'future' }.
 */
export function importFrom2d(text2d, seed) {
  if (text2d === null || text2d === undefined) return { status: 'none' };
  const r = parseSave(text2d);
  if (r.status !== 'ok') return { status: r.status === 'future' ? 'future' : 'corrupt' };
  const o = r.save;
  const save = newHdSave(seed);
  save.book = Object.fromEntries(Object.entries(o.book).map(([id, b]) => [id, { ...b }]));
  const keep = {};
  for (const k of Object.keys(defaultSettings())) if (k in o.settings) keep[k] = o.settings[k];
  save.settings = { ...defaultHdSettings(), ...keep };
  save.imported = '2d';
  return { status: 'ok', save, books: Object.keys(save.book).length };
}
