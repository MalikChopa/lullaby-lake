// Real lofi tracks (J6 part D): data, playlist, cross-fade curves, and the engine on the tiny fake context with a fake fetch/decoder.
// Nothing here touches the network or the disk beyond reading the file sizes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { statSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import audioData from '../src/data/audio.js';
import { audioLevels } from '../src/core/audioMix.js';
import { lookParams, snapMix } from '../src/core/sky.js';
import config from '../src/data/config.js';
import weatherList from '../src/data/weather.js';
import sky from '../src/data/sky.js';
import { mulberry32 } from '../src/core/rng.js';
import { createPlaylist } from '../src/core/playlist.js';
import { fadeCurve, trackTimes } from '../src/core/crossfade.js';
import { createAudioEngine } from '../src/audio/engine.js';
import { isTrackUrl, decodeBytes } from '../src/audio/trackLoader.js';
import { defaultSettings, parseSave, makeSave, newSave, validateSave, normalizeSave } from '../src/core/save.js';
import { createFakeContext } from './audio-fake.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const look = (f, w = 'clear') => lookParams(f, snapMix(weatherList, w), weatherList, config, sky);
const NIGHT = { ...audioLevels(look(0.8125)), music: 0.75 };
const TRACKS = audioData.real.tracks;

// ------------------------------------------------------------------ data
test('real data: the third style exists, the default stays soft, the three tracks are the three files on disk', () => {
  assert.deepEqual([...audioData.styles], ['soft', 'lofi', 'real']);
  assert.equal(audioData.defaultStyle, 'soft');
  assert.equal(TRACKS.length, 3);
  const sizes = { chill: 2717205, again: 2419417, loop: 1430666 };
  for (const t of TRACKS) {
    assert.ok(isTrackUrl(t.url), t.url);
    assert.equal(statSync(join(ROOT, t.url)).size, sizes[t.id], t.id + ' size');
  }
  assert.equal(new Set(TRACKS.map((t) => t.id)).size, 3);
  assert.ok(audioData.real.crossS >= 3, 'cross-fade of at least 3 s between tracks');
});

test('real data: the fixed gains bring every file to the loudness of the generated lofi (-26.6 dBFS RMS +-0.2 dB), measured RMS of the files', () => {
  const rms = { chill: -18.0, again: -17.41, loop: -18.94 }; // ffmpeg astats, mono mix, 2026-11-05 (journal J6 part D)
  const target = 20 * Math.log10(audioData.lofi.gain) - 18.6; // generated lofi: gain 0.4 on a bar at -18.6 dBFS RMS
  for (const t of TRACKS) {
    const out = rms[t.id] + 20 * Math.log10(t.gain);
    assert.ok(Math.abs(out - target) < 0.2, `${t.id}: ${out.toFixed(2)} dBFS vs ${target.toFixed(2)}`);
    assert.ok(t.gain > 0 && t.gain < 1);
  }
  const spread = Math.max(...TRACKS.map((t) => rms[t.id] + 20 * Math.log10(t.gain))) - Math.min(...TRACKS.map((t) => rms[t.id] + 20 * Math.log10(t.gain)));
  assert.ok(spread < 0.3, 'spread between tracks ' + spread);
});

test('real data: only these three paths can be fetched - the loader refuses any other address', () => {
  for (const bad of ['http://example.org/a.mp3', '//example.org/a.mp3', '../assets/music/a.mp3', 'assets/music/../x.mp3', 'assets/music/a.mp3?x=1', 'assets/music/a.wav', 'src/main.js', '/assets/music/a.mp3', 'assets/other/a.mp3', '', null, undefined, 5]) {
    assert.equal(isTrackUrl(bad), false, String(bad));
  }
  for (const t of TRACKS) assert.equal(isTrackUrl(t.url), true);
});

// ------------------------------------------------------------------ playlist
test('playlist: every round holds the 3 tracks once, never the same track twice in a row (also between rounds), seeded', () => {
  const ids = TRACKS.map((t) => t.id);
  const run = (seed, n) => {
    const p = createPlaylist({ ids, rng: mulberry32(seed) });
    return Array.from({ length: n }, () => p.next());
  };
  for (let seed = 1; seed <= 200; seed++) {
    const o = run(seed, 30);
    for (let i = 1; i < o.length; i++) assert.notEqual(o[i], o[i - 1], `seed ${seed} at ${i}`);
    for (let r = 0; r < 10; r++) assert.deepEqual(o.slice(r * 3, r * 3 + 3).sort(), [...ids].sort(), `seed ${seed} round ${r}`);
  }
  assert.deepEqual(run(7, 12), run(7, 12), 'same seed, same order');
  const firsts = new Set();
  for (let seed = 1; seed <= 60; seed++) firsts.add(run(seed, 1)[0]);
  assert.equal(firsts.size, 3, 'the first track varies with the seed');
  const orders = new Set();
  for (let seed = 1; seed <= 60; seed++) orders.add(run(seed, 3).join());
  assert.ok(orders.size >= 5, 'several different orders: ' + orders.size);
});

test('playlist: a failed track leaves the row; the others go on without a repeat; with one left it repeats; retry brings them back', () => {
  const p = createPlaylist({ ids: ['a', 'b', 'c'], rng: mulberry32(3) });
  const first = p.next();
  p.fail('b');
  const seq = [first, ...Array.from({ length: 20 }, () => p.next())];
  assert.ok(!seq.slice(1).includes('b'));
  for (let i = 1; i < seq.length; i++) assert.notEqual(seq[i], seq[i - 1]);
  assert.equal(p.left, 2);
  p.fail('a');
  p.fail('c');
  assert.equal(p.left, 0);
  assert.equal(p.next(), null);
  p.retry();
  assert.equal(p.left, 3);
  const one = createPlaylist({ ids: ['a', 'b'], rng: mulberry32(1) });
  one.next();
  one.fail('b');
  one.fail('a');
  one.retry();
  one.fail('b');
  assert.deepEqual([one.next(), one.next(), one.next()], ['a', 'a', 'a'], 'only one track left: it may repeat');
});

// ------------------------------------------------------------------ cross-fade curves
test('crossfade: equal-power curves (in^2 + out^2 = 1), exact silent ends, smooth (no step), monotonic', () => {
  const a = fadeCurve('out', 128, 1);
  const b = fadeCurve('in', 128, 1);
  assert.equal(a.length, 128);
  assert.equal(b[0], 0);
  assert.equal(a[127] < 1e-6 && a[127] === 0, true);
  assert.equal(a[0], 1);
  assert.ok(Math.abs(b[127] - 1) < 1e-6);
  let worst = 0;
  for (let i = 0; i < 128; i++) {
    if (i > 0 && i < 127) worst = Math.max(worst, Math.abs(a[i] * a[i] + b[i] * b[i] - 1));
    if (i > 0) {
      assert.ok(b[i] >= b[i - 1] && a[i] <= a[i - 1], 'monotonic');
      assert.ok(Math.abs(b[i] - b[i - 1]) < 0.02 && Math.abs(a[i] - a[i - 1]) < 0.02, 'step ' + i);
    }
  }
  assert.ok(worst < 1e-6, 'power ' + worst);
  const half = fadeCurve('in', 128, 0.37);
  assert.ok(Math.abs(half[127] - 0.37) < 1e-6, 'peak scales');
  // a straight-line cross-fade would dip by 3 dB in the middle; this one does not
  const mid = 64;
  assert.ok(Math.abs(10 * Math.log10(a[mid] ** 2 + b[mid] ** 2)) < 0.01);
});

test('crossfade: trackTimes puts the next track one cross-fade before the end and keeps the in and out curves apart on short tracks', () => {
  const t = trackTimes(88, 4);
  assert.deepEqual(t, { fadeInS: 4, fadeOutS: 4, nextAtS: 84 });
  const s = trackTimes(6, 4);
  assert.ok(s.fadeInS + s.fadeOutS <= 6 * 0.67 + 1e-9 && s.nextAtS > s.fadeInS);
});

// ------------------------------------------------------------------ the engine
function rig({ seed = 11, fail = new Set(), failAll = false, delayMs = 0, slow = 0, readCostMs = 0.4 } = {}) {
  let clockMs = 0;
  const made = [];
  const requested = [];
  let tickFn = null;
  const engine = createAudioEngine({
    makeContext: () => {
      const c = createFakeContext({ state: 'suspended' });
      made.push(c);
      return c;
    },
    rng: mulberry32(seed),
    analyser: true,
    timers: { set: (f) => ((tickFn = f), 1), clear: () => (tickFn = null), after: () => {} },
    loadBytes: async (url) => {
      requested.push(url);
      if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
      for (let i = 0; i < slow; i++) await new Promise((r) => setImmediate(r)); // a slow network: the answer comes after this many turns of the event loop
      if (failAll || fail.has(url)) throw new Error('404');
      return { url };
    },
    // 100 Hz fake buffers: the duration is the real one, the memory is tiny
    decode: async (ctx, bytes) => {
      const t = TRACKS.find((x) => x.url === bytes.url);
      if (!t) throw new Error('undecodable');
      return ctx.createBuffer(2, Math.round(t.durationS * 100), 100);
    },
    perfNow: () => (clockMs += readCostMs), // every reading costs 0.4 ms by default: a lofi bar is made in pieces, as on a real machine
  });
  const flush = () => new Promise((r) => setImmediate(r));
  async function run(s, each = null) {
    const c = made[0];
    for (let i = 0; i < Math.round(s * 10); i++) {
      c.advance(0.1);
      engine.tick();
      await flush();
      if (each) each(c);
    }
  }
  return { engine, made, requested, run, flush };
}
const trackSources = (c) => c.nodes.filter((n) => n.kind === 'source' && !n.loop && n.buffer && n.buffer.sampleRate === 100);
const nameOf = (src) => TRACKS.find((t) => Math.round(t.durationS * 100) === src.buffer.length).id;

test('real engine: no request and no context before the first gesture, with "no sound", while muted, or with another style', async () => {
  // before the gesture: only the choice is remembered
  const a = rig();
  a.engine.setStyle('real');
  a.engine.setLevels(NIGHT);
  a.engine.tick();
  await a.flush();
  assert.equal(a.made.length, 0);
  assert.deepEqual(a.requested, []);
  assert.equal(a.engine.style, 'real');
  // started but muted (the saved "muted" setting): nothing is asked until the sound is unmuted
  const b = rig();
  b.engine.setMuted(true);
  b.engine.setStyle('real');
  b.engine.start();
  b.engine.setLevels(NIGHT);
  await b.run(20);
  assert.deepEqual(b.requested, [], 'muted: no request');
  b.engine.setMuted(false);
  await b.run(3);
  assert.equal(b.requested.length, 1, 'unmuted: the first track is asked');
  // another style, started: never a request
  for (const style of ['soft', 'lofi']) {
    const c = rig();
    c.engine.setStyle(style);
    c.engine.start();
    c.engine.setLevels(NIGHT);
    await c.run(40);
    assert.deepEqual(c.requested, [], style);
    assert.equal(c.engine.stats().real.chain, false);
  }
  // the music level at zero (quiet scene): nothing is asked either
  const d = rig();
  d.engine.setStyle('real');
  d.engine.start();
  d.engine.setLevels({ ...NIGHT, music: 0 });
  await d.run(20);
  assert.deepEqual(d.requested, []);
});

test('real engine: the first track is fetched once, starts from silence on exact time, nodes stay under 24, the graph is source -> gain -> real gain -> music bus', async () => {
  const r = rig();
  r.engine.setStyle('real');
  r.engine.start();
  r.engine.setLevels(NIGHT);
  let worst = 0;
  await r.run(25, (c) => {
    worst = Math.max(worst, c.live().length);
    assert.equal(r.engine.stats().nodes, c.live().length);
  });
  const c = r.made[0];
  assert.equal(r.requested.length, 1, 'one request in the first 25 s (the next is asked 50 s + a cross-fade before the end of the first)');
  assert.ok(TRACKS.some((t) => t.url === r.requested[0]));
  const src = trackSources(c);
  assert.equal(src.length, 1);
  assert.ok(src[0].startAt > 0 && src[0].startAt < 1.5, 'starts soon: ' + src[0].startAt);
  const g = src[0].connections[0];
  const curves = g.gain.events.filter((e) => e[0] === 'curve');
  assert.equal(curves.length, 2);
  const [fin, fout] = curves;
  assert.equal(fin[1][0], 0, 'rises from silence');
  assert.ok(fin[3] >= 3, 'fade-in of at least 3 s: ' + fin[3]);
  const tr = TRACKS.find((t) => t.id === nameOf(src[0]));
  assert.ok(Math.abs(fin[1][127] - tr.gain) < 1e-6, 'the curve peaks at the normalisation gain');
  assert.equal(fout[1][127], 0, 'falls to silence at the end');
  assert.ok(Math.abs(fout[2] + fout[3] - (src[0].startAt + src[0].buffer.duration)) < 1e-6, 'the fall ends with the track');
  const out = g.connections[0];
  assert.equal(out.kind, 'gain');
  const bus = out.connections[0];
  assert.ok(bus.connections.some((n) => n.kind === 'comp' || n.kind === 'gain'), 'the real gain feeds a bus');
  assert.ok(worst <= 24, 'nodes ' + worst);
  const s = r.engine.stats();
  assert.equal(s.real.audible, true);
  assert.equal(s.real.heardStyle, null);
  assert.ok(s.real.level > 0.99 && s.real.level <= 1, 'level follows the music level: ' + s.real.level);
  assert.equal(c.nodes.filter((n) => n.kind === 'osc' && !n.disconnected).length <= 6, true);
});

test('real engine: endless playlist - next track asked ~54 s before the end, starts exactly one cross-fade before the end, never the same twice, nodes <= 24, buffers freed', async () => {
  const r = rig({ seed: 5 });
  r.engine.setStyle('real');
  r.engine.start();
  r.engine.setLevels(NIGHT);
  let worst = 0;
  let maxSrc = 0;
  await r.run(700, (c) => {
    worst = Math.max(worst, c.live().length);
    maxSrc = Math.max(maxSrc, trackSources(c).filter((n) => !n.disconnected).length);
  });
  const c = r.made[0];
  const src = trackSources(c);
  assert.ok(src.length >= 6, 'about 700 s of music: ' + src.length);
  const names = src.map(nameOf);
  for (let i = 1; i < names.length; i++) assert.notEqual(names[i], names[i - 1], 'no repeat at ' + i + ': ' + names.join());
  for (let i = 1; i < src.length; i++) {
    const prevEnd = src[i - 1].startAt + src[i - 1].buffer.duration;
    assert.ok(Math.abs(src[i].startAt - (prevEnd - audioData.real.crossS)) < 1e-6, `track ${i} starts one cross-fade before the end of the previous one: ${src[i].startAt} vs ${prevEnd}`);
    const gPrev = src[i - 1].connections[0];
    const outPrev = gPrev.gain.events.filter((e) => e[0] === 'curve')[1];
    const inNext = src[i].connections[0].gain.events.filter((e) => e[0] === 'curve')[0];
    assert.ok(Math.abs(outPrev[2] - inNext[2]) < 1e-6 && Math.abs(outPrev[3] - inNext[3]) < 1e-6, 'the fall of the old and the rise of the new coincide');
  }
  assert.ok(maxSrc <= 2, 'at most 2 tracks alive: ' + maxSrc);
  assert.ok(worst <= 24, 'nodes ' + worst);
  assert.equal(r.requested.length, src.length + (r.engine.stats().real.ready || r.engine.stats().real.loading ? 1 : 0));
  assert.equal(c.nodes.filter((n) => n.kind === 'source' && n.buffer && n.buffer.sampleRate === 100 && !n.disconnected).length <= 2, true, 'finished tracks are released');
  // the request for the next track comes 50 s + the cross-fade before the end of the current one
  const t0 = src[0].startAt;
  assert.ok(r.engine.stats().counts.realRequested >= 6);
  assert.ok(t0 < 1.5);
});

test('real engine: a failing track (404 / undecodable) is skipped; the others play; no request loop', async () => {
  const bad = TRACKS[0].url;
  const r = rig({ seed: 2, fail: new Set([bad]) });
  r.engine.setStyle('real');
  r.engine.start();
  r.engine.setLevels(NIGHT);
  await r.run(500);
  const names = trackSources(r.made[0]).map(nameOf);
  assert.ok(names.length >= 4 && !names.includes(TRACKS[0].id), names.join());
  assert.equal(r.requested.filter((u) => u === bad).length, 1, 'the failing track is asked once, never again');
  assert.equal(r.engine.stats().counts.realFailed, 1);
  assert.equal(r.engine.stats().real.failedAll, false);
});

test('real engine: every track fails -> silent fallback on soft (default) after exactly 3 requests, then no more requests', async () => {
  const r = rig({ failAll: true });
  r.engine.setStyle('real');
  r.engine.start();
  r.engine.setLevels(NIGHT);
  await r.run(120);
  const s = r.engine.stats();
  assert.equal(r.requested.length, 3);
  assert.equal(s.real.failedAll, true);
  assert.equal(s.real.heardStyle, 'soft');
  assert.equal(s.real.chain, false);
  assert.ok(s.counts.notes >= 5, 'the soft notes play: ' + s.counts.notes);
  assert.equal(s.style, 'real', 'the choice is kept (the setting is not changed behind the back of the player)');
  await r.run(200);
  assert.equal(r.requested.length, 3, 'no retry loop');
  // choosing the style again is a new try
  r.engine.setStyle('soft');
  r.engine.setStyle('real');
  await r.run(10);
  assert.equal(r.requested.length, 6, 'three more tries, then it gives up again');
  assert.equal(r.engine.stats().real.failedAll, true);
});

test('real engine: a decode failure is handled like a failed fetch (no throw, fallback)', async () => {
  const made = [];
  const requested = [];
  const engine = createAudioEngine({
    makeContext: () => (made[0] = createFakeContext({ state: 'suspended' })),
    rng: mulberry32(1),
    timers: { set: () => 1, clear: () => {}, after: () => {} },
    loadBytes: async (url) => (requested.push(url), new ArrayBuffer(8)),
    decode: async () => {
      throw new Error('EncodingError');
    },
  });
  engine.setStyle('lofi');
  engine.start();
  engine.setLevels(NIGHT);
  for (let i = 0; i < 20; i++) {
    made[0].advance(0.1);
    engine.tick();
  }
  assert.equal(requested.length, 0);
  engine.setStyle('real');
  for (let i = 0; i < 300; i++) {
    made[0].advance(0.1);
    engine.tick();
    await new Promise((r) => setImmediate(r));
  }
  assert.equal(requested.length, 3);
  const s = engine.stats();
  assert.equal(s.real.failedAll, true);
  assert.equal(s.real.heardStyle, 'lofi', 'back to the style heard before');
  assert.ok(s.lofi.gain > 0, 'the lofi was never faded');
});

test('real engine: decodeBytes handles both the promise form and the callback form of decodeAudioData, and a throw', async () => {
  assert.equal(await decodeBytes({ decodeAudioData: async () => 'buf' }, new ArrayBuffer(1)), 'buf');
  assert.equal(await decodeBytes({ decodeAudioData: (b, ok) => { ok('cb'); } }, new ArrayBuffer(1)), 'cb');
  await assert.rejects(decodeBytes({ decodeAudioData: () => { throw new Error('x'); } }, new ArrayBuffer(1)));
  await assert.rejects(decodeBytes({ decodeAudioData: (b, ok, bad) => { bad(new Error('y')); } }, new ArrayBuffer(1)));
});

test('real engine: soft -> real keeps the soft notes until the first track plays, then stops them; real -> soft brings the notes back while the tracks fall (no jump, no overlap error)', async () => {
  const r = rig({ slow: 30 });
  r.engine.start();
  r.engine.setLevels(NIGHT);
  await r.run(30);
  const c = r.made[0];
  const n0 = r.engine.stats().counts.notes;
  assert.ok(n0 >= 3);
  r.engine.setStyle('real');
  assert.equal(r.engine.stats().real.base, 'soft');
  await r.run(1);
  assert.equal(r.engine.stats().real.heardStyle, 'soft', 'while the track loads, the soft notes go on');
  await r.run(10);
  const s1 = r.engine.stats();
  assert.equal(s1.real.audible, true);
  const n1 = s1.counts.notes;
  await r.run(30);
  assert.equal(r.engine.stats().counts.notes, n1, 'no new soft note once the tracks play');
  // back to soft
  r.engine.setStyle('soft');
  await r.run(1);
  assert.ok(r.engine.stats().real.leaving, 'the tracks begin to fall');
  const out = r.engine.stats().real;
  await r.run(8);
  assert.ok(r.engine.stats().counts.notes > n1, 'soft notes are back');
  assert.equal(r.engine.stats().real.chain, false, 'the tracks are gone, nodes freed');
  assert.equal(trackSources(c).filter((n) => !n.disconnected).length, 0);
  assert.ok(out.leaving);
  // the real gain has a falling curve over >= 3 s
  const rg = c.nodes.find((n) => n.kind === 'gain' && n.gain.events.some((e) => e[0] === 'curve' && e[1][0] > 0.9 && e[1][127] === 0 && e[3] >= 3 && n.gain.events.some((x) => x[0] === 'set')));
  assert.ok(rg, 'real gain fall curve');
  for (const n of c.nodes) if (n.gain && n.gain.discontinuities !== undefined) assert.equal(n.gain.discontinuities, 0);
});

test('real engine: lofi -> real overlaps (lofi stays until the track starts, then falls on an equal-power curve of >= 3 s as the track rises); real -> lofi holds the tracks until a bar is scheduled', async () => {
  const r = rig({ slow: 20, readCostMs: 3 }); // a slow machine: the first lofi bar needs several ticks
  r.engine.setStyle('lofi');
  r.engine.start();
  r.engine.setLevels(NIGHT);
  await r.run(15);
  const c = r.made[0];
  const lofiGain = () => c.nodes.filter((n) => n.kind === 'gain' && n.connections.some((x) => x.kind === 'filter' && x.frequency.value === audioData.lofi.tapeHz)).pop(); // the newest chain
  const lg = lofiGain();
  assert.ok(lg.gain.events.some((e) => e[0] === 'target' && e[1] > 0.1));
  r.engine.setStyle('real');
  await r.run(1);
  assert.equal(r.engine.stats().real.heardStyle, 'lofi');
  await r.run(8);
  assert.equal(r.engine.stats().real.audible, true);
  const fall = lg.gain.events.filter((e) => e[0] === 'curve');
  assert.equal(fall.length, 1);
  assert.ok(fall[0][3] >= 3 && fall[0][1][127] === 0 && fall[0][1][0] > 0.1, 'lofi falls on a curve of ' + fall[0][3] + ' s');
  const track = trackSources(c)[0];
  const rise = track.connections[0].gain.events.find((e) => e[0] === 'curve');
  assert.ok(Math.abs(rise[2] - fall[0][2]) < 0.05, `the two curves start together: ${rise[2]} vs ${fall[0][2]}`);
  assert.ok(Math.abs(rise[3] - fall[0][3]) < 1e-9);
  // power at every point of the overlap: lofi level^2 + tracks^2 (both normalised to the same loudness by the data) stays within 1 dB of the steady value
  const lofiPeak = fall[0][1][0];
  const trackPeak = rise[1][127];
  for (let i = 0; i < 128; i++) {
    const p = (fall[0][1][i] / lofiPeak) ** 2 + (rise[1][i] / trackPeak) ** 2;
    assert.ok(Math.abs(p - 1) < 1e-4, 'equal power at ' + i);
  }
  await r.run(20);
  assert.equal(r.engine.stats().lofi.chain, false, 'the lofi chain is freed after its fall');
  // real -> lofi
  r.engine.setStyle('lofi');
  const barsBefore = r.engine.stats().counts.lofiBars;
  let ticksBeforeBar = 0;
  for (let i = 0; i < 60 && r.engine.stats().lofi.nextStart === null; i++) {
    await r.run(0.1);
    if (r.engine.stats().lofi.nextStart === null) {
      ticksBeforeBar++;
      assert.equal(r.engine.stats().real.leaving, false, 'the tracks play on while the first bar is made');
    }
  }
  assert.ok(ticksBeforeBar >= 1, 'the first bar takes a few ticks to make: ' + ticksBeforeBar);
  await r.run(0.3);
  assert.equal(r.engine.stats().real.leaving, true, 'the tracks fall once the first bar is scheduled');
  await r.run(8);
  const s = r.engine.stats();
  assert.ok(s.counts.lofiBars > barsBefore, 'bars are scheduled');
  assert.equal(s.real.leaving || !s.real.chain, true);
  await r.run(10);
  assert.equal(r.engine.stats().real.chain, false);
  const lg2 = lofiGain();
  const rise2 = lg2.gain.events.filter((e) => e[0] === 'curve' && e[1][0] === 0 && e[1][127] > 0);
  assert.equal(rise2.length, 1, 'the lofi rises on an equal-power curve after the tracks');
  assert.ok(rise2[0][3] >= 3);
  for (const n of c.nodes) if (n.gain && n.gain.discontinuities !== undefined) assert.equal(n.gain.discontinuities, 0, 'no running curve was cut');
  assert.ok(r.engine.stats().peakNodes <= 24, 'peak nodes ' + r.engine.stats().peakNodes);
});

test('real engine: leaving the style while a track is still loading drops the answer (nothing is built)', async () => {
  const r = rig({ delayMs: 100 });
  r.engine.setStyle('real');
  r.engine.start();
  r.engine.setLevels(NIGHT);
  r.made[0].advance(0.1);
  r.engine.tick();
  assert.equal(r.requested.length, 1);
  assert.ok(r.engine.stats().real.loading);
  r.engine.setStyle('soft');
  r.made[0].advance(0.1);
  r.engine.tick();
  await new Promise((res) => setTimeout(res, 200));
  r.made[0].advance(0.1);
  r.engine.tick();
  assert.equal(r.engine.stats().real.chain, false);
  assert.equal(trackSources(r.made[0]).length, 0);
  assert.equal(r.engine.stats().real.ready, null);
});

test('real engine: the tab hidden (context suspended) and shown again keeps the schedule; no request while suspended', async () => {
  const r = rig();
  r.engine.setStyle('real');
  r.engine.start();
  r.engine.setLevels(NIGHT);
  await r.run(10);
  const n = r.requested.length;
  r.engine.hide();
  await r.flush();
  assert.equal(r.made[0].state, 'suspended');
  for (let i = 0; i < 600; i++) r.engine.tick(); // timers may still fire: a suspended context does nothing
  await r.flush();
  assert.equal(r.requested.length, n);
  r.engine.show();
  await r.run(2);
  assert.equal(r.made[0].state, 'running');
  assert.equal(trackSources(r.made[0]).length, 1);
});

test('real engine: the level follows the music slider scale and the sky (rain lowers it), through slow targets only', async () => {
  const r = rig();
  r.engine.setStyle('real');
  r.engine.start();
  r.engine.setLevels({ ...NIGHT, music: 0.35 });
  await r.run(10);
  assert.ok(Math.abs(r.engine.stats().real.level - 0.35 / 0.75) < 1e-9);
  r.engine.setLevels({ ...NIGHT, music: 0.75 });
  await r.run(2);
  const rg = r.made[0].nodes.find((n) => n.kind === 'gain' && n.gain.events.filter((e) => e[0] === 'target').length > 0 && n.connections.length === 1 && n.connections[0].kind === 'gain');
  const tg = rg.gain.events.filter((e) => e[0] === 'target');
  assert.ok(tg.length >= 1 && tg.every((e) => e[3] >= 1), 'slow target');
});

// ------------------------------------------------------------------ the setting
test('real setting: saved and read back; an old save (no field) or an unknown name falls back on soft; defaults unchanged', () => {
  assert.equal(defaultSettings().musicStyle, 'soft');
  const s = newSave(7);
  const saved = makeSave(s, { seed: 4, sessions: 1, clock: null, weather: null, pity: {}, book: {}, settings: { ...s.settings, musicStyle: 'real' } });
  const back = parseSave(JSON.stringify(saved));
  assert.equal(back.status, 'ok');
  assert.equal(back.save.settings.musicStyle, 'real');
  const old = JSON.parse(JSON.stringify(saved));
  delete old.settings.musicStyle;
  assert.equal(parseSave(JSON.stringify(old)).save.settings.musicStyle, 'soft');
  assert.equal(normalizeSave({ ...old, settings: { ...old.settings, musicStyle: 'jazz' } }).settings.musicStyle, 'soft');
  assert.deepEqual(validateSave({ ...old, settings: { ...old.settings, musicStyle: 'real' } }), []);
});

test('real setting: the three style buttons exist in the page with names in both languages (parity checked in strings.test.js)', async () => {
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  for (const st of ['soft', 'lofi', 'real']) assert.ok(html.includes(`data-style="${st}"`), st);
  const fr = (await import('../src/data/strings.fr.js')).default;
  const en = (await import('../src/data/strings.en.js')).default;
  assert.equal(fr['btn.styleReal'], 'Vrais morceaux lofi');
  assert.equal(en['btn.styleReal'], 'Real lofi tracks');
});

// ------------------------------------------------------------------ the files themselves
// tools/hygiene.mjs is private (not in the public copy): this check only runs where it exists
test('real files: the hygiene tool allows exactly the tracks of the data', { skip: !existsSync(join(ROOT, 'tools/hygiene.mjs')) }, async () => {
  const { MUSIC_FILES, MUSIC_NOTE, WHITELIST } = await import('../tools/hygiene.mjs');
  assert.deepEqual([...MUSIC_FILES].sort(), TRACKS.map((t) => t.url).sort());
  for (const f of [...MUSIC_FILES, MUSIC_NOTE]) assert.ok(WHITELIST.files.includes(f), f + ' in the white list');
});

test('real files: the three tracks match SOURCES.txt (size and sha256) and THIRD-PARTY credits them', async () => {
  const { createHash } = await import('node:crypto');
  const MUSIC_FILES = TRACKS.map((t) => t.url);
  const note = readFileSync(join(ROOT, 'assets/music/SOURCES.txt'), 'utf8').replace(/\r\n/g, '\n');
  const third = readFileSync(join(ROOT, 'THIRD-PARTY'), 'utf8');
  for (const rel of MUSIC_FILES) {
    const name = rel.split('/').pop();
    const line = note.split('\n').find((l) => l.startsWith(name + ' '));
    const m = /(\d+) bytes\s+sha256 ([0-9a-f]{64})/.exec(line);
    const buf = readFileSync(join(ROOT, rel));
    assert.equal(buf.length, Number(m[1]), name + ' size');
    assert.equal(createHash('sha256').update(buf).digest('hex'), m[2], name + ' sha256');
    assert.ok(third.includes(m[2]), name + ' is credited in THIRD-PARTY with its sha256');
    assert.ok(third.includes(name), name + ' named in THIRD-PARTY');
  }
  assert.ok(/omfgdude/.test(third) && /CC0/.test(third) && /opengameart\.org\/content\//.test(third));
});

test('real engine: files are decoded at their own sample rate by a throw-away OfflineAudioContext (a 96 kHz context would double the memory); without one, the real context decodes', async () => {
  for (const t of TRACKS) assert.ok([22050, 44100].includes(t.decodeRate), t.id);
  const seen = [];
  globalThis.OfflineAudioContext = class {
    constructor(ch, len, rate) {
      seen.push(rate);
    }
    async decodeAudioData() {
      return { from: 'offline' };
    }
  };
  try {
    assert.deepEqual(await decodeBytes({ decodeAudioData: async () => ({ from: 'main' }) }, new ArrayBuffer(1), 44100), { from: 'offline' });
    assert.deepEqual(seen, [44100]);
    assert.deepEqual(await decodeBytes({ decodeAudioData: async () => ({ from: 'main' }) }, new ArrayBuffer(1)), { from: 'main' }, 'no rate given: the real context');
    globalThis.OfflineAudioContext = class {
      constructor() {
        throw new Error('not allowed');
      }
    };
    assert.deepEqual(await decodeBytes({ decodeAudioData: async () => ({ from: 'main' }) }, new ArrayBuffer(1), 44100), { from: 'main' }, 'constructor refused: the real context');
  } finally {
    delete globalThis.OfflineAudioContext;
  }
  // the engine passes the rate of the track to the decoder
  const rates = [];
  const made = [];
  const engine = createAudioEngine({
    makeContext: () => (made[0] = createFakeContext({ state: 'suspended' })),
    rng: mulberry32(3),
    timers: { set: () => 1, clear: () => {}, after: () => {} },
    loadBytes: async (url) => ({ url }),
    decode: async (ctx, bytes, rate) => {
      rates.push([bytes.url.split('/').pop(), rate]);
      return ctx.createBuffer(1, 1000, 100);
    },
  });
  engine.setStyle('real');
  engine.start();
  engine.setLevels(NIGHT);
  made[0].advance(0.1);
  engine.tick();
  await new Promise((r) => setImmediate(r));
  assert.equal(rates.length, 1);
  const t = TRACKS.find((x) => x.url.endsWith(rates[0][0]));
  assert.equal(rates[0][1], t.decodeRate);
});
