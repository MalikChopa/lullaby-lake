// Lofi synth (J6 part C): turns one bar of notes (core/lofi.js) into a mono Float32Array. Everything is made by code: no sample, no file.
// Pure (no Web Audio, no clock): the same bar and seed always give the same numbers, so the sound can be measured in Node.
//   electric piano  = 2 detuned sines + a decaying 2nd harmonic + a short "tine" partial, slow tremolo, two one-pole low-passes
//   bass            = sine + a little 2nd harmonic (so that small speakers still show it)
//   kick            = sine falling from ~136 to 46 Hz ;  snare = dusty noise + a short body ;  hat = high-passed noise
//   vinyl crackle   = very short decaying noise ticks ;  tape = a global, very slow pitch drift applied to the pitched voices
//   finish          = soft saturation (tanh: warmth and a hard ceiling), 1 ms fade-in and 3 ms fade-out at the ends of the buffer
// The work is cut into one job per note, so the caller can spread a bar over several scheduler ticks (`step(maxMs, clock)`).

import lofiData from '../data/lofi.js';
import { mulberry32, hashSeed } from '../core/rng.js';

const TAU = Math.PI * 2;
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const ratioOfCents = (c) => Math.pow(2, c / 1200) - 1;

/**
 * @param {object} bar from core/lofi.js
 * @param {{sr?:number, data?:object, seed?:number}} [o]
 */
export function createBarRenderer(bar, { sr = lofiData.renderRateHz, data = lofiData, seed = 1 } = {}) {
  const n = Math.ceil((bar.barS + bar.tailS) * sr) + 2;
  const out = new Float32Array(n);
  const noise = mulberry32(hashSeed(seed, 'lofi-bar-' + bar.index));
  const white = () => noise() * 2 - 1;
  let tau = null; // tape-warped time of every sample (seconds, global: continuous from one bar to the next)
  let trem = null;
  const dt = 1 / sr;

  function prepare() {
    tau = new Float64Array(n);
    trem = new Float32Array(n);
    const { wowHz, wowCents, flutterHz, flutterCents } = data.tape;
    const a1 = ratioOfCents(wowCents) / (TAU * wowHz);
    const a2 = ratioOfCents(flutterCents) / (TAU * flutterHz);
    for (let i = 0; i < n; i++) {
      const T = bar.startS + i * dt;
      tau[i] = T + a1 * Math.sin(TAU * wowHz * T) + a2 * Math.sin(TAU * flutterHz * T);
      trem[i] = 1 + data.tremolo.depth * Math.sin(TAU * data.tremolo.hz * T);
    }
  }

  const levels = { key: 0.2, mel: 0.16, bass: 0.34, kick: 0.5, snare: 0.22, hat: 0.1, click: data.crackleLevel };

  function electricPiano(ev, isMel) {
    const f = mtof(ev.midi);
    const i0 = Math.floor(ev.t * sr);
    const len = Math.min(n - i0, Math.floor((ev.dur + data.releaseS) * sr));
    const tauD = Math.min(2.2, Math.max(0.7, 2.2 - 0.02 * (ev.midi - 48)));
    const dD = Math.exp(-dt / tauD);
    const dH = Math.exp(-dt / 0.5);
    const dB = Math.exp(-dt / 0.05);
    const dR = Math.exp(-dt / (data.releaseS / 4.5));
    const cutoff = (isMel ? 0.8 : 1) * bar.bright * (0.6 + 0.6 * ev.vel);
    const alpha = 1 - Math.exp((-TAU * cutoff) / sr);
    const amp = ev.vel * (isMel ? levels.mel : levels.key);
    const h2 = 0.28 + 0.35 * ev.vel;
    const offAt = Math.floor(ev.dur * sr);
    const attackN = Math.floor(0.004 * sr);
    let eD = 1;
    let eH = 1;
    let eB = 1;
    let eR = 1;
    let l1 = 0;
    let l2 = 0;
    for (let j = 0; j < len; j++) {
      const i = i0 + j;
      const ph = TAU * f * tau[i];
      const y = (0.6 * Math.sin(ph) + 0.4 * Math.sin(ph * 1.0023 + 0.9) + h2 * eH * Math.sin(2 * ph + 0.4) + 0.1 * eB * Math.sin(ph * 7.1)) * eD * eR * (j < attackN ? j / attackN : 1) * trem[i];
      l1 += alpha * (y - l1);
      l2 += alpha * (l1 - l2);
      out[i] += amp * l2;
      eD *= dD;
      eH *= dH;
      eB *= dB;
      if (j >= offAt) eR *= dR;
    }
  }

  function bass(ev) {
    const f = mtof(ev.midi);
    const i0 = Math.floor(ev.t * sr);
    const rel = 0.07;
    const len = Math.min(n - i0, Math.floor((ev.dur + rel * 5) * sr));
    const dD = Math.exp(-dt / 1.1);
    const dR = Math.exp(-dt / rel);
    const offAt = Math.floor(ev.dur * sr);
    const attackN = Math.floor(0.012 * sr);
    let eD = 1;
    let eR = 1;
    for (let j = 0; j < len; j++) {
      const i = i0 + j;
      const ph = TAU * f * tau[i];
      out[i] += ev.vel * levels.bass * (Math.sin(ph) + 0.28 * Math.sin(2 * ph)) * eD * eR * (j < attackN ? j / attackN : 1);
      eD *= dD;
      if (j >= offAt) eR *= dR;
    }
  }

  function kick(ev) {
    const i0 = Math.floor(ev.t * sr);
    const len = Math.min(n - i0, Math.floor(0.4 * sr));
    const k = 0.028;
    for (let j = 0; j < len; j++) {
      const t = j * dt;
      const ph = TAU * (46 * t + 90 * k * (1 - Math.exp(-t / k)));
      out[i0 + j] += ev.vel * levels.kick * (Math.sin(ph) * Math.exp(-t / 0.12) + 0.12 * white() * Math.exp(-t / 0.002));
    }
  }

  function snare(ev) {
    const i0 = Math.floor(ev.t * sr);
    const len = Math.min(n - i0, Math.floor(0.3 * sr));
    let lp = 0;
    for (let j = 0; j < len; j++) {
      const t = j * dt;
      lp += 0.5 * (white() - lp); // dusty: the top is rolled off
      out[i0 + j] += ev.vel * levels.snare * (lp * Math.exp(-t / 0.075) * 1.6 + 0.5 * Math.sin(TAU * 185 * t) * Math.exp(-t / 0.045));
    }
  }

  function hat(ev) {
    const i0 = Math.floor(ev.t * sr);
    const len = Math.min(n - i0, Math.floor(0.14 * sr));
    let lp = 0;
    for (let j = 0; j < len; j++) {
      const t = j * dt;
      const x = white();
      lp += 0.35 * (x - lp);
      out[i0 + j] += ev.vel * levels.hat * (x - lp) * Math.exp(-t / 0.03) * Math.min(1, j / 8);
    }
  }

  function click(ev) {
    const i0 = Math.floor(ev.t * sr);
    const len = Math.min(n - i0, Math.floor(0.006 * sr));
    for (let j = 0; j < len; j++) out[i0 + j] += ev.vel * levels.click * white() * Math.exp(-(j * dt) / 0.0007);
  }

  function finish() {
    const k = data.drive;
    const g = data.stemGain;
    for (let i = 0; i < n; i++) out[i] = Math.tanh(out[i] * k) * g;
    const fi = Math.floor(0.001 * sr);
    const fo = Math.floor(0.003 * sr);
    for (let i = 0; i < fi; i++) out[i] *= i / fi;
    for (let i = 0; i < fo; i++) out[n - 1 - i] *= i / fo;
  }

  const jobs = [() => prepare()];
  for (const ev of bar.events) {
    if (ev.type === 'key') jobs.push(() => electricPiano(ev, false));
    else if (ev.type === 'mel') jobs.push(() => electricPiano(ev, true));
    else if (ev.type === 'bass') jobs.push(() => bass(ev));
    else if (ev.type === 'kick') jobs.push(() => kick(ev));
    else if (ev.type === 'snare') jobs.push(() => snare(ev));
    else if (ev.type === 'hat') jobs.push(() => hat(ev));
    else if (ev.type === 'click') jobs.push(() => click(ev));
  }
  jobs.push(finish);
  let next = 0;

  return {
    length: n,
    sampleRate: sr,
    get jobs() {
      return jobs.length;
    },
    get done() {
      return next >= jobs.length;
    },
    /** Runs jobs until `maxMs` of `clock()` (milliseconds) have passed (at least one job). Returns true when the bar is finished. */
    step(maxMs, clock) {
      const t0 = clock ? clock() : 0;
      do {
        if (next < jobs.length) jobs[next++]();
      } while (next < jobs.length && (!clock || clock() - t0 < maxMs));
      return next >= jobs.length;
    },
    /** The finished buffer (only valid when `done`). */
    get result() {
      return out;
    },
  };
}

/** The whole bar at once (tests, tools). */
export function renderBar(bar, o) {
  const r = createBarRenderer(bar, o);
  while (!r.step(1e9, null));
  return r.result;
}

/** Peak, RMS and DC offset (mean) of a buffer. */
export function levelStats(a) {
  let peak = 0;
  let s = 0;
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const v = a[i];
    peak = Math.max(peak, Math.abs(v));
    s += v * v;
    sum += v;
  }
  return { peak, rms: Math.sqrt(s / a.length), dc: sum / a.length };
}
