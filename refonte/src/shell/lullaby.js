// The lullaby in sound (J12-A): each couplet has a short original melody phrase (D major pentatonic, a few soft notes) played with Web Audio on the CONTEXT of the
// game's engine (src/audio/engine.js, read-only: `engine.context()`), no audio file. Rules kept here:
//   - nothing plays before the sound started, while muted (M, "Sans le son"), while the context is not running (a hidden tab suspends it);
//   - never louder than the existing effects (peak 0.05 x the trim 0.6 x the effects slider, against 0.11 x 0.6 for the catch jingle);
//   - its own node budget: at most MAX_NODES nodes alive at once (a voice = an oscillator + a gain; one shared output gain), notes made just in time, so that with the engine's own 24 the sum stays small;
//     a note that does not fit is skipped, never the effects. Nodes are disconnected when a note ends.
// The engine does not expose its master chain: the notes go to the context's output through their own gain (documented limit: no limiter shared with the engine).
// `volume()` returns the effects slider (0..100). Pure of the DOM: the context is injected (a fake one in the tests).

import { volumeGain } from '../../../src/core/audioMix.js';

export const NOTE_HZ = Object.freeze({ D4: 293.66, E4: 329.63, Fs4: 369.99, A4: 440.0, B4: 493.88, D5: 587.33, E5: 659.25 });
const STEP_S = 0.46; // time between two notes
const NOTE_S = 1.25; // how long a note rings
export const PEAK = 0.05;
export const TRIM = 0.6;
export const MAX_NODES = 12; // 6 voices x 2 nodes (the shared output gain is one more)

/** The phrase of each couplet: note names, in order. */
export const PHRASES = Object.freeze({
  1: ['D4', 'E4', 'Fs4', 'A4'],
  2: ['A4', 'Fs4', 'E4', 'Fs4', 'A4', 'B4'],
  3: ['B4', 'A4', 'Fs4', 'E4', 'D4'],
  4: ['D4', 'Fs4', 'A4', 'Fs4', 'D5', 'A4'],
  5: ['A4', 'B4', 'D5', 'B4', 'A4', 'Fs4', 'E4', 'D4'],
  6: ['D5', 'B4', 'A4', 'Fs4', 'E4'],
  7: ['E4', 'Fs4', 'A4', 'B4', 'A4', 'Fs4', 'D4'],
  8: ['Fs4', 'A4', 'B4', 'D5', 'B4', 'A4', 'Fs4', 'E4', 'D4'], // J12-B: the last couplet comes home to D
});

export function createLullaby({ engine, volume = () => 100, after = (f, ms) => setTimeout(f, ms) }) {
  let gen = 0; // cancel() bumps it: the notes of the old melody that are still waiting for their timer do not sound
  let out = null;
  let outCtx = null;
  let alive = 0;
  let peak = 0;
  const stats = { played: 0, skipped: 0 };
  const canPlay = () => {
    const c = engine && engine.context && engine.context();
    return !!(c && engine.started && !engine.muted && c.state === 'running');
  };
  function output(c) {
    if (out && outCtx === c) return out;
    out = c.createGain();
    out.gain.value = 1;
    out.connect(c.destination);
    outCtx = c;
    return out;
  }
  function note(c, hz, at, level) {
    if (alive + 2 > MAX_NODES) {
      stats.skipped++;
      return false;
    }
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = 'triangle';
    o.frequency.value = hz;
    const p = PEAK * TRIM * volumeGain(volume()) * level;
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(p, at + 0.04);
    g.gain.setTargetAtTime(0, at + 0.08, NOTE_S / 5);
    o.connect(g);
    g.connect(output(c));
    alive += 2;
    peak = Math.max(peak, alive);
    o.onended = () => {
      alive = Math.max(0, alive - 2);
      try {
        o.disconnect();
        g.disconnect();
      } catch {
        /* already gone */
      }
    };
    o.start(at);
    o.stop(at + NOTE_S * 1.2);
    return true;
  }
  /** Plays the phrase of couplet n (level 1 = the story sting; 0.6 = the soft repetition at the pier). Returns true when at least a note was scheduled. */
  function play(n, level = 1, delayS = 0, scale = 1) {
    const ph = PHRASES[n];
    if (!ph || !canPlay()) return false;
    // the notes are made just in time (a timer per note), so the budget counts the notes that sound, not the whole phrase
    const my = gen;
    const start = (i) => {
      if (!canPlay() || my !== gen) return;
      const c = engine.context();
      note(c, NOTE_HZ[ph[i]], c.currentTime + 0.03, level);
    };
    ph.forEach((name, i) => {
      const ms = Math.round((delayS + i * STEP_S * scale) * 1000);
      if (ms <= 0) start(i);
      else after(() => start(i), ms);
    });
    stats.played++;
    return true;
  }
  return {
    play,
    /** The cabin's window seat: every couplet found so far, one after the other (the phrases do not overlap). */
    playAll(couplets, level = 1, scale = 1) {
      let t = 0;
      let any = false;
      for (const n of couplets) {
        if (play(n, level, t, scale)) any = true;
        t += (PHRASES[n] ? PHRASES[n].length : 0) * STEP_S * scale + 0.9 * scale;
      }
      return any;
    },
    /** The finale: the eight phrases as ONE slow tune (scale > 1 = slower). Returns the length in seconds (0 when nothing can sound). */
    playTune(couplets, level = 0.9, scale = 1.7) {
      if (!this.playAll(couplets, level, scale)) return 0;
      return couplets.reduce((t, n) => t + (PHRASES[n] ? PHRASES[n].length : 0) * STEP_S * scale + 0.9 * scale, 0) + NOTE_S;
    },
    /** Stops the melody that is waiting for its notes (the notes already sounding fade by themselves). */
    cancel() {
      gen++;
    },
    canPlay,
    /** Seconds the whole thing takes (for the tests). */
    durationOf: (n) => (PHRASES[n] ? PHRASES[n].length * STEP_S + NOTE_S : 0),
    stats: () => ({ ...stats, alive, peakNodes: peak }),
  };
}
