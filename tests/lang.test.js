import test from 'node:test';
import assert from 'node:assert/strict';
import { pickLang } from '../src/core/lang.js';
import { createI18n } from '../src/ui/i18n.js';
import fr from '../src/data/strings.fr.js';
import en from '../src/data/strings.en.js';

test('pickLang: fr, fr-CA, FR give French', () => {
  for (const l of ['fr', 'fr-CA', 'FR', 'fr-FR', 'fr_BE']) assert.equal(pickLang(l, null), 'fr', l);
});

test('pickLang: en-US, de, ja and empty give English', () => {
  for (const l of ['en-US', 'de', 'ja', '', undefined, null, 'frisian-x']) assert.equal(pickLang(l, null), 'en', String(l));
});

test('pickLang: the manual choice beats the automatic one', () => {
  assert.equal(pickLang('fr-FR', 'en'), 'en');
  assert.equal(pickLang('en-US', 'fr'), 'fr');
  assert.equal(pickLang('en-US', 'xx'), 'en');
});

test('i18n: params, switch, fallback on French, unknown key returned as is', () => {
  const i = createI18n({ fr, en }, 'fr');
  assert.equal(i.t('card.size', { cm: 32 }), '32 cm');
  assert.equal(i.t('btn.start'), 'Commencer');
  let changed = null;
  i.onChange((l) => (changed = l));
  i.setLang('en');
  assert.equal(changed, 'en');
  assert.equal(i.t('btn.start'), 'Start');
  const partial = createI18n({ fr: { a: 'un' }, en: {} }, 'en');
  assert.equal(partial.t('a'), 'un');
  assert.equal(partial.t('zzz'), 'zzz');
});
