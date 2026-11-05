import test from 'node:test';
import assert from 'node:assert/strict';
import fr from '../src/data/strings.fr.js';
import en from '../src/data/strings.en.js';
import species from '../src/data/species.js';
import weatherList from '../src/data/weather.js';
import config from '../src/data/config.js';

const params = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');

test('strings: fr and en have exactly the same keys', () => {
  assert.deepEqual(Object.keys(fr).sort(), Object.keys(en).sort());
});

test('strings: no empty string, same {params} in both languages', () => {
  for (const k of Object.keys(fr)) {
    assert.ok(typeof fr[k] === 'string' && fr[k].trim() !== '', 'fr ' + k);
    assert.ok(typeof en[k] === 'string' && en[k].trim() !== '', 'en ' + k);
    assert.equal(params(fr[k]), params(en[k]), 'params of ' + k);
  }
});

test('strings: length ceilings (buttons 28, titles 40)', () => {
  for (const [name, table] of [['fr', fr], ['en', en]]) {
    for (const [k, v] of Object.entries(table)) {
      if (k.startsWith('btn.')) assert.ok(v.length <= 28, `${name} ${k} (${v.length})`);
      if (k.startsWith('title.')) assert.ok(v.length <= 40, `${name} ${k} (${v.length})`);
    }
  }
});

test('strings: species names fit 24 characters in both languages', () => {
  for (const s of species) {
    assert.ok(s.name.fr.length <= 24 && s.name.en.length <= 24, s.id);
  }
});

test('strings: the bite text exists in both modes and only "forever" promises time', () => {
  assert.ok(!/tout ton temps|take your time/i.test(fr['hud.biteTimed'] + en['hud.biteTimed']));
  assert.ok(/tout ton temps/.test(fr['hud.biteForever']));
  assert.ok(/take your time/.test(en['hud.biteForever']));
});

test('strings: index.html only references existing keys', async () => {
  const { readFileSync } = await import('node:fs');
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const keys = [...html.matchAll(/data-i18n(?:-aria|-title)?="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(keys.length > 10);
  for (const k of keys) assert.ok(k in fr && k in en, 'missing key ' + k);
});

test('strings: the 24 species - names, descriptions (<= 140) and hints (<= 70) in both languages, no empty text', () => {
  assert.equal(species.length, 24);
  for (const s of species) {
    for (const lang of ['fr', 'en']) {
      assert.ok(s.name[lang].trim() && s.name[lang].length <= 24, `${s.id} name ${lang}`);
      assert.ok(s.desc[lang].trim() && s.desc[lang].length <= 140, `${s.id} desc ${lang}`);
      assert.ok(s.hint[lang].trim() && s.hint[lang].length <= 70, `${s.id} hint ${lang}`);
    }
  }
});

test('strings: every phase, weather and rarity used by the badge, the label and the journal has a text in both languages', () => {
  const keys = [];
  for (const p of config.phases) keys.push('phase.' + p.id, 'scene.when.' + p.id);
  for (const w of weatherList) keys.push('scene.sky.' + w.id);
  for (let r = 1; r <= 4; r++) keys.push('rarity.' + r);
  keys.push('badge.text', 'scene.label', 'announce.world', 'card.book', 'ui.knownFish', 'book.hint', 'book.notCaught', 'book.unknownName');
  for (const k of keys) assert.ok(fr[k] && en[k], 'missing ' + k);
  for (const w of weatherList) assert.ok(w.name.fr.length <= 24 && w.name.en.length <= 24);
});
