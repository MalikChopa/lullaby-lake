import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  SAVE_VERSION, defaultSettings, newSave, validateSave, migrate, parseSave, serialize, makeSave,
} from '../src/core/save.js';
import { createStorage, createMemoryBackend } from '../src/platform/storage.js';
import { createPersist } from '../src/platform/persist.js';
import { makeGame, castToBite, runUntil, stepN } from './helpers.js';

const fixture = readFileSync(new URL('./fixtures/save-v1.json', import.meta.url), 'utf8');

// ---------------------------------------------------------------- pure format
test('save: new save is valid, version 1, empty book, default settings', () => {
  const s = newSave(7);
  assert.equal(s.v, SAVE_VERSION);
  assert.deepEqual(validateSave(s), []);
  assert.deepEqual(s.book, {});
  assert.deepEqual(s.settings, defaultSettings());
  assert.deepEqual(Object.keys(s.settings).sort(), ['ambience', 'fishWaitsForever', 'fx', 'lang', 'music', 'musicStyle', 'muted', 'reducedMotion', 'shortcuts', 'textScale']);
});

test('save: round trip (serialize then parse) gives back the same save', () => {
  const s = makeSave(newSave(99), {
    seed: 99, sessions: 5, clock: { day: 2, dayFrac: 0.25 }, weather: { id: 'rain', leftS: 12.5 }, pity: { berceuse: 3 },
    book: { 'carpe-lune': { count: 2, recordCm: 31, firstDay: 1 } }, settings: { ...defaultSettings(), lang: 'fr', textScale: 1.5, fishWaitsForever: true, ambience: 35, muted: true },
  });
  const r = parseSave(serialize(s));
  assert.equal(r.status, 'ok');
  assert.deepEqual(r.save, s);
  assert.ok(serialize(s).length < 4096, 'under 4 KB');
});

test('save: the v1 fixture parses, keeps unknown species and unknown keys, nothing personal in it', () => {
  const r = parseSave(fixture);
  assert.equal(r.status, 'ok');
  assert.equal(r.save.settings.lang, 'en');
  assert.equal(r.save.settings.fishWaitsForever, true);
  assert.equal(r.save.settings.textScale, 1.25);
  assert.equal(r.save.book['poisson-futur'].count, 1);
  assert.deepEqual(r.save.extra, { note: 'a key from a later minor version' });
  assert.ok(!/@|\\Users|\/Users|\/home/.test(fixture));
});

test('save: missing optional parts take their defaults (older partial saves)', () => {
  const r = parseSave(JSON.stringify({ v: 1, seed: 5, sessions: 1, book: {} }));
  assert.equal(r.status, 'ok');
  assert.deepEqual(r.save.settings, defaultSettings());
  assert.equal(r.save.clock, null);
  assert.deepEqual(r.save.pity, {});
  const p = parseSave(JSON.stringify({ v: 1, seed: 5, sessions: 1, book: {}, settings: { lang: 'fr' } }));
  assert.equal(p.save.settings.lang, 'fr');
  assert.equal(p.save.settings.ambience, defaultSettings().ambience);
});

test('save: damaged texts are all "corrupt"', () => {
  const bad = [
    '', 'not json', '{', '[]', 'null', '42', '{}', '{"v":"1"}', '{"v":0}', '{"v":1.5}',
    '{"v":1,"seed":1,"sessions":0}', // no book
    '{"v":1,"seed":-1,"sessions":0,"book":{}}',
    '{"v":1,"seed":1,"sessions":-2,"book":{}}',
    '{"v":1,"seed":1,"sessions":0,"book":{"a":{"count":0,"recordCm":3}}}',
    '{"v":1,"seed":1,"sessions":0,"book":{"a":{"count":1,"recordCm":"x"}}}',
    '{"v":1,"seed":1,"sessions":0,"book":{},"pity":{"a":-1}}',
    '{"v":1,"seed":1,"sessions":0,"book":{},"clock":{"day":0,"dayFrac":0.5}}',
    '{"v":1,"seed":1,"sessions":0,"book":{},"clock":{"day":1,"dayFrac":1}}',
    '{"v":1,"seed":1,"sessions":0,"book":{},"weather":{"id":"","leftS":1}}',
    '{"v":1,"seed":1,"sessions":0,"book":{},"settings":{"ambience":101}}',
    '{"v":1,"seed":1,"sessions":0,"book":{},"settings":{"textScale":2}}',
    '{"v":1,"seed":1,"sessions":0,"book":{},"settings":{"lang":"de"}}',
    '{"v":1,"seed":1,"sessions":0,"book":{},"settings":{"muted":"yes"}}',
    fixture.slice(0, fixture.length - 40), // cut in the middle
  ];
  for (const t of bad) assert.equal(parseSave(t).status, 'corrupt', JSON.stringify(t).slice(0, 60));
});

test('save: a version newer than the game is "future" (not corrupt, never rewritten)', () => {
  const r = parseSave(JSON.stringify({ v: 2, anything: true }));
  assert.equal(r.status, 'future');
  assert.equal(r.version, 2);
});

test('migrations: steps are applied in order, a missing step or a wrong result refuses', () => {
  const m = { 1: (s) => ({ ...s, v: 2, added: 'x' }), 2: (s) => ({ ...s, v: 3, settings: { ...s.settings, lang: 'fr' } }) };
  const r = migrate({ v: 1, seed: 1 }, m, 3);
  assert.equal(r.ok, true);
  assert.equal(r.save.v, 3);
  assert.equal(r.save.added, 'x');
  assert.equal(r.from, 1);
  assert.equal(migrate({ v: 1 }, { 1: (s) => ({ ...s, v: 2 }) }, 3).ok, false); // step 2 missing
  assert.equal(migrate({ v: 1 }, { 1: (s) => ({ ...s, v: 5 }) }, 2).ok, false); // wrong version back
  assert.equal(migrate({ v: 2 }, {}, 2).ok, true); // nothing to do
});

test('migrations: the v1 fixture goes through a (test) v1 -> v2 step into a valid v2 save; the real table is empty and the fixture is current', () => {
  // the game's own table has no step yet (v1 is the first format): this proves the mechanism on the real fixture
  const m = { 1: (s) => ({ ...s, v: 2, settings: { ...s.settings, lang: s.settings.lang === 'en' ? 'fr' : 'en' } }) };
  const r = parseSave(fixture, m, 2);
  assert.equal(r.status, 'ok');
  assert.equal(r.save.v, 2);
  assert.equal(r.migratedFrom, 1);
  assert.equal(r.save.settings.lang, 'fr');
  assert.equal(r.save.book['carpe-lune'].count, 3, 'the book survives the migration');
  assert.equal(parseSave(fixture, {}, 2).status, 'corrupt', 'a missing step is refused, not guessed');
  assert.equal(parseSave(fixture).migratedFrom, null);
});

test('save: makeSave keeps unknown top-level keys and unknown settings keys, replaces the live parts', () => {
  const prev = parseSave(fixture).save;
  prev.settings.futureSetting = 'x';
  const out = makeSave(prev, { seed: prev.seed, sessions: 9, clock: null, weather: null, pity: {}, book: prev.book, settings: { ...prev.settings, lang: 'fr' } });
  assert.deepEqual(out.extra, prev.extra);
  assert.equal(out.settings.futureSetting, 'x');
  assert.equal(out.settings.lang, 'fr');
  assert.equal(out.sessions, 9);
  assert.equal(parseSave(serialize(out)).status, 'ok');
});

// ---------------------------------------------------------------- storage door
function failingBackend() {
  const m = createMemoryBackend();
  return {
    getItem: (k) => m.getItem(k),
    setItem: () => {
      throw new Error('QuotaExceededError');
    },
    removeItem: (k) => m.removeItem(k),
  };
}

test('storage: a backend that throws at once -> memory mode, one notice, nothing throws', () => {
  let fails = 0;
  const st = createStorage(() => failingBackend(), { onFail: () => fails++ });
  assert.equal(st.mode, 'memory');
  assert.equal(st.set('a', '1'), true);
  assert.equal(st.get('a'), '1');
  st.remove('a');
  assert.equal(st.get('a'), null);
  assert.equal(fails, 1);
});

test('storage: no storage at all (getter throws, as with blocked cookies) -> memory', () => {
  const st = createStorage(() => {
    throw new Error('SecurityError');
  });
  assert.equal(st.mode, 'memory');
  st.set('x', 'y');
  assert.equal(st.get('x'), 'y');
});

test('storage: quota error on a later write -> falls to memory once, the value is still readable', () => {
  const m = createMemoryBackend();
  let full = false;
  const backend = {
    getItem: (k) => m.getItem(k),
    setItem: (k, v) => {
      if (full) throw new Error('QuotaExceededError');
      m.setItem(k, v);
    },
    removeItem: (k) => m.removeItem(k),
  };
  let fails = 0;
  const st = createStorage(() => backend, { onFail: () => fails++ });
  assert.equal(st.mode, 'local');
  st.set('k', 'one');
  full = true;
  assert.equal(st.set('k', 'two'), true);
  assert.equal(st.mode, 'memory');
  assert.equal(st.get('k'), 'two');
  st.set('k', 'three');
  assert.equal(fails, 1);
});

// ---------------------------------------------------------------- persistence rules
function mk(backend = createMemoryBackend(), ns = 'lullaby-lake:') {
  const notices = [];
  const storage = createStorage(() => backend);
  const p = createPersist({ storage, ns, onNotice: (k) => notices.push(k) });
  return { backend, storage, p, notices };
}
const sample = (over = {}) => makeSave(newSave(123), { seed: 123, sessions: 1, clock: null, weather: null, pity: {}, book: { 'carpe-lune': { count: 1, recordCm: 30, firstDay: 1 } }, settings: defaultSettings(), ...over });

test('persist: nothing stored -> status new, load writes nothing, then write + reload gives the same save', () => {
  const { backend, p } = mk();
  const l = p.load();
  assert.equal(l.status, 'new');
  assert.equal(l.save, null);
  assert.equal(backend.getItem('lullaby-lake:save'), null);
  const s = sample();
  assert.equal(p.write(s), true);
  const again = mk(backend);
  const l2 = again.p.load();
  assert.equal(l2.status, 'ok');
  assert.deepEqual(l2.save, s);
});

test('persist: only the save keys are written (nothing else stored)', () => {
  // Record EVERY key the code writes (not a fixed list of names), so an added key makes the test fail.
  const seen = new Set();
  const inner = createMemoryBackend();
  const backend = { ...inner, setItem: (k, v) => { seen.add(k); inner.setItem(k, v); } };
  const { p } = mk(backend);
  p.load();
  p.write(sample());
  p.write(sample({ sessions: 2 }));
  const allowed = new Set(['lullaby-lake:save', 'lullaby-lake:save.bak', 'lullaby-lake:probe']);
  assert.deepEqual([...seen].filter((k) => !allowed.has(k)), []);
  assert.ok(seen.has('lullaby-lake:save') && seen.has('lullaby-lake:save.bak'));
  assert.equal(inner.getItem('lullaby-lake:probe'), null, 'the probe key is removed again');
});

test('persist: the previous good text becomes .bak at each change', () => {
  const { p } = mk();
  p.load();
  const a = sample({ sessions: 1 });
  const b = sample({ sessions: 2 });
  p.write(a);
  p.write(b);
  const peek = p.peek();
  assert.equal(peek.main, serialize(b));
  assert.equal(peek.bak, serialize(a));
});

test('persist: a write of identical content does nothing', () => {
  const { p, backend } = mk();
  p.load();
  p.write(sample());
  let sets = 0;
  const orig = backend.setItem;
  backend.setItem = (k, v) => {
    sets++;
    orig(k, v);
  };
  assert.equal(p.write(sample()), true);
  assert.equal(sets, 0);
});

test('persist: damaged main + no .bak -> fresh start, damaged text kept in .corrupt, notice "fresh"', () => {
  const backend = createMemoryBackend();
  backend.setItem('lullaby-lake:save', '{"v":1,"seed":1,"sessi');
  const { p, notices } = mk(backend);
  const l = p.load();
  assert.equal(l.status, 'fresh');
  assert.equal(l.save, null);
  assert.deepEqual(notices, ['fresh']);
  assert.equal(p.peek().corrupt, '{"v":1,"seed":1,"sessi');
  // the next write replaces the main file with a valid one and never throws
  assert.equal(p.write(sample()), true);
  assert.equal(parseSave(p.peek().main).status, 'ok');
  assert.equal(p.peek().corrupt, '{"v":1,"seed":1,"sessi', 'the damaged copy is still there');
});

test('persist: damaged main + good .bak -> the .bak is used, and it is NOT overwritten by the damaged text', () => {
  const backend = createMemoryBackend();
  const good = sample({ sessions: 7 });
  backend.setItem('lullaby-lake:save', 'garbage');
  backend.setItem('lullaby-lake:save.bak', serialize(good));
  const { p, notices } = mk(backend);
  const l = p.load();
  assert.equal(l.status, 'restored');
  assert.deepEqual(l.save, good);
  assert.deepEqual(notices, ['restored']);
  p.write(sample({ sessions: 8 }));
  assert.equal(p.peek().bak, serialize(good), '.bak still the good one after the first write');
  p.write(sample({ sessions: 9 }));
  assert.equal(p.peek().bak, serialize(sample({ sessions: 8 })));
});

test('persist: a save from a FUTURE version is never written, over any number of writes', () => {
  const backend = createMemoryBackend();
  const future = JSON.stringify({ v: 2, seed: 1, book: { x: 1 }, brandNew: true });
  backend.setItem('lullaby-lake:save', future);
  backend.setItem('lullaby-lake:save.bak', 'old bak');
  const { p, notices } = mk(backend);
  const l = p.load();
  assert.equal(l.status, 'future');
  assert.equal(l.save, null);
  assert.deepEqual(notices, ['future']);
  for (let i = 0; i < 5; i++) assert.equal(p.write(sample({ sessions: i })), false);
  assert.equal(backend.getItem('lullaby-lake:save'), future);
  assert.equal(backend.getItem('lullaby-lake:save.bak'), 'old bak');
  assert.equal(backend.getItem('lullaby-lake:save.corrupt'), null);
  assert.equal(p.readOnly, 'future');
});

test('persist: a later version appearing during the session (another tab) is not overwritten either', () => {
  const { p, backend, notices } = mk();
  p.load();
  p.write(sample());
  const future = JSON.stringify({ v: 9 });
  backend.setItem('lullaby-lake:save', future);
  assert.equal(p.write(sample({ sessions: 5 })), false);
  assert.equal(backend.getItem('lullaby-lake:save'), future);
  assert.deepEqual(notices, ['future']);
});

test('persist: storage that throws -> memory mode, a single notice, the game can still call write', () => {
  const { p, notices, storage } = mk(failingBackend());
  assert.equal(storage.mode, 'memory');
  const l = p.load();
  assert.equal(l.status, 'memory');
  assert.equal(p.write(sample()), true);
  assert.equal(p.write(sample({ sessions: 2 })), true);
  assert.deepEqual(notices, ['memory']);
});

test('persist: quota error during the session -> memory mode, notice once, no exception', () => {
  const m = createMemoryBackend();
  let full = false;
  const backend = {
    getItem: (k) => m.getItem(k),
    setItem: (k, v) => {
      if (full) throw new Error('QuotaExceededError');
      m.setItem(k, v);
    },
    removeItem: (k) => m.removeItem(k),
  };
  const { p, notices } = mk(backend);
  p.load();
  assert.equal(p.write(sample()), true);
  full = true;
  assert.doesNotThrow(() => p.write(sample({ sessions: 2 })));
  assert.doesNotThrow(() => p.write(sample({ sessions: 3 })));
  assert.deepEqual(notices, ['memory']);
});

test('persist: two tabs - the tab that sees the other one write stops writing and says so once', () => {
  const backend = createMemoryBackend();
  const A = mk(backend);
  A.p.load();
  A.p.write(sample({ sessions: 1 }));
  const B = mk(backend); // second tab: loads, counts its session, writes
  B.p.load();
  assert.equal(B.p.write(sample({ sessions: 2 })), true);
  // A is told by the storage event
  assert.equal(A.p.otherTab(), true);
  assert.equal(A.p.otherTab(), false, 'only once');
  assert.equal(A.p.write(sample({ sessions: 99 })), false);
  assert.deepEqual(A.notices, ['other-tab']);
  assert.equal(parseSave(backend.getItem('lullaby-lake:save')).save.sessions, 2, 'B kept its data');
});

test('persist: two tabs without the event (late delivery): a write that finds foreign content stops instead of overwriting', () => {
  const backend = createMemoryBackend();
  const A = mk(backend);
  A.p.load();
  A.p.write(sample({ sessions: 1 }));
  const B = mk(backend);
  B.p.load();
  B.p.write(sample({ sessions: 2 }));
  assert.equal(A.p.write(sample({ sessions: 50 })), false);
  assert.equal(A.p.readOnly, 'other-tab');
  assert.deepEqual(A.notices, ['other-tab']);
});

test('persist: the debug namespace never touches the normal keys', () => {
  const backend = createMemoryBackend();
  const real = mk(backend);
  real.p.load();
  real.p.write(sample({ sessions: 3 }));
  const before = backend.getItem('lullaby-lake:save');
  const dbg = mk(backend, 'lullaby-lake:debug:');
  assert.equal(dbg.p.load().status, 'new', 'does not see the real save');
  dbg.p.write(sample({ sessions: 1 }));
  dbg.p.write(sample({ sessions: 2 }));
  assert.equal(backend.getItem('lullaby-lake:save'), before);
  assert.equal(backend.getItem('lullaby-lake:save.bak'), null);
  assert.ok(backend.getItem('lullaby-lake:debug:save'));
});

// ---------------------------------------------------------------- the game with a save
test('draw: same (seed, session) = same sequence ; two sessions of one save = different sequences', () => {
  const seq = (seed, sessions) => {
    const g = makeGame({ seed, sessions });
    const out = [];
    for (let i = 0; i < 12; i++) {
      const r = castToBite(g);
      const bite = r.events.filter((e) => e.type === 'bite').pop();
      out.push(bite.speciesId + '@' + r.steps);
      stepN(g, 1, { down: true }); // reel in
      runUntil(g, (ev) => ev.some((e) => e.type === 'caught'));
      stepN(g, 1, { down: true }); // release
    }
    return out.join(',');
  };
  const a = seq(31, 1);
  assert.equal(a, seq(31, 1));
  assert.notEqual(a, seq(31, 2));
  assert.notEqual(seq(31, 2), seq(31, 3));
});

test('game: exportWorld / loadSave bring back the book, the luck counters, the clock and the weather', () => {
  const g = makeGame({ seed: 5, start: { phase: 'dusk', weather: 'clear', freezeClock: false, freezeWeather: false } });
  castToBite(g);
  stepN(g, 1, { down: true });
  runUntil(g, (ev) => ev.some((e) => e.type === 'caught'));
  const st = g.getState();
  const w = g.exportWorld();
  const saved = parseSave(serialize(makeSave(newSave(5), { seed: 5, sessions: 1, clock: w.clock, weather: w.weather, pity: st.pity, book: st.book, settings: defaultSettings() }))).save;
  const g2 = makeGame({ seed: 5, sessions: 2, start: { freezeClock: false, freezeWeather: false } });
  g2.loadSave({ book: saved.book, pity: saved.pity, clock: saved.clock, weather: saved.weather });
  const s2 = g2.getState();
  assert.deepEqual(s2.book, st.book);
  assert.deepEqual(s2.pity, st.pity);
  assert.equal(s2.world.weather, w.weather.id);
  assert.ok(Math.abs(s2.world.dayFrac - w.clock.dayFrac) < 1e-9);
  assert.equal(s2.world.day, w.clock.day);
  assert.ok(Math.abs(g2.exportWorld().weather.leftS - w.weather.leftS) < 0.2);
});

test('game: loadSave ignores an unknown weather id and counts the days on from the save', () => {
  const g = makeGame({ seed: 1, start: { phase: 'dusk', weather: 'clear', freezeClock: false, freezeWeather: true } });
  g.loadSave({ book: {}, pity: {}, clock: { day: 6, dayFrac: 0.9 }, weather: { id: 'tornado', leftS: 10 } });
  assert.equal(g.exportWorld().clock.day, 6);
  assert.notEqual(g.exportWorld().weather.id, 'tornado');
  for (let i = 0; i < 60 * 70; i++) g.step(1 / 60); // 70 s of game: 0.9 + 0.146 -> the next day
  assert.equal(g.exportWorld().clock.day, 7);
});
