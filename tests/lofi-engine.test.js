// Lofi music in the audio engine (J6 part C), on the tiny fake context of tests/audio-fake.js: nodes made and freed, bars scheduled
// back to back, cross-fade between the two styles, nothing made in "no sound", saved setting, old saves.
import test from 'node:test';
import assert from 'node:assert/strict';
import audioData from '../src/data/audio.js';
import { audioLevels } from '../src/core/audioMix.js';
import { lookParams, snapMix } from '../src/core/sky.js';
import config from '../src/data/config.js';
import weatherList from '../src/data/weather.js';
import sky from '../src/data/sky.js';
import { mulberry32 } from '../src/core/rng.js';
import { createAudioEngine } from '../src/audio/engine.js';
import { defaultSettings, parseSave, serialize, makeSave, newSave, validateSave, normalizeSave } from '../src/core/save.js';
import { createFakeContext } from './audio-fake.js';

const look = (f, w = 'clear') => lookParams(f, snapMix(weatherList, w), weatherList, config, sky);
const MID = { dawn: 0.0625, day: 0.3125, dusk: 0.5625, night: 0.8125 };

function rig({ seed = 7, analyser = false } = {}) {
  const made = [];
  let tickFn = null;
  const afters = [];
  let clockMs = 0;
  const engine = createAudioEngine({
    makeContext: () => {
      const c = createFakeContext({ state: 'suspended' });
      made.push(c);
      return c;
    },
    rng: mulberry32(seed),
    analyser,
    timers: { set: (f) => ((tickFn = f), 1), clear: () => (tickFn = null), after: (f, ms) => afters.push({ f, ms }) },
    perfNow: () => (clockMs += 0.4), // a fake clock: every reading costs 0.4 ms, so a 4 ms budget = about 10 jobs per tick, deterministic
  });
  const run = (s, each = null) => {
    const c = made[0];
    for (let i = 0; i < Math.round(s * 10); i++) {
      c.advance(0.1);
      engine.tick();
      if (each) each(c);
    }
  };
  return { engine, made, run, afters };
}
const lofiSources = (c) => c.nodes.filter((n) => n.kind === 'source' && !n.loop && n.buffer && n.startAt !== undefined && n.buffer.sampleRate === 22050);
const NIGHT_LEVELS = { ...audioLevels(look(MID.night)), music: 0.75 };

test('lofi data: the default style is the existing soft one, the settings carry it, both styles are named', () => {
  assert.equal(audioData.defaultStyle, 'soft');
  assert.deepEqual([...audioData.styles], ['soft', 'lofi', 'real']); // J6 part D added the recorded tracks
  assert.equal(defaultSettings().musicStyle, 'soft');
  assert.equal(audioData.defaults.musicStyle, audioData.defaultStyle);
});

test('lofi engine: "no sound" and the time before the first gesture make no context, whatever the style', () => {
  const r = rig();
  r.engine.setStyle('lofi');
  r.engine.setLevels(NIGHT_LEVELS);
  r.engine.tick();
  r.engine.sfx('catch');
  assert.equal(r.made.length, 0);
  assert.equal(r.engine.style, 'lofi', 'the choice is remembered for later');
  r.engine.setStyle('jazz');
  assert.equal(r.engine.style, 'lofi', 'an unknown style is ignored');
  assert.equal(r.engine.stats().state, 'none');
});

test('lofi engine: bars are scheduled back to back (no gap, no overlap beyond the tail), on exact times, with at most 3 sources and 24 nodes alive', () => {
  const r = rig({ analyser: true });
  r.engine.setStyle('lofi');
  r.engine.start();
  r.engine.setLevels(NIGHT_LEVELS);
  let worst = 0;
  let maxSources = 0;
  r.run(60, (c) => {
    worst = Math.max(worst, c.live().length);
    maxSources = Math.max(maxSources, lofiSources(c).filter((n) => !n.disconnected).length);
    assert.equal(r.engine.stats().nodes, c.live().length);
  });
  const c = r.made[0];
  const src = lofiSources(c);
  assert.ok(src.length >= 17 && src.length <= 21, 'about 60 s / 3.1 s bars: ' + src.length);
  assert.ok(src[0].startAt > 0 && src[0].startAt < 3, 'first bar starts soon: ' + src[0].startAt);
  for (let i = 1; i < src.length; i++) {
    const gap = src[i].startAt - src[i - 1].startAt;
    const dur = src[i - 1].buffer.duration;
    assert.ok(gap > 2.9 && gap < 3.6, `bar length ${gap} (68-82 BPM)`);
    assert.ok(gap <= dur + 1e-9, `no silence between bar ${i - 1} and ${i}: gap ${gap}, buffer ${dur}`);
    assert.ok(src[i - 1].stopAt >= src[i].startAt - 1e-9, 'the tail of a bar is still playing when the next starts');
  }
  assert.ok(maxSources <= 3, 'sources alive ' + maxSources);
  assert.ok(worst <= 24, 'nodes ' + worst);
  const s = r.engine.stats();
  assert.equal(s.counts.lofiBars, src.length);
  assert.equal(s.counts.lofiLate, 0, 'never late with a steady scheduler');
  assert.equal(s.counts.lofiSkipped, 0);
  // finished sources are released: only the last ones live
  assert.ok(c.nodes.filter((n) => n.kind === 'source' && n.buffer && n.buffer.sampleRate === 22050 && n.disconnected).length >= src.length - 3);
  // the chain: lofi gain -> tape low-pass -> music bus
  const tape = c.nodes.find((n) => n.kind === 'filter' && n.frequency.value === audioData.lofi.tapeHz);
  assert.ok(tape, 'tape low-pass');
  assert.ok(src[0].connections[0].connections.includes(tape));
  assert.equal(tape.connections.length, 1);
  assert.ok(s.nodes <= 24 && s.peakNodes <= 24);
});

test('lofi engine: while lofi plays no soft note is started; soft -> lofi and lofi -> soft cross-fade (smooth targets, tails die, nodes freed, the echo is freed)', () => {
  const r = rig({ analyser: true });
  r.engine.start();
  r.engine.setLevels(NIGHT_LEVELS);
  r.run(30);
  const c = r.made[0];
  const notes1 = r.engine.stats().counts.notes;
  assert.ok(notes1 >= 3, 'soft style: notes ' + notes1);
  assert.equal(r.engine.stats().lofi.chain, false);
  r.engine.setStyle('lofi');
  const t0 = c.currentTime;
  r.run(6);
  const notes2 = r.engine.stats().counts.notes;
  assert.ok(notes2 - notes1 <= 3, 'the soft notes may go on only until the first lofi bar is playing: ' + (notes2 - notes1));
  r.run(14);
  assert.equal(r.engine.stats().counts.notes, notes2, 'no new soft note once the lofi plays');
  assert.ok(r.engine.stats().counts.lofiBars >= 5);
  const lg = c.nodes.find((n) => n.kind === 'gain' && n.connections.some((x) => x.kind === 'filter' && x.frequency.value === audioData.lofi.tapeHz));
  assert.ok(lg, 'lofi gain');
  // smooth: only exponential targets with a time constant >= 0.2 s except the 40 ms duck (none here), the start is 0 by a plain value
  for (const e of lg.gain.events) if (e[0] === 'target') assert.ok(e[3] >= 0.2, 'tc ' + e[3]);
  const firstTarget = lg.gain.events.find((e) => e[0] === 'target');
  assert.ok(firstTarget[1] > 0.1 && firstTarget[1] <= audioData.lofi.gain + 1e-9 && firstTarget[3] >= 1, 'rises with a slow constant: ' + firstTarget);
  const firstBar = lofiSources(c)[0];
  assert.ok(firstBar.startAt - firstTarget[2] >= 0 && firstBar.startAt - firstTarget[2] <= 0.3, 'the fade-in starts with the first bar, not before it: ' + (firstBar.startAt - firstTarget[2]));
  assert.ok(firstTarget[2] >= t0, 'after the switch');
  // the echo of the soft music was freed once its notes had died
  assert.ok(c.nodes.filter((n) => n.kind === 'delay' && !n.disconnected).length === 0, 'echo freed');
  // back to soft
  r.engine.setStyle('soft');
  r.run(2);
  const down = lg.gain.events.filter((e) => e[0] === 'target').pop();
  assert.equal(down[1], 0, 'fades to 0');
  assert.ok(down[3] >= 0.5, 'slowly: ' + down[3]);
  assert.ok(r.engine.stats().lofi.chain, 'still there while it fades');
  r.run(9);
  assert.equal(r.engine.stats().lofi.chain, false, 'chain freed after offAfterS');
  assert.equal(r.engine.stats().lofi.sources, 0);
  assert.equal(r.engine.stats().nodes, c.live().length);
  r.run(20);
  assert.ok(r.engine.stats().counts.notes > notes1, 'soft notes are back');
  assert.ok(r.engine.stats().peakNodes <= 24);
});

test('lofi engine: 10 minutes of a real day (weather changes, effects spammed, catch jingles duck the music by 3 dB) never go over 24 nodes, and effects still play', () => {
  const r = rig({ seed: 11, analyser: true });
  r.engine.setStyle('lofi');
  r.engine.start();
  const rng = mulberry32(5);
  const sfx = ['cast', 'splash', 'bite', 'bite-soft', 'catch', 'reel', 'click'];
  const weathers = ['clear', 'cloudy', 'rain', 'mist'];
  let worst = 0;
  let steps = 0;
  let played = 0;
  r.run(600, (c) => {
    steps++;
    if (steps % 7 === 0) {
      const n = c.live().length;
      r.engine.sfx(sfx[Math.floor(rng() * sfx.length)]);
      if (c.live().length > n) played++;
    }
    if (steps % 5 === 0) r.engine.setLevels(audioLevels(look(((steps / 10) / 480) % 1, weathers[Math.floor(steps / 10 / 90) % 4])));
    worst = Math.max(worst, c.live().length);
    assert.ok(c.live().length <= 24, `${c.live().length} nodes at ${c.currentTime.toFixed(1)}`);
  });
  const s = r.engine.stats();
  assert.ok(worst <= 24 && s.peakNodes <= 24, JSON.stringify({ worst, peak: s.peakNodes }));
  assert.ok(played > 20, 'effects play: ' + played);
  assert.ok(s.counts.lofiBars > 150, 'bars: ' + JSON.stringify(s.counts));
  assert.ok(s.counts.lofiSkipped < 80, 'bars that had to wait a tick for a node: ' + s.counts.lofiSkipped); // 34 seen with an effect every 0.7 s
  assert.equal(s.counts.lofiLate, 0);
  const c = r.made[0];
  const lg = c.nodes.find((n) => n.kind === 'gain' && n.connections.some((x) => x.kind === 'filter' && x.frequency.value === audioData.lofi.tapeHz));
  const duck = lg.gain.events.filter((e) => e[0] === 'target' && e[3] === 0.04);
  assert.ok(duck.length >= 3, 'ducks on the catch jingle: ' + duck.length);
  // a duck is at most -3 dB of the level it comes from
  assert.ok(duck.every((e) => e[1] >= audioData.lofi.gain * 0.45 * audioData.lofi.duckGain - 1e-9));
  assert.ok(s.lofi.renderMsMax >= 0);
});

test('lofi engine: a late scheduler (throttled timer) restarts the loop on the next beat, counted, never piles up sources; hidden tab suspends and resumes', () => {
  const r = rig();
  r.engine.setStyle('lofi');
  r.engine.start();
  r.engine.setLevels(NIGHT_LEVELS);
  r.run(20);
  const c = r.made[0];
  const before = r.engine.stats().counts.lofiBars;
  c.advance(9); // nothing ticked for 9 s
  r.run(6);
  const s = r.engine.stats();
  assert.ok(s.counts.lofiLate >= 1 && s.counts.lofiLate <= 2, 'late: ' + s.counts.lofiLate);
  assert.ok(s.counts.lofiBars > before);
  assert.ok(lofiSources(c).filter((n) => !n.disconnected).length <= 3);
  r.run(10);
  assert.equal(r.engine.stats().counts.lofiLate, s.counts.lofiLate, 'steady again');
  // hidden: suspended, the scheduler does nothing; shown: it goes on
  r.engine.hide();
  assert.equal(c.state, 'suspended');
  const bars = r.engine.stats().counts.lofiBars;
  for (let i = 0; i < 30; i++) r.engine.tick();
  assert.equal(r.engine.stats().counts.lofiBars, bars, 'no work while suspended');
  r.engine.show();
  assert.equal(c.state, 'running');
  r.run(8);
  assert.ok(r.engine.stats().counts.lofiBars > bars);
});

test('lofi engine: the music level of the sky drives the lofi gain; level 0 fades it out and frees its nodes; mute rules are unchanged', () => {
  const r = rig();
  r.engine.setStyle('lofi');
  r.engine.start();
  r.engine.setLevels(NIGHT_LEVELS);
  r.run(10);
  const c = r.made[0];
  const lg = c.nodes.find((n) => n.kind === 'gain' && n.connections.some((x) => x.kind === 'filter' && x.frequency.value === audioData.lofi.tapeHz));
  const t1 = lg.gain.events.filter((e) => e[0] === 'target').pop()[1];
  r.engine.setLevels({ music: 0.45 });
  r.run(3);
  const t2 = lg.gain.events.filter((e) => e[0] === 'target').pop()[1];
  assert.ok(t2 < t1 && Math.abs(t2 / t1 - 0.6) < 0.01, `rain lowers the music to 60 %: ${t1} -> ${t2}`);
  r.engine.setLevels({ music: 0 });
  r.run(12);
  assert.equal(r.engine.stats().lofi.chain, false);
  // mute: effects and scheduling follow the same rules as before
  r.engine.setLevels(NIGHT_LEVELS);
  r.run(5);
  r.engine.setMuted(true);
  r.afters[r.afters.length - 1].f();
  assert.equal(c.state, 'suspended');
  const n = r.engine.stats().counts.lofiBars;
  for (let i = 0; i < 20; i++) r.engine.tick();
  assert.equal(r.engine.stats().counts.lofiBars, n);
  r.engine.setMuted(false);
  r.run(8);
  assert.ok(r.engine.stats().counts.lofiBars > n);
});

test('lofi engine: the lofi buffer is made by code: mono, 22.05 kHz, finite, never over the ceiling', () => {
  const r = rig();
  r.engine.setStyle('lofi');
  r.engine.start();
  r.engine.setLevels(NIGHT_LEVELS);
  r.run(12);
  const src = lofiSources(r.made[0]);
  assert.ok(src.length >= 3);
  for (const n of src) {
    assert.equal(n.buffer.numberOfChannels, 1);
    const d = n.buffer.getChannelData(0);
    let peak = 0;
    for (const v of d) {
      assert.ok(Number.isFinite(v));
      peak = Math.max(peak, Math.abs(v));
    }
    assert.ok(peak > 0.05 && peak <= 0.62 + 1e-6, 'peak ' + peak);
  }
});

test('save: the music style is saved and read back; an old save without it gets the default; an unknown name falls back; a non-text value is corrupt', () => {
  const s = newSave(4);
  assert.equal(s.settings.musicStyle, audioData.defaultStyle);
  const saved = makeSave(s, { seed: 4, sessions: 1, clock: null, weather: null, pity: {}, book: {}, settings: { ...s.settings, musicStyle: 'lofi' } });
  const back = parseSave(serialize(saved));
  assert.equal(back.status, 'ok');
  assert.equal(back.save.settings.musicStyle, 'lofi');
  // an older save (no musicStyle at all)
  const old = JSON.parse(serialize(saved));
  delete old.settings.musicStyle;
  const o = parseSave(JSON.stringify(old));
  assert.equal(o.status, 'ok');
  assert.equal(o.save.settings.musicStyle, audioData.defaultStyle);
  const none = parseSave(JSON.stringify({ v: 1, seed: 1, sessions: 0, book: {} }));
  assert.equal(none.save.settings.musicStyle, audioData.defaultStyle);
  // a style of a later version: kept playable (default), the save is not refused
  const fut = parseSave(JSON.stringify({ ...old, settings: { ...old.settings, musicStyle: 'jazz' } }));
  assert.equal(fut.status, 'ok');
  assert.equal(fut.save.settings.musicStyle, audioData.defaultStyle);
  assert.deepEqual(validateSave({ ...old, settings: { ...old.settings, musicStyle: 3 } }), ['settings.musicStyle']);
  assert.equal(parseSave(JSON.stringify({ ...old, settings: { ...old.settings, musicStyle: 3 } })).status, 'corrupt');
  assert.equal(normalizeSave(old).settings.musicStyle, audioData.defaultStyle);
});
