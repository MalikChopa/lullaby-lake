import test from 'node:test';
import assert from 'node:assert/strict';
import species from '../src/data/species.js';
import sprites from '../src/data/fishSprites.js';
import weatherList from '../src/data/weather.js';
import config from '../src/data/config.js';
import { validateSpecies, validateConfig, validateWeather } from '../src/core/validate.js';

const OPT = { weatherIds: weatherList.map((w) => w.id), rarityWeights: config.paceSets[config.pace].rarityWeights };
const check = (list) => validateSpecies(list, sprites, OPT);

test('data: the 24 real species, the weathers and the config are valid (0 error)', () => {
  assert.equal(species.length, 24);
  assert.deepEqual(check(species), []);
  assert.deepEqual(validateWeather(weatherList), []);
  assert.deepEqual(validateConfig(config), []);
});

test('data: the 24 ids, rarities and phases match the annex of the architecture (the first 12 never move: saved books stay valid)', () => {
  const expected = {
    'gardon-reveur': [1, 'dawn,day'], 'carpe-lune': [1, 'dusk,night'], 'perche-ambree': [1, 'day,dusk'], 'tanche-mousse': [1, 'dawn,night'],
    'truite-brume': [2, 'dawn,day'], 'anguille-argent': [2, 'night'], 'ablette-aurore': [2, 'dawn'], 'epinoche-etoilee': [2, 'night'],
    'brochet-ombre': [3, 'dusk,night'], 'silure-sage': [3, 'night'], veilleuse: [3, 'night'], berceuse: [4, 'dawn,dusk'],
    // J6: slots 13 to 24
    'vairon-miel': [1, 'day'], 'goujon-pluie': [1, 'day,dusk'], 'breme-nuage': [1, 'dawn,day'], 'chevesne-roseau': [1, 'dawn,dusk'],
    'rotengle-braise': [1, 'dusk'], 'sandre-fantome': [2, 'dusk,night'], 'ide-orage': [2, 'dawn,dusk'], 'barbeau-fleuri': [2, 'day'],
    'koi-paisible': [2, 'day,dusk'], 'esturgeon-ancien': [3, 'dawn,dusk'], 'soleil-midi': [3, 'day'], comete: [4, 'night'],
  };
  assert.deepEqual(species.map((s) => s.id), Object.keys(expected));
  for (const s of species) assert.deepEqual([s.rarity, s.phases.join(',')], expected[s.id], s.id);
});

test('data: every text exists in French and English, descriptions <= 140 and hints <= 70 characters, names <= 24', () => {
  for (const s of species) {
    for (const lang of ['fr', 'en']) {
      assert.ok(s.name[lang].length > 0 && s.name[lang].length <= 24, `${s.id} name ${lang}`);
      assert.ok(s.desc[lang].length > 0 && s.desc[lang].length <= 140, `${s.id} desc ${lang} (${s.desc[lang].length})`);
      assert.ok(s.hint[lang].length > 0 && s.hint[lang].length <= 70, `${s.id} hint ${lang} (${s.hint[lang].length})`);
    }
  }
});

test('data: a hint never gives the species name (the journal shows hints for species not caught yet)', () => {
  const strip = (t) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  for (const s of species) {
    for (const lang of ['fr', 'en']) {
      const name = strip(s.name[lang]);
      const hint = strip(s.hint[lang]);
      for (const word of name.split(/[\s']+/).filter((w) => w.length > 4)) assert.ok(!hint.includes(word), `${s.id} ${lang}: hint contains "${word}"`);
    }
  }
});

test('data: faulty cases are all detected', () => {
  const ok = species[1];
  const bad = (patch) => check([{ ...ok, ...patch }]);
  assert.ok(check([ok, ok]).some((e) => e.includes('en double')), 'duplicate id');
  assert.ok(bad({ id: 'Carpe Lune' }).some((e) => e.includes('id invalide')), 'bad id shape');
  assert.ok(bad({ rarity: 5 }).some((e) => e.includes('rareté')), 'rarity 5');
  assert.ok(bad({ rarity: 0 }).length > 0, 'rarity 0');
  assert.ok(bad({ phases: ['noon'] }).some((e) => e.includes('phases')), 'unknown phase');
  assert.ok(bad({ phases: [] }).some((e) => e.includes('phases')), 'no phase');
  assert.ok(bad({ sizeCm: { min: 30, mode: 20, max: 40 } }).some((e) => e.includes('tailles')), 'min > mode');
  assert.ok(bad({ sizeCm: { min: 30, mode: 35, max: 20 } }).some((e) => e.includes('tailles')), 'min > max');
  assert.ok(bad({ sprite: 'inconnu' }).some((e) => e.includes('sprite')), 'missing sprite');
  assert.ok(bad({ name: { fr: 'Carpe', en: '' } }).some((e) => e.includes('"en"')), 'empty en text');
  assert.ok(bad({ name: { fr: '', en: 'Carp' } }).some((e) => e.includes('"fr"')), 'empty fr text');
  assert.ok(bad({ name: { fr: 'Carpe' } }).some((e) => e.includes('"en"')), 'missing language en');
  assert.ok(bad({ desc: { en: 'only english' } }).some((e) => e.includes('"fr"')), 'missing language fr');
  assert.ok(bad({ hint: undefined }).length >= 2, 'missing hint object');
  assert.ok(bad({ desc: { fr: 'x'.repeat(141), en: 'ok' } }).some((e) => e.includes('trop long')), 'desc fr > 140');
  assert.ok(bad({ desc: { fr: 'ok', en: 'x'.repeat(141) } }).some((e) => e.includes('trop long')), 'desc en > 140');
  assert.ok(bad({ hint: { fr: 'x'.repeat(71), en: 'ok' } }).some((e) => e.includes('trop long')), 'hint fr > 70');
  assert.ok(bad({ hint: { fr: 'ok', en: 'x'.repeat(71) } }).some((e) => e.includes('trop long')), 'hint en > 70');
  assert.ok(bad({ weather: { clear: 0, cloudy: 0, rain: 0, mist: 0 } }).some((e) => e.includes('atteignable')), 'never reachable (all weathers 0)');
  assert.ok(bad({ weather: { fog: 2 } }).some((e) => e.includes('inconnue')), 'unknown weather key');
  assert.ok(bad({ weather: { clear: -1 } }).length > 0, 'negative multiplier');
  assert.ok(validateSpecies([ok], sprites, { ...OPT, rarityWeights: { 1: 0, 2: 1, 3: 1, 4: 1 } }).some((e) => e.includes('atteignable')), 'rarity with weight 0');
  assert.deepEqual(bad({}), [], 'the untouched species is still valid');
});

test('data: config faulty cases are detected (pace missing from paceSets, holdS <= 0, phases with a hole...)', () => {
  assert.ok(validateConfig({ ...config, pace: 'zzz' }).some((e) => e.includes('pace')));
  assert.ok(validateConfig({ ...config, bite: { ...config.bite, holdS: 0 } }).some((e) => e.includes('holdS')));
  assert.ok(validateConfig({ ...config, bite: { ...config.bite, holdS: -3 } }).some((e) => e.includes('holdS')));
  assert.ok(validateConfig({ ...config, phases: [{ id: 'dawn', from: 0, to: 0.5 }, { id: 'day', from: 0.6, to: 1 }] }).some((e) => e.includes('phases')));
  assert.ok(validateConfig({ ...config, paceSets: { long: { rarityWeights: { 1: 1, 2: 1, 3: 1 }, pity: { step: 0, cap: 1, guarantee: 5 } } }, pace: 'long' }).length > 0);
});

test('data: paceSets short / medium / long exist and `long` is the active one', () => {
  assert.deepEqual(Object.keys(config.paceSets).sort(), ['long', 'medium', 'short']);
  assert.equal(config.pace, 'long');
  assert.deepEqual(config.paceSets.long.rarityWeights, { 1: 100, 2: 40, 3: 8, 4: 12 }); // 4: 6 -> 12 in J6 (24 species)
  assert.equal(config.paceSets.long.pity.guarantee, 75);
});
