// J6 part A: 24 species. The first 12 never change (saved books stay valid), the 12 new ones are appended, every (phase, weather) pair has
// several species, the new sprites leave the old ones byte for byte as they were, and a v1 save with a 12-species book loads unchanged.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import species from '../src/data/species.js';
import sprites from '../src/data/fishSprites.js';
import weatherList from '../src/data/weather.js';
import config from '../src/data/config.js';
import { paintFish } from '../src/art/fishPaint.js';
import { isEligible } from '../src/core/fishDraw.js';
import { distinctCount, isComplete, recordCatch, emptyBook } from '../src/core/collection.js';
import { parseSave, serialize, makeSave, newSave, defaultSettings } from '../src/core/save.js';
import { createGame } from '../src/core/game.js';
import { PHASES_ALL, WEATHER_ALL } from './fixtures-draw.js';
import { makeGame, data } from './helpers.js';

const sha = (x) => createHash('sha256').update(x).digest('hex').slice(0, 16);

// Captured on the 12-species code before any painter change (J6 start): sha256 prefix of the RGBA bytes, caught and silhouette.
const OLD_SPRITE_HASHES = {
  'gardon-reveur': ['850b91d13b82fd7f', '238ebc4c08fbb967'], 'carpe-lune': ['4fadf51f5d29c758', 'c608fed8bc5de33d'],
  'perche-ambree': ['03af8daf120d6948', 'afe9d1a55365519d'], 'tanche-mousse': ['c298e40426c1b4cc', 'fe2f562ae5f7a126'],
  'truite-brume': ['533df7f3179b1ba7', '7b56ca1fd838da0e'], 'anguille-argent': ['2c3356981518524b', '737b78002aa4f70e'],
  'ablette-aurore': ['f107cff0d76ba566', 'a679333bf1525db1'], 'epinoche-etoilee': ['103921d901160b99', '8a7d8119c24ecd0e'],
  'brochet-ombre': ['811d9305862249fb', 'a246f234cbe3d58b'], 'silure-sage': ['da142badd26cc07a', '1821ae8c1ae8a25c'],
  veilleuse: ['ba4fc06f0d78154c', '3841bb902c933b0f'], berceuse: ['1d8e8ed68fbd2216', '9bed0683e22d3860'],
};
// sha256 prefix of JSON.stringify of the first 12 species entries / their sprite specs as they were at the end of J5
const OLD_SPECIES_HASH = 'f39602bfabed11a8';
const OLD_SPEC_HASH = '733bf991472acc61';

const OLD_IDS = Object.keys(OLD_SPRITE_HASHES);

test('fish24: there are 24 species, the first 12 are the J5 ones in the same order and unchanged (ids, numbers, texts)', () => {
  assert.equal(species.length, 24);
  assert.deepEqual(species.slice(0, 12).map((s) => s.id), OLD_IDS);
  assert.equal(sha(JSON.stringify(species.slice(0, 12))), OLD_SPECIES_HASH);
  assert.equal(sha(JSON.stringify(Object.fromEntries(species.slice(0, 12).map((s) => [s.id, sprites[s.sprite]])))), OLD_SPEC_HASH);
  assert.equal(new Set(species.map((s) => s.id)).size, 24);
  assert.equal(Object.keys(sprites).length, 24);
});

test('fish24: the 12 old sprites (caught and silhouette) are byte-identical to the J5 ones - the painter extensions are off by default', () => {
  for (const id of OLD_IDS) {
    const spec = sprites[id];
    assert.equal(sha(paintFish(spec)), OLD_SPRITE_HASHES[id][0], id + ' caught');
    assert.equal(sha(paintFish(spec, { silhouette: true })), OLD_SPRITE_HASHES[id][1], id + ' silhouette');
  }
});

test('fish24: rarities 9 common / 8 uncommon / 5 rare / 2 legendary (the new 12: 5 / 4 / 2 / 1), no new tier', () => {
  const count = (list) => [1, 2, 3, 4].map((r) => list.filter((s) => s.rarity === r).length);
  assert.deepEqual(count(species), [9, 8, 5, 2]);
  assert.deepEqual(count(species.slice(12)), [5, 4, 2, 1]);
  assert.ok(species.every((s) => [1, 2, 3, 4].includes(s.rarity)));
});

test('fish24: every (phase, weather) pair has at least 7 eligible species (the minimum measured is 7), every phase has at least 8 species overall', () => {
  for (const phase of PHASES_ALL) {
    assert.ok(species.filter((s) => s.phases.includes(phase)).length >= 8, phase);
    for (const weather of WEATHER_ALL) {
      const n = species.filter((s) => isEligible(s, { phase, weather })).length;
      assert.ok(n >= 7, `${phase}/${weather}: ${n}`);
    }
  }
});

test('fish24: no species is impossible, and at least 3 of the 12 new ones depend mostly on the weather (best / worst multiplier >= 4)', () => {
  const ids = weatherList.map((w) => w.id);
  for (const s of species) {
    assert.ok(s.phases.some((p) => ids.some((w) => isEligible(s, { phase: p, weather: w }))), s.id + ' can bite somewhere');
  }
  const dependent = species.slice(12).filter((s) => {
    const m = ids.map((w) => (s.weather && s.weather[w] !== undefined ? s.weather[w] : 1));
    return Math.min(...m) === 0 || Math.max(...m) / Math.min(...m) >= 4;
  });
  assert.ok(dependent.length >= 3, 'weather-dependent new species: ' + dependent.map((s) => s.id));
  // the story of a few fish
  const w = (id) => species.find((s) => s.id === id).weather;
  assert.ok(w('goujon-pluie').rain >= 2 && w('ide-orage').rain >= 3 && w('sandre-fantome').mist >= 3 && w('soleil-midi').rain === 0);
});

test('fish24: names <= 24 characters, descriptions <= 140, hints <= 70 and never a digit; all new names are distinct from the old ones in both languages', () => {
  const names = { fr: new Set(), en: new Set() };
  for (const s of species) {
    for (const lang of ['fr', 'en']) {
      assert.ok(!names[lang].has(s.name[lang]), 'duplicate name ' + s.name[lang]);
      names[lang].add(s.name[lang]);
      assert.ok(!/\d/.test(s.hint[lang]), s.id + ' hint has a digit');
      assert.ok(!/\d/.test(s.name[lang]), s.id + ' name has a digit');
    }
  }
});

test('fish24: size ranges are plausible (min <= mode <= max, biggest legendary / rare fish above the small ones) and records can reach every mode', () => {
  for (const s of species) assert.ok(s.sizeCm.min <= s.sizeCm.mode && s.sizeCm.mode <= s.sizeCm.max && s.sizeCm.max <= 200, s.id);
  const by = (id) => species.find((s) => s.id === id).sizeCm;
  assert.ok(by('esturgeon-ancien').max > by('koi-paisible').max && by('vairon-miel').max < by('goujon-pluie').max);
});

// ---------------------------------------------------------------- save compatibility

test('fish24: a v1 save with a 12-species book loads unchanged; the 12 new slots start empty and are not complete', () => {
  const old = {};
  OLD_IDS.forEach((id, i) => {
    old[id] = { count: i + 1, recordCm: 10 + i, firstDay: 1 };
  });
  const s = makeSave(newSave(5), { seed: 5, sessions: 3, clock: { day: 2, dayFrac: 0.3 }, weather: { id: 'mist', leftS: 40 }, pity: { berceuse: 12 }, book: old, settings: defaultSettings() });
  const r = parseSave(serialize(s));
  assert.equal(r.status, 'ok');
  assert.deepEqual(r.save.book, old);
  assert.equal(distinctCount(r.save.book, species), 12);
  assert.equal(isComplete(r.save.book, species), false);
  for (const sp of species.slice(12)) assert.equal(r.save.book[sp.id], undefined);
  const g = makeGame({ seed: 5 });
  g.loadSave({ book: r.save.book, pity: r.save.pity });
  assert.deepEqual(g.getState().book, old);
  assert.equal(g.getState().pity.berceuse, 12);
});

test('fish24: the fixture save (with an unknown species id) keeps its unknown id and counts only known species; a full 24-species book still fits in 4 KB', () => {
  const fixture = readFileSync(new URL('./fixtures/save-v1.json', import.meta.url), 'utf8');
  const r = parseSave(fixture);
  assert.equal(r.status, 'ok');
  assert.equal(r.save.book['poisson-futur'].count, 1);
  assert.equal(distinctCount(r.save.book, species), 1);
  assert.equal(distinctCount(r.save.book), 2);
  let book = emptyBook();
  for (const sp of species) book = recordCatch(book, sp.id, sp.sizeCm.max, 12).book;
  book['poisson-futur'] = { count: 1, recordCm: 12, firstDay: 2 };
  assert.equal(isComplete(book, species), true);
  const pity = Object.fromEntries(species.map((sp) => [sp.id, 74]));
  const full = makeSave(newSave(1), { seed: 1, sessions: 99, clock: { day: 99, dayFrac: 0.9 }, weather: { id: 'rain', leftS: 100 }, pity, book, settings: defaultSettings() });
  const text = serialize(full);
  assert.ok(text.length < 4096, 'save size ' + text.length);
  assert.deepEqual(parseSave(text).save.book, book);
});

test('fish24: a loaded book of all 24 species is complete in the game state and the active pace set carries the J6 weights', () => {
  const g = createGame({ data, seed: 3 });
  const all = {};
  for (const sp of species) all[sp.id] = { count: 1, recordCm: sp.sizeCm.mode, firstDay: 1 };
  g.loadSave({ book: all, pity: {} });
  assert.equal(distinctCount(g.getState().book, species), 24);
  assert.equal(isComplete(g.getState().book, species), true);
  assert.deepEqual(config.paceSets[config.pace].rarityWeights, { 1: 100, 2: 40, 3: 8, 4: 12 });
});
