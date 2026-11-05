// Lofi music, pure parts (J6 part C): the bar generator (core/lofi.js), its data, and the synth (audio/lofiRender.js) measured in Node.
import test from 'node:test';
import assert from 'node:assert/strict';
import lofiData from '../src/data/lofi.js';
import { createComposer, keyPitchClasses, stepTime } from '../src/core/lofi.js';
import { mulberry32 } from '../src/core/rng.js';
import { createBarRenderer, renderBar, levelStats } from '../src/audio/lofiRender.js';

const MOODS = ['dawn', 'day', 'dusk', 'night', 'rain'];
const progOf = (id) => lofiData.progressions.find((p) => p.id === id);
const mod12 = (n) => ((n % 12) + 12) % 12;

function bars(seed, count, scaleOf = () => 'dusk') {
  const c = createComposer({ rng: mulberry32(seed) });
  return Array.from({ length: count }, (_, i) => c.nextBar(scaleOf(i)));
}

test('lofi data: at least 4 progressions of 4 to 8 bars; every chord, voicing and bass note is in the key of its progression; every mood names known progressions and patterns', () => {
  assert.ok(lofiData.progressions.length >= 4);
  const ids = new Set();
  for (const p of lofiData.progressions) {
    assert.ok(!ids.has(p.id), 'unique id ' + p.id);
    ids.add(p.id);
    assert.ok(p.chords.length >= 4 && p.chords.length <= 8, p.id + ' length');
    assert.ok(p.runs >= 1);
    const pcs = keyPitchClasses(p);
    for (const [semi, q] of p.chords) {
      const quality = lofiData.qualities[q];
      assert.ok(quality, 'known quality ' + q);
      const root = mod12(p.tonic + semi);
      assert.ok(pcs.has(root), `${p.id}: root ${root} is in the key`);
      for (const iv of [...quality.voice, ...quality.bass]) assert.ok(pcs.has(mod12(root + iv)), `${p.id}: chord ${root}${q} tone +${iv} is in the key`);
    }
  }
  for (const m of MOODS) {
    const mood = lofiData.moods[m];
    for (const id of Object.keys(mood.progs)) assert.ok(progOf(id), m + ' -> ' + id);
    assert.ok(mood.bpm[0] >= 68 && mood.bpm[1] <= 82 && mood.bpm[0] <= mood.bpm[1], m + ' tempo 68..82');
    for (const k of mood.kicks) assert.ok(lofiData.kicks[k]);
    for (const k of mood.snares) assert.ok(lofiData.snares[k]);
    for (const k of mood.hats) assert.ok(lofiData.hats[k]);
    for (const k of mood.comping) assert.ok(lofiData.comping[k]);
  }
  assert.ok(lofiData.moods.night.bpm[1] <= lofiData.moods.day.bpm[0], 'night is slower than day');
});

test('lofi composer: the same seed gives the same bars, another seed gives other ones', () => {
  const a = bars(7, 40, (i) => MOODS[Math.floor(i / 4) % 5]);
  const b = bars(7, 40, (i) => MOODS[Math.floor(i / 4) % 5]);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, bars(8, 40, (i) => MOODS[Math.floor(i / 4) % 5]));
});

test('lofi composer: every note is in the key of its progression, in its register; velocities in 0..1; times inside the buffer', () => {
  for (const seed of [1, 2, 3, 4]) {
    for (const bar of bars(seed, 120, (i) => MOODS[(i * 7 + seed) % 5 === 0 ? 0 : Math.floor(i / 5) % 5])) {
      const pcs = keyPitchClasses(progOf(bar.progId));
      for (const e of bar.events) {
        assert.ok(e.vel > 0 && e.vel <= 1, 'velocity ' + e.vel);
        assert.ok(e.t >= 0 && e.t < bar.barS + 1e-9, `t ${e.t} in the bar ${bar.barS}`);
        assert.ok(e.dur >= 0 && e.t + e.dur <= bar.barS + lofiData.maxTailS + 1e-9);
        if (e.type === 'key' || e.type === 'bass' || e.type === 'mel') {
          assert.ok(pcs.has(mod12(e.midi)), `${bar.progId} ${bar.chord.name}: ${e.type} ${e.midi} is in the key`);
          const [lo, hi] = e.type === 'bass' ? [lofiData.bassRange[0], lofiData.bassRange[1] + 3] : e.type === 'mel' ? lofiData.melodyRange : [lofiData.keysRange[0], lofiData.keysRange[1] + 12];
          assert.ok(e.midi >= lo - 5 && e.midi <= hi, `${e.type} ${e.midi} register`);
        }
      }
      assert.ok(bar.chord.voicing.length === 4);
      assert.ok(bar.tailS >= 0 && bar.tailS <= lofiData.maxTailS);
    }
  }
});

test('lofi composer: the loop is exact: a run is its chords in order, a second pass repeats the chords, bars follow each other with no gap and no drift', () => {
  const list = bars(21, 60, () => 'day');
  let sum = 0;
  list.forEach((b, i) => {
    assert.equal(b.index, i);
    assert.ok(Math.abs(b.startS - sum) < 1e-9, `start of bar ${i}`);
    sum += b.barS;
    assert.ok(Math.abs(b.barS - (60 / b.bpm) * 4) < 1e-12);
  });
  // cut the stream in runs (a run starts at chordIdx 0, pass 0)
  const runs = [];
  for (const b of list) {
    if (b.chordIdx === 0 && b.pass === 0) runs.push([]);
    runs[runs.length - 1].push(b);
  }
  assert.ok(runs.length >= 2);
  for (const run of runs.slice(0, -1)) {
    const prog = progOf(run[0].progId);
    assert.equal(run.length, prog.chords.length * prog.runs, prog.id + ' lasts chords x runs bars');
    run.forEach((b, i) => {
      assert.equal(b.chordIdx, i % prog.chords.length);
      assert.equal(b.pass, Math.floor(i / prog.chords.length));
      assert.equal(b.progId, prog.id);
      assert.equal(b.bpm, run[0].bpm, 'the tempo is constant inside a run');
      assert.equal(b.chord.name, run[i % prog.chords.length].chord.name, 'the second pass plays the same chords');
    });
  }
  // the next run is another progression (the loop changes slowly, it never sticks)
  for (let i = 1; i < runs.length; i++) assert.notEqual(runs[i][0].progId, runs[i - 1][0].progId);
  assert.ok(new Set(list.map((b) => b.progId)).size >= 3, 'several progressions in 60 bars');
});

test('lofi composer: sky and weather change the music: tempo by phase, fewer drums at night, softer drums and more crackle in rain', () => {
  const stat = (scale) => {
    let drums = 0;
    let vel = 0;
    let n = 0;
    let clicks = 0;
    let barsN = 0;
    const bpms = new Set();
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      for (const b of bars(seed * 100, 48, () => scale)) {
        barsN++;
        bpms.add(b.bpm);
        for (const e of b.events) {
          if (e.type === 'kick' || e.type === 'snare' || e.type === 'hat') {
            drums++;
            if (e.type !== 'hat') {
              vel += e.vel; // kicks and snares only: the hat patterns have very different base levels
              n++;
            }
          } else if (e.type === 'click') clicks++;
        }
      }
    }
    return { drums: drums / barsN, vel: vel / n, clicks: clicks / barsN, minBpm: Math.min(...bpms), maxBpm: Math.max(...bpms) };
  };
  const S = Object.fromEntries(MOODS.map((m) => [m, stat(m)]));
  for (const m of MOODS) assert.ok(S[m].minBpm >= 68 && S[m].maxBpm <= 82, `${m} tempo ${S[m].minBpm}..${S[m].maxBpm}`);
  assert.ok(S.night.maxBpm < S.day.minBpm, 'night slower than day');
  assert.ok(S.night.drums < S.day.drums * 0.5, `night drums ${S.night.drums} vs day ${S.day.drums}`);
  assert.ok(S.rain.vel < S.day.vel * 0.85 && S.night.vel < S.day.vel * 0.8, 'softer drums: ' + JSON.stringify({ r: S.rain.vel, n: S.night.vel, d: S.day.vel }));
  assert.ok(S.rain.clicks > S.day.clicks * 2, `rain crackle ${S.rain.clicks} vs day ${S.day.clicks}`);
  // the first bar of a stream has no drums (the music comes in gently)
  assert.ok(bars(3, 1, () => 'day')[0].events.every((e) => !['kick', 'snare', 'hat'].includes(e.type)));
  // an unknown scale name falls back on dusk
  assert.equal(bars(3, 1, () => 'nonsense')[0].scale, 'dusk');
});

test('lofi composer: at most maxPolyphony notes sound at once (release tails of earlier bars included), over 300 bars and every mood', () => {
  const list = bars(9, 300, (i) => MOODS[Math.floor(i / 6) % 5]);
  const notes = [];
  for (const b of list) for (const e of b.events) if (e.type === 'key' || e.type === 'bass' || e.type === 'mel') notes.push({ s: b.startS + e.t, e: b.startS + e.t + e.dur + lofiData.releaseS });
  let worst = 0;
  for (const n of notes) {
    let c = 0;
    for (const m of notes) if (m.s <= n.s && m.e > n.s) c++;
    worst = Math.max(worst, c);
  }
  assert.ok(worst <= lofiData.maxPolyphony, 'worst ' + worst);
  assert.ok(worst >= 4, 'the chords are really there: ' + worst);
});

test('lofi composer: swing and humanise offsets are bounded and every hit sits on its swung grid position', () => {
  const swingCheck = stepTime(2, 3.2, 0.25) - 2 * (3.2 / 16);
  assert.ok(Math.abs(swingCheck - 0.25 * 2 * (3.2 / 16)) < 1e-12, 'the "and" is late by swing x 2 steps');
  assert.equal(stepTime(0, 3.2, 0.3), 0);
  assert.equal(stepTime(1, 3.2, 0.3), 3.2 / 16);
  assert.ok(Math.abs(stepTime(3, 3.2, 0.3) - (3 * 0.2 + 0.3 * 0.4)) < 1e-12);
  let maxOff = 0;
  let maxKeyOff = 0;
  for (const b of bars(5, 160, (i) => MOODS[i % 5])) {
    for (const e of b.events) {
      if (e.type === 'click') continue;
      const off = Math.abs(e.t - e.g);
      if (e.type === 'key') maxKeyOff = Math.max(maxKeyOff, off);
      else maxOff = Math.max(maxOff, off);
    }
  }
  assert.ok(maxOff <= lofiData.humanizeMs / 1000 + 1e-9, 'humanise ' + maxOff);
  assert.ok(maxKeyOff <= (lofiData.humanizeMs * 0.5 + 3 * lofiData.strumMs) / 1000 + 1e-9, 'roll ' + maxKeyOff);
  assert.ok(maxOff > 0.003, 'there is a human feel (some offset is used): ' + maxOff);
});

// ---------------------------------------------------------------------------------------------------- the synth
const goertzel = (a, sr, hz) => {
  const w = (2 * Math.PI * hz) / sr;
  const c = 2 * Math.cos(w);
  let s1 = 0;
  let s2 = 0;
  for (let i = 0; i < a.length; i++) {
    const s = a[i] + c * s1 - s2;
    s2 = s1;
    s1 = s;
  }
  return Math.sqrt(s1 * s1 + s2 * s2 - c * s1 * s2) / a.length;
};

test('lofi synth: deterministic, finite, under the ceiling, not silent, no DC, ends at zero; the same buffer by pieces or at once', () => {
  const bar = bars(12, 5, () => 'day')[4];
  const a = renderBar(bar, { seed: 3 });
  const b = renderBar(bar, { seed: 3 });
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, renderBar(bar, { seed: 4 }), 'the noise differs with the seed');
  const st = levelStats(a);
  for (const v of a) assert.ok(Number.isFinite(v));
  assert.ok(st.peak <= lofiData.stemGain + 1e-6 && st.peak > 0.15, 'peak ' + st.peak);
  assert.ok(st.rms > 0.03 && st.rms < 0.3, 'rms ' + st.rms);
  assert.ok(Math.abs(st.dc) < 0.003, 'dc ' + st.dc);
  assert.equal(a[a.length - 1], 0);
  assert.ok(Math.abs(a[0]) < 1e-3);
  // by pieces (one job at a time) the result is the same
  const r = createBarRenderer(bar, { seed: 3 });
  let steps = 0;
  while (!r.step(0, () => 0)) steps++;
  assert.ok(steps > 10, 'cut in many pieces: ' + steps);
  assert.deepEqual(r.result, a);
  assert.equal(r.length, a.length);
  assert.equal(r.sampleRate, lofiData.renderRateHz);
});

test('lofi synth: a note sounds at its pitch (A4 = 440 Hz is 20 dB above a wrong pitch), the bass is low, the energy is mostly under 5 kHz', () => {
  const mk = (events) => ({ index: 0, startS: 100, barS: 2, tailS: 0.5, bright: 2600, events });
  const sr = lofiData.renderRateHz;
  const key = renderBar(mk([{ type: 'key', midi: 69, g: 0, t: 0, dur: 1.2, vel: 0.8 }]));
  assert.ok(goertzel(key, sr, 440) > 10 * goertzel(key, sr, 523), 'A4 is at 440 Hz, not at C5');
  assert.ok(goertzel(key, sr, 440) > 10 * goertzel(key, sr, 600));
  const bass = renderBar(mk([{ type: 'bass', midi: 40, g: 0, t: 0, dur: 1.2, vel: 1 }]));
  assert.ok(goertzel(bass, sr, 82.4) > 10 * goertzel(bass, sr, 150), 'E2 = 82.4 Hz');
  // a full bar: little energy above 5 kHz (plain DFT on the whole bar, bins of 5 Hz are not needed: Goertzel bands)
  const bar = bars(2, 3, () => 'day')[2];
  const a = renderBar(bar);
  let low = 0;
  let high = 0;
  for (let hz = 60; hz < 10800; hz += 90) {
    const e = goertzel(a, sr, hz) ** 2;
    if (hz < 5000) low += e;
    else high += e;
  }
  assert.ok(high < low * 0.02, `above 5 kHz ${(high / (low + high)) * 100}% of the energy`);
});

test('lofi synth: bars laid end to end (each starts at the end of the previous bar, tails mixed in) have no click at the boundaries', () => {
  const list = bars(31, 8, () => 'dusk');
  const sr = lofiData.renderRateHz;
  const total = Math.ceil(list.reduce((s, b) => s + b.barS, 0) * sr) + sr * 3;
  const mix = new Float32Array(total);
  const bounds = [];
  for (const b of list) {
    const a = renderBar(b, { seed: 5 });
    const o = Math.round(b.startS * sr);
    bounds.push(o);
    for (let i = 0; i < a.length && o + i < total; i++) mix[o + i] += a[i];
  }
  let worstAll = 0;
  for (let i = 1; i < total; i++) worstAll = Math.max(worstAll, Math.abs(mix[i] - mix[i - 1]));
  let worstB = 0;
  for (const o of bounds.slice(1)) for (let i = o - 3; i <= o + 3; i++) worstB = Math.max(worstB, Math.abs(mix[i] - mix[i - 1]));
  assert.ok(worstAll < 0.25, 'largest step anywhere ' + worstAll);
  assert.ok(worstB < 0.12, 'largest step at a boundary ' + worstB);
  // the mix never goes over the stem ceiling by more than the overlap of two tails (the master chain is measured in the browser)
  assert.ok(levelStats(mix).peak < 0.95);
});
