import test from 'node:test';
import assert from 'node:assert/strict';
import audioData from '../src/data/audio.js';
import { audioLevels, volumeGain, scaleFor } from '../src/core/audioMix.js';
import { lookParams, snapMix, pinnedLook } from '../src/core/sky.js';
import config from '../src/data/config.js';
import weatherList from '../src/data/weather.js';
import sky from '../src/data/sky.js';
import presets from '../src/data/palettes.js';
import { mulberry32 } from '../src/core/rng.js';
import { whiteLoop, brownLoop, rainLoop, cricketsLoop } from '../src/audio/noise.js';
import { createAudioEngine } from '../src/audio/engine.js';
import { createAudioHooks } from '../src/audio/hooks.js';
import { createFakeContext } from './audio-fake.js';

const look = (f, w = 'clear') => lookParams(f, snapMix(weatherList, w), weatherList, config, sky);
const MID = { dawn: 0.0625, day: 0.3125, dusk: 0.5625, night: 0.8125 };

/** An engine on a fake context with timers driven by hand. */
function rig({ seed = 7, analyser = false } = {}) {
  const made = [];
  let tickFn = null;
  const afters = [];
  const engine = createAudioEngine({
    makeContext: () => {
      const c = createFakeContext({ state: 'suspended' });
      made.push(c);
      return c;
    },
    rng: mulberry32(seed),
    analyser,
    timers: { set: (f) => ((tickFn = f), 1), clear: () => (tickFn = null), after: (f, ms) => afters.push({ f, ms }) },
  });
  /** Moves audio time forward by s seconds in 0.1 s steps, running the scheduler each step. */
  const run = (s, each = null) => {
    const c = made[0];
    for (let i = 0; i < Math.round(s * 10); i++) {
      c.advance(0.1);
      engine.tick();
      if (each) each(c);
    }
  };
  return { engine, made, run, afters, ticking: () => tickFn !== null };
}

test('audio mix: volume curve is a square from 0 to 1, levels follow the sky (rain, crickets, birds, scale)', () => {
  assert.equal(volumeGain(0), 0);
  assert.equal(volumeGain(100), 1);
  assert.equal(volumeGain(50), 0.25);
  assert.equal(volumeGain(-5), 0);
  assert.equal(volumeGain(500), 1);
  assert.equal(volumeGain(NaN), 0);
  let prev = -1;
  for (let v = 0; v <= 100; v += 5) {
    assert.ok(volumeGain(v) > prev);
    prev = volumeGain(v);
  }
  const day = audioLevels(look(MID.day));
  const night = audioLevels(look(MID.night));
  const rain = audioLevels(look(MID.night, 'rain'));
  assert.ok(day.birds === 1 && night.birds === 0 && day.crickets === 0 && night.crickets === 1);
  assert.ok(rain.rain === 1 && rain.crickets < 0.1 && rain.birds === 0 && rain.music < night.music);
  assert.ok(day.rain === 0 && day.water > 0 && night.wind >= 0.15);
  assert.equal(day.scale, 'day');
  assert.equal(night.scale, 'night');
  assert.equal(rain.scale, 'rain');
  assert.equal(audioLevels(look(MID.dawn)).scale, 'dawn');
  assert.equal(scaleFor(pinnedLook('dusk', presets, sky)), 'dusk');
  assert.equal(scaleFor(pinnedLook('fog', presets, sky)), 'rain', 'mist is calm, as rain');
  assert.equal(rain.wind, 0, 'heavy rain covers the wind');
  for (const k of ['water', 'wind', 'birds', 'crickets', 'rain', 'music']) for (const l of [day, night, rain]) assert.ok(l[k] >= 0 && l[k] <= 1);
});

test('audio mix: the levels change continuously over a day and with a weather change (no jump)', () => {
  let prev = audioLevels(look(0));
  let worst = 0;
  for (let i = 1; i <= 4800; i++) {
    const cur = audioLevels(look((i / 4800) % 1));
    for (const k of ['water', 'wind', 'birds', 'crickets', 'rain', 'music']) worst = Math.max(worst, Math.abs(cur[k] - prev[k]));
    prev = cur;
  }
  assert.ok(worst < 0.01, 'largest step in 0.1 s: ' + worst);
});

test('audio noise: buffers are deterministic, bounded, loop without a jump, and not silent', () => {
  const a = whiteLoop(mulberry32(1), 20000);
  const b = whiteLoop(mulberry32(1), 20000);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, whiteLoop(mulberry32(2), 20000));
  for (const buf of [a, brownLoop(mulberry32(1), 20000), rainLoop(mulberry32(1), 8000, 1.5), ...cricketsLoop(mulberry32(1), 8000, 1.5)]) {
    let peak = 0;
    let energy = 0;
    for (const v of buf) {
      assert.ok(Number.isFinite(v));
      peak = Math.max(peak, Math.abs(v));
      energy += v * v;
    }
    assert.ok(peak <= 0.9001 && peak > 0.5, 'peak ' + peak);
    assert.ok(energy / buf.length > 1e-4, 'not silent');
  }
  // the brown noise is smooth at the loop point (a click would be a jump)
  const br = brownLoop(mulberry32(3), 48000);
  const jump = Math.abs(br[0] - br[br.length - 1]);
  const typical = br.reduce((s, v, i) => (i ? s + Math.abs(v - br[i - 1]) : s), 0) / br.length;
  assert.ok(jump < typical * 12 + 0.05, `loop jump ${jump} vs typical step ${typical}`);
});

test('audio engine: no context exists before start(); "without sound" never creates one; sfx before start is a no-op', () => {
  const r = rig();
  assert.equal(r.made.length, 0);
  assert.equal(r.engine.started, false);
  r.engine.sfx('cast');
  r.engine.setVolume('fx', 30);
  r.engine.setMuted(true);
  r.engine.hide();
  r.engine.show();
  r.engine.setLevels({ water: 1 });
  r.engine.tick();
  assert.equal(r.made.length, 0, 'still no context after every call except start()');
  assert.deepEqual(r.engine.stats().voices, []);
  assert.equal(r.engine.stats().state, 'none');
  assert.equal(r.ticking(), false);
});

test('audio engine: start() makes one context and the master chain; the master rises over 4 s from 0; resume is requested', () => {
  const r = rig({ analyser: true });
  assert.equal(r.engine.start(), true);
  assert.equal(r.engine.start(), true);
  assert.equal(r.made.length, 1, 'one context only');
  const c = r.made[0];
  assert.equal(c.state, 'running', 'resume() was called');
  const s = r.engine.stats();
  assert.equal(s.nodes, 6, 'master + compressor + analyser + 3 buses = 6: ' + s.nodes);
  assert.ok(r.ticking());
  const master = c.nodes.find((n) => n.kind === 'gain');
  assert.deepEqual(master.gain.events.slice(0, 2), [['set', 0, 0], ['lin', 1, audioData.masterFadeInS]]);
  const comp = c.nodes.find((n) => n.kind === 'comp');
  assert.equal(comp.threshold.value, -18);
  assert.equal(comp.ratio.value, 4);
  assert.ok(master.connections.includes(comp) && comp.connections.includes(c.destination));
  assert.ok(c.nodes.filter((n) => n.kind === 'gain' && n.connections.includes(master)).length === 3, 'three buses into the master');
  assert.equal(r.engine.analyser().kind, 'analyser');
});

test('audio engine: voices follow the levels, die when silent, and a context with state != running does nothing', () => {
  const r = rig();
  r.engine.start();
  const c = r.made[0];
  r.engine.setLevels({ water: 0.7, wind: 0.5, rain: 0, crickets: 0 });
  r.run(1);
  assert.deepEqual(r.engine.stats().voices.sort(), ['water', 'wind']);
  const nodes1 = r.engine.stats().nodes;
  r.engine.setLevels({ rain: 1, crickets: 1 });
  r.run(1);
  assert.deepEqual(r.engine.stats().voices.sort(), ['crickets', 'rain', 'water', 'wind']);
  // every voice is looping buffer + filter + gain (crickets: buffer + gain)
  assert.equal(r.engine.stats().nodes, nodes1 + 3 + 2);
  const looping = c.nodes.filter((n) => n.kind === 'source' && !n.disconnected);
  assert.ok(looping.length === 4 && looping.every((n) => n.loop && n.buffer));
  // rain stops: faded first (target 0), freed only after 2 s of silence PLUS the fade
  r.engine.setLevels({ rain: 0 });
  r.run(3);
  assert.ok(r.engine.stats().voices.includes('rain'), 'still there while it fades out');
  r.run(8);
  assert.ok(!r.engine.stats().voices.includes('rain'), 'stopped after 2 s at 0 (plus its fade)');
  assert.equal(r.engine.stats().nodes, nodes1 + 2, 'its nodes are gone (crickets still there)');
  // a suspended context does not advance the scheduler
  c.state = 'suspended';
  const before = JSON.stringify(r.engine.stats());
  r.engine.setLevels({ rain: 1 });
  r.run(3);
  assert.equal(JSON.stringify(r.engine.stats()), before);
});

test('audio engine: every change of level or volume is smooth (time constant > 0.2 s), never a jump', () => {
  const r = rig();
  r.engine.start();
  const c = r.made[0];
  r.engine.setLevels({ water: 0.8, wind: 0.3, birds: 1, music: 1, scale: 'day' });
  r.run(20);
  r.engine.setVolume('ambience', 10);
  r.engine.setVolume('fx', 100);
  r.engine.setVolume('music', 0);
  const gains = c.nodes.filter((n) => n.kind === 'gain');
  // persistent gains = buses and the gain behind each looping voice (the short envelopes of birds and notes are their own business)
  const voiceGains = c.nodes.filter((n) => n.kind === 'source' && n.loop).map((n) => n.connections[0].connections[0]);
  const bus = gains.filter((n) => n.connections.some((x) => x.kind === 'gain' && x === gains[0]));
  assert.equal(voiceGains.length, 2);
  assert.equal(bus.length, 3);
  for (const g of [...voiceGains, ...bus]) {
    for (const e of g.gain.events) {
      if (e[0] === 'target') assert.ok(e[3] >= 0.2, 'time constant ' + e[3]);
      assert.ok(e[0] !== 'set' || e[1] === 0 || e[1] <= 1.0001);
    }
  }
  // volume sliders: bus targets = square of the slider x its fixed trim, at volumeTcS
  const busTargets = gains.filter((n) => n.gain.events.some((e) => e[0] === 'target' && e[3] === audioData.volumeTcS)).map((n) => n.gain.events.filter((e) => e[0] === 'target').pop()[1]);
  const want = [volumeGain(10) * audioData.trim.ambience, volumeGain(100) * audioData.trim.fx, 0];
  for (const w of want) assert.ok(busTargets.some((t) => Math.abs(t - w) < 1e-9), `bus target ${w} in ${busTargets}`);
  assert.equal(r.engine.stats().volumes.fx, 100);
});

test('audio engine: at most 24 nodes alive, always: 10 minutes of the real mix (a whole day with weather changes, effects spammed) and the impossible worst case', () => {
  const r = rig({ seed: 11, analyser: true });
  r.engine.start();
  const c = r.made[0];
  const rng = mulberry32(5);
  const sfx = ['cast', 'splash', 'bite', 'bite-soft', 'catch', 'reel', 'click'];
  const weathers = ['clear', 'cloudy', 'rain', 'mist'];
  let worst = 0;
  let steps = 0;
  r.run(600, (ctx) => {
    steps++;
    if (steps % 7 === 0) r.engine.sfx(sfx[Math.floor(rng() * sfx.length)]);
    if (steps % 5 === 0) r.engine.setLevels(audioLevels(look(((steps / 10) / 480) % 1, weathers[Math.floor(steps / 10 / 90) % 4])));
    const alive = ctx.live().length;
    worst = Math.max(worst, alive);
    assert.ok(alive <= 24, `${alive} nodes alive at t=${ctx.currentTime.toFixed(1)}`);
    assert.equal(r.engine.stats().nodes, alive, 'the engine counts what really lives');
  });
  const s = r.engine.stats();
  assert.ok(s.peakNodes <= 24 && worst <= 24, JSON.stringify({ peak: s.peakNodes, worst }));
  assert.ok(s.counts.sfx > 50 && s.counts.notes > 5 && s.counts.chirps > 5, JSON.stringify(s.counts));
  assert.ok(s.sources <= 24 && s.peakSources <= 24);
  // the worst case no weather can produce: every voice at full level at once. The cap still holds; effects are never starved.
  r.engine.setLevels({ water: 1, wind: 1, birds: 1, crickets: 1, rain: 1, music: 1 });
  const sfxBefore = r.engine.stats().counts.sfx;
  let played = 0;
  r.run(120, (ctx) => {
    if (Math.round(ctx.currentTime * 10) % 11 === 0) {
      const n = ctx.live().length;
      r.engine.sfx('bite');
      if (ctx.live().length > n) played++;
    }
    assert.ok(ctx.live().length <= 24);
  });
  assert.ok(r.engine.stats().peakNodes <= 24);
  assert.ok(played > 5, 'effects still sound while the ambience is full: ' + played);
  assert.ok(r.engine.stats().counts.sfx > sfxBefore);
  // nothing leaks: after all levels drop to 0 and everything ends, only the master chain stays (+ the echo of the music)
  r.engine.setLevels({ water: 0, wind: 0, birds: 0, crickets: 0, rain: 0, music: 0 });
  r.run(40);
  assert.equal(r.engine.stats().nodes, c.live().length);
  assert.ok(r.engine.stats().nodes <= 6 + 2, 'only the chain (+ the echo of the music): ' + r.engine.stats().nodes);
});

test('audio engine: the music plays in every real mix (also in heavy rain) with notes from the scale of the moment', () => {
  for (const [f, w, scale] of [[MID.night, 'clear', 'night'], [MID.day, 'clear', 'day'], [MID.night, 'rain', 'rain'], [MID.dusk, 'mist', 'rain']]) {
    const r = rig({ seed: 3, analyser: true });
    r.engine.start();
    const c = r.made[0];
    r.engine.setLevels(audioLevels(look(f, w)));
    const hz = new Set();
    r.run(300, () => {
      for (const n of c.nodes) if (n.kind === 'osc' && n.started) hz.add(n.frequency.events[0][1]);
      assert.ok(c.live().length <= audioData.budget.maxNodes);
    });
    const notes = [...hz].filter((x) => x < 1000); // below 1 kHz: music (the birds sing higher, the chime sits at 1.3 kHz and up)
    assert.ok(r.engine.stats().counts.notes >= 5, `${w} ${f}: ${r.engine.stats().counts.notes} notes`);
    for (const x of notes) assert.ok(audioData.music.scales[scale].includes(x), `${x} Hz is in the ${scale} scale (${w})`);
  }
});

test('audio engine: mute falls in 0.3 s then suspends; muted = no effects, no new nodes; unmute resumes and rises; hidden tab suspends', () => {
  const r = rig();
  r.engine.start();
  const c = r.made[0];
  r.engine.setLevels({ water: 1 });
  r.run(2);
  const master = c.nodes.find((n) => n.kind === 'gain');
  r.engine.setMuted(true);
  const last = master.gain.events[master.gain.events.length - 1];
  assert.equal(last[0], 'target');
  assert.equal(last[1], 0);
  assert.ok(last[3] > 0 && last[3] * 4 <= audioData.muteFadeS + 1e-9, 'a fall, not a cut');
  assert.equal(r.afters.length, 1);
  assert.ok(r.afters[0].ms >= audioData.muteFadeS * 1000, 'suspend only after the fall');
  assert.equal(c.state, 'running', 'not suspended yet');
  r.afters[0].f();
  assert.equal(c.state, 'suspended');
  const nodes = r.engine.stats().nodes;
  r.engine.sfx('catch');
  assert.equal(r.engine.stats().nodes, nodes, 'no sound while muted');
  r.engine.setMuted(false);
  assert.equal(c.state, 'running');
  assert.equal(master.gain.events[master.gain.events.length - 1][1], 1);
  r.engine.sfx('click');
  assert.ok(r.engine.stats().nodes > nodes, 'effects play again');
  // hidden tab
  r.engine.hide();
  assert.equal(c.state, 'suspended');
  r.engine.show();
  assert.equal(c.state, 'running');
  // hidden while muted: coming back does not wake the sound
  r.engine.setMuted(true);
  r.afters[r.afters.length - 1].f();
  r.engine.hide();
  r.engine.show();
  assert.equal(c.state, 'suspended');
});

test('audio engine: unavailable Web Audio never throws and never starts; started muted stays silent', () => {
  const none = createAudioEngine({ makeContext: () => null, rng: mulberry32(1), timers: { set: () => 1, clear() {}, after() {} } });
  assert.equal(none.start(), false);
  assert.equal(none.unavailable, true);
  none.sfx('cast');
  none.setMuted(false);
  const throws = createAudioEngine({ makeContext: () => { throw new Error('blocked'); }, rng: mulberry32(1), timers: { set: () => 1, clear() {}, after() {} } });
  assert.equal(throws.start(), false);
  const r = rig();
  r.engine.setMuted(true);
  r.engine.start();
  assert.equal(r.made[0].state, 'suspended', 'started muted: the context is suspended at once');
  assert.deepEqual(r.made[0].nodes.find((n) => n.kind === 'gain').gain.events, [['set', 0, 0]], 'master stays at 0, no rise');
});

test('audio engine: same seed = same sounds (kinds and frequencies in the same order)', () => {
  const sig = () => {
    const r = rig({ seed: 21 });
    r.engine.start();
    r.engine.setLevels({ water: 1, wind: 1, birds: 1, music: 1, scale: 'day' });
    r.run(40);
    r.engine.sfx('bite');
    return r.made[0].nodes.map((n) => n.kind + (n.kind === 'osc' ? n.frequency.events[0][1].toFixed(2) : '')).join(',');
  };
  assert.equal(sig(), sig());
});

test('audio hooks: count and log are the same with or without the engine, and are forwarded to it', () => {
  const calls = [];
  const a = createAudioHooks({ engine: { sfx: (n) => calls.push(n) } });
  const b = createAudioHooks();
  for (const h of [a, b]) {
    h.play('cast');
    h.play('bite');
  }
  assert.equal(a.count, 2);
  assert.deepEqual(a.log, b.log);
  assert.deepEqual(calls, ['cast', 'bite']);
});
