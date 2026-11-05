// Lofi bar generator (J6 part C). Pure: seeded random function in, notes out. No audio, no clock, no DOM.
// `nextBar(scale)` returns the next bar of an endless, slowly varying loop: a chord progression picked by the look of the sky (the scale
// names are those of the soft music: dawn, day, dusk, night, rain), played as rolled electric-piano chords + a sub bass on the roots +
// sparse melody notes + soft drums + vinyl clicks. Timing and velocity are humanised with the seeded function, within bounds.
// Everything is read from data/lofi.js ; the sound itself is made by audio/lofiRender.js.

import lofiData from '../data/lofi.js';

export const NOTE_NAMES = Object.freeze(['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const mod12 = (n) => ((n % 12) + 12) % 12;

/** Pitch classes (0..11) allowed in a progression: tonic + mode. */
export function keyPitchClasses(prog) {
  return new Set(prog.mode.map((s) => mod12(prog.tonic + s)));
}

/** MIDI note with pitch class `pc` nearest to `target`, kept inside [lo, hi] (octave moved when needed). */
function nearest(pc, target, lo, hi) {
  target = Math.round(target);
  let m = target - mod12(target - pc);
  if (target - m > 6) m += 12;
  while (m < lo) m += 12;
  while (m > hi) m -= 12;
  return m;
}

/** Seconds of a step of the bar, with swing: the second half of each beat ("and", and the sixteenth after it) is delayed. */
export function stepTime(step, barS, swing) {
  const stepS = barS / 16;
  return step * stepS + (step % 4 >= 2 ? swing * 2 * stepS : 0);
}

/** Largest number of notes sounding at once among `list` (each {t, end}) plus `carry` end times (notes started in earlier bars). */
function concurrency(list, carry, from, to) {
  const marks = [from];
  for (const n of list) if (n.t > from && n.t < to) marks.push(n.t);
  let worst = 0;
  for (const m of marks) {
    let c = 0;
    for (const e of carry) if (e > m) c++;
    for (const n of list) if (n.t <= m && n.end > m) c++;
    worst = Math.max(worst, c);
  }
  return worst;
}

/**
 * @param {{rng:()=>number, data?:object, startS?:number}} o   rng: a dedicated seeded function (never shared with the rest of the game)
 */
export function createComposer({ rng, data = lofiData, startS = 0 }) {
  let barIndex = 0;
  let timeS = startS;
  let run = null; // { prog, pass, bpm, kick, snare, hat, comp, chordIdx }
  let prevVoicing = null;
  let prevMel = null;
  let carry = []; // absolute end times of the notes still ringing from earlier bars
  const between = (r) => r[0] + rng() * (r[1] - r[0]);
  const pick = (list) => list[Math.floor(rng() * list.length)];
  const jitter = () => 1 + (rng() * 2 - 1) * data.velJitter;
  const human = () => ((rng() * 2 - 1) * data.humanizeMs) / 1000;

  function pickProgression(mood, avoidId) {
    let entries = Object.entries(mood.progs);
    if (entries.length > 1) entries = entries.filter(([id]) => id !== avoidId);
    let total = 0;
    for (const [, w] of entries) total += w;
    let r = rng() * total;
    for (const [id, w] of entries) {
      r -= w;
      if (r < 0) return data.progressions.find((p) => p.id === id);
    }
    return data.progressions.find((p) => p.id === entries[entries.length - 1][0]);
  }

  function voiceChord(rootPc, quality, prev) {
    const [lo, hi] = data.keysRange;
    const iv = data.qualities[quality].voice;
    const n = iv.length;
    const out = iv.map((semi, k) => {
      const pc = mod12(rootPc + semi);
      const target = prev && prev[k] !== undefined ? prev[k] : lo + ((hi - lo) * (k + 0.5)) / n;
      return nearest(pc, target, lo, hi);
    });
    out.sort((a, b) => a - b);
    for (let i = 1; i < out.length; i++) if (out[i] <= out[i - 1]) out[i] = out[i - 1] + 12 <= hi ? out[i - 1] + 12 : out[i - 1] + 1; // two voices on one note: move one up
    return out;
  }

  function nextBar(scaleName) {
    const mood = data.moods[scaleName] || data.moods.dusk;
    // ---- which progression, tempo, patterns: decided at the start of a run, kept for its passes
    if (!run || run.chordIdx >= run.prog.chords.length) {
      if (run && run.pass + 1 < run.prog.runs) {
        run = { ...run, pass: run.pass + 1, chordIdx: 0 };
        if (rng() < 0.5) run.comp = pick(mood.comping); // slow variation between two passes of the same loop
      } else {
        const prog = pickProgression(mood, run ? run.prog.id : null);
        run = { prog, pass: 0, chordIdx: 0, bpm: Math.round(between(mood.bpm)), kick: pick(mood.kicks), snare: pick(mood.snares), hat: pick(mood.hats), comp: pick(mood.comping) };
      }
    }
    const { prog } = run;
    const swing = mood.swing;
    const barS = (60 / run.bpm) * data.beatsPerBar;
    const stepS = barS / 16;
    const lastBarOfRun = run.chordIdx === prog.chords.length - 1 && run.pass === prog.runs - 1;
    const [semi, quality] = prog.chords[run.chordIdx];
    const nextSemi = prog.chords[(run.chordIdx + 1) % prog.chords.length][0];
    const rootPc = mod12(prog.tonic + semi);
    const keyPcs = keyPitchClasses(prog);
    const events = [];
    const gridT = (step) => stepTime(step, barS, swing);
    const room = data.maxTailS;

    // ---- electric piano: the voiced chord, rolled, on the pattern of the run
    const voicing = voiceChord(rootPc, quality, prevVoicing);
    prevVoicing = voicing;
    const hits = data.comping[run.comp];
    hits.forEach(([step, held], hi) => {
      const play = hi === 0 || rng() < (run.pass > 0 ? 0.95 : 0.85);
      const base = (hi === 0 ? 1 : 0.75) * mood.keys * jitter();
      const g = gridT(step);
      const stepsToEnd = Math.min(held, 16 - step + 6);
      const dur = Math.max(0.25, Math.min(stepsToEnd * stepS, barS + room - data.releaseS - g - 0.05));
      const roll = [0, 1, 2, 3].map(() => rng());
      if (!play) return;
      voicing.forEach((midi, i) => {
        const strum = (i * data.strumMs * (0.6 + 0.4 * roll[i])) / 1000;
        const t = Math.max(0, g + human() * 0.5 + strum);
        const top = i === voicing.length - 1 ? 1.1 : 1;
        events.push({ type: 'key', midi, g, t, dur, vel: clamp(base * top * (0.85 + 0.15 * roll[i]), 0.05, 1) });
      });
    });

    // ---- bass: the root on the first beat, then a fifth or the root again, and sometimes the next root as a pick-up
    const bassLo = data.bassRange[0];
    const rootMidi = nearest(rootPc, (data.bassRange[0] + data.bassRange[1]) / 2, bassLo, data.bassRange[1]);
    const fifth = rootMidi + 7 <= data.bassRange[1] + 3 ? rootMidi + 7 : rootMidi - 5;
    const bassNotes = [[0, rootMidi, 7, 1]];
    if (rng() < 0.7) bassNotes.push([rng() < 0.5 ? 9 : 10, rng() < 0.6 ? fifth : rootMidi, 4, 0.8]);
    if (rng() < 0.3) bassNotes.push([14, nearest(mod12(prog.tonic + nextSemi), rootMidi, bassLo, data.bassRange[1] + 3), 2, 0.7]);
    bassNotes.forEach(([step, midi, held, v], i) => {
      const g = gridT(step);
      const next = bassNotes[i + 1];
      const stop = next ? gridT(next[0]) - 0.02 : barS - 0.02;
      events.push({ type: 'bass', midi, g, t: Math.max(0, g + human()), dur: Math.max(0.15, Math.min(held * stepS, stop - g)), vel: clamp(v * jitter() * 0.95, 0.05, 1) });
    });

    // ---- melody: a few soft notes, mostly chord tones, moving by small steps (never a copied tune: random walk on the scale of the key)
    const pcsOfChord = new Set(voicing.map((m) => mod12(m)));
    pcsOfChord.add(rootPc);
    const [mLo, mHi] = data.melodyRange;
    const pool = (chordOnly) => {
      const out = [];
      for (let m = mLo; m <= mHi; m++) if (chordOnly ? pcsOfChord.has(mod12(m)) : keyPcs.has(mod12(m))) out.push(m);
      return out;
    };
    let placed = 0;
    const p = mood.melody * (run.pass > 0 ? 1 : 0.6);
    for (const step of [2, 6, 8, 11, 14]) {
      const draw = rng();
      const chordOnly = rng() < 0.7;
      const r3 = rng();
      const r4 = rng();
      const r5 = rng();
      if (placed >= 3 || draw >= p / (1 + placed)) continue;
      const cands = pool(chordOnly).sort((a, b) => Math.abs(a - (prevMel ?? 76)) - Math.abs(b - (prevMel ?? 76)) || a - b);
      const midi = cands[Math.min(cands.length - 1, Math.floor(r3 * 3))];
      prevMel = midi;
      placed++;
      const g = gridT(step);
      events.push({ type: 'mel', midi, g, t: Math.max(0, g + human()), dur: Math.min((3 + Math.floor(r4 * 3)) * stepS, barS + room - data.releaseS - g - 0.05), vel: clamp(0.45 + 0.25 * r5, 0.05, 1) });
    }

    // ---- drums: a bar may have none (the "drop"), the first bar of the stream never has any
    const intro = barIndex === 0;
    const drop = rng() < mood.dropBar;
    const kickOn = !intro && !drop && rng() < mood.kickP;
    const snareOn = !intro && !drop && rng() < mood.snareP;
    const hatOn = !intro && !(drop && rng() < 0.5) && rng() < mood.hatP;
    const drum = (type, list) => {
      for (const [step, v] of list) {
        const g = gridT(step);
        events.push({ type, g, t: Math.max(0, g + human()), dur: 0, vel: clamp(v * mood.vel * jitter(), 0.03, 1) });
      }
    };
    if (kickOn) drum('kick', data.kicks[run.kick]);
    if (snareOn) drum('snare', data.snares[run.snare]);
    if (hatOn) drum('hat', data.hats[run.hat]);
    if (snareOn && lastBarOfRun) for (const step of [13, 14, 15]) if (rng() < 0.5) drum('snare', [[step, 0.22]]);

    // ---- vinyl crackle: sparse clicks (a Poisson-like draw), more in the rain
    const nClicks = Math.floor(mood.crackle * (barS / 3.2) + rng());
    for (let i = 0; i < nClicks; i++) {
      const t = rng() * barS;
      events.push({ type: 'click', g: t, t, dur: 0, vel: 0.2 + 0.8 * rng() * rng() });
    }

    // ---- polyphony: the bass and the electric piano come first, melody notes only where there is room
    const PRIO = { bass: 0, key: 1, mel: 2 };
    const absStart = timeS;
    carry = carry.filter((e) => e > absStart);
    const kept = [];
    const tonal = events.filter((e) => e.type in PRIO).sort((a, b) => PRIO[a.type] - PRIO[b.type] || a.t - b.t);
    const accepted = [];
    const carryRel = () => carry.map((e) => e - absStart);
    for (const e of tonal) {
      const cand = { t: e.t, end: e.t + e.dur + data.releaseS };
      if (concurrency([...accepted, cand], carryRel(), cand.t, cand.end) <= data.maxPolyphony) {
        accepted.push(cand);
        kept.push(e);
      }
    }
    const out = events.filter((e) => !(e.type in PRIO) || kept.includes(e)).sort((a, b) => a.t - b.t);
    // tail: how long the sound of this bar rings after its end
    const TAIL = { key: data.releaseS, bass: data.releaseS, mel: data.releaseS, kick: 0.4, snare: 0.3, hat: 0.15, click: 0.02 };
    let tailS = 0;
    for (const e of out) {
      const end = e.t + e.dur + TAIL[e.type];
      if (e.type in PRIO) carry.push(absStart + end);
      tailS = Math.max(tailS, end - barS);
    }
    tailS = clamp(tailS, 0, data.maxTailS);

    const bar = {
      index: barIndex,
      startS: timeS,
      barS,
      bpm: run.bpm,
      swing,
      scale: data.moods[scaleName] ? scaleName : 'dusk',
      progId: prog.id,
      chordIdx: run.chordIdx,
      pass: run.pass,
      chord: { name: NOTE_NAMES[rootPc] + quality, rootPc, quality, voicing: voicing.slice() },
      patterns: { kick: run.kick, snare: run.snare, hat: run.hat, comp: run.comp },
      bright: mood.bright,
      tailS,
      events: out,
    };
    barIndex++;
    timeS += barS;
    run = { ...run, chordIdx: run.chordIdx + 1 };
    return bar;
  }

  return { nextBar };
}
