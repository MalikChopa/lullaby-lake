// Lofi music as DATA (J6 part C). Everything here is an original, short chord progression written for the game (no existing song, no
// recognisable melody) ; the generator (core/lofi.js) only reads these tables, the synth (audio/lofiRender.js) turns the notes into sound.
// Pitches are MIDI numbers (60 = middle C), times are seconds or steps of a 16-step bar (4 beats, a step = a sixteenth note).

/** Chord qualities: `voice` = the intervals the electric piano plays (3rd, 5th, 7th, extension: the root belongs to the bass). */
const qualities = {
  maj7: { voice: [4, 7, 11, 12], bass: [0, 7] }, // 12 = the root an octave higher
  maj9: { voice: [4, 7, 11, 14], bass: [0, 7] }, // 14 = the 9th
  m7: { voice: [3, 7, 10, 12], bass: [0, 7] },
  m9: { voice: [3, 7, 10, 14], bass: [0, 7] },
  dom9: { voice: [4, 7, 10, 14], bass: [0, 7] },
  dom13: { voice: [4, 10, 14, 21], bass: [0, 7] }, // 21 = the 13th
};

// Each chord is [semitones above the tonic, quality] ; `mode` = the scale the whole progression lives in (semitones above the tonic):
// every note the generator writes (chords, bass, melody) belongs to tonic + mode (tested).
const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];
const DORIAN = [0, 2, 3, 5, 7, 9, 10];

const progressions = [
  { id: 'rain-window', tonic: 0, mode: MAJOR, runs: 2, chords: [[2, 'm9'], [7, 'dom13'], [0, 'maj9'], [9, 'm9']] }, // C: ii V I vi
  { id: 'late-bus', tonic: 3, mode: MAJOR, runs: 2, chords: [[5, 'maj9'], [4, 'm7'], [2, 'm9'], [7, 'dom13']] }, // Eb: IV iii ii V
  { id: 'soft-morning', tonic: 7, mode: MAJOR, runs: 1, chords: [[0, 'maj9'], [5, 'maj9'], [4, 'm7'], [9, 'm9'], [2, 'm9'], [7, 'dom13'], [0, 'maj9'], [0, 'maj7']] }, // G, 8 bars
  { id: 'moonlit', tonic: 9, mode: MINOR, runs: 1, chords: [[0, 'm9'], [5, 'm9'], [10, 'dom9'], [3, 'maj9'], [8, 'maj9'], [5, 'm9'], [7, 'm7'], [0, 'm9']] }, // A minor, 8 bars
  { id: 'lantern', tonic: 10, mode: MAJOR, runs: 1, chords: [[0, 'maj9'], [9, 'm9'], [2, 'm9'], [7, 'dom13'], [0, 'maj9'], [5, 'maj9'], [2, 'm7'], [7, 'dom9']] }, // Bb, 8 bars
  { id: 'slow-tea', tonic: 2, mode: DORIAN, runs: 2, chords: [[0, 'm9'], [2, 'm7'], [3, 'maj7'], [5, 'dom9']] }, // D dorian
];

// Drum grids: [step 0..15, velocity 0..1]. Kick, snare and hat are chosen separately (by mood, then once per progression run).
const kicks = {
  boombap: [[0, 1], [7, 0.55], [10, 0.85]],
  lazy: [[0, 1], [9, 0.7]],
  bounce: [[0, 1], [3, 0.35], [8, 0.85], [11, 0.5]],
  heartbeat: [[0, 0.9]],
  rainy: [[0, 0.85], [10, 0.6]],
};
const snares = {
  backbeat: [[4, 1], [12, 1], [15, 0.18]],
  rim: [[4, 0.8], [12, 0.8]],
  ghost: [[4, 0.9], [7, 0.15], [12, 0.9], [14, 0.2]],
  softclap: [[12, 0.8]],
};
const hats = {
  eighths: [0, 2, 4, 6, 8, 10, 12, 14].map((s, i) => [s, i % 2 ? 0.35 : 0.55]),
  sixteenth: Array.from({ length: 16 }, (_, s) => [s, [0.5, 0.2, 0.35, 0.2][s % 4]]),
  offbeat: [[2, 0.4], [6, 0.4], [10, 0.4], [14, 0.4]],
  sparse: [[0, 0.3], [8, 0.3]],
};

/** Rhythm of the electric piano: [step, held steps]. The chord is "rolled" (each note a few ms after the previous one). */
const comping = {
  held: [[0, 6], [6, 10]],
  syncopated: [[0, 7], [7, 3], [10, 6]],
  offbeats: [[2, 4], [6, 4], [10, 4], [14, 4]],
  sparse: [[0, 15]],
};

const MOOD_BASE = { kickP: 1, snareP: 1, hatP: 1, dropBar: 0.1, vel: 1, melody: 0.4, crackle: 1.2, bright: 2600, keys: 1 };
/** Per look of the sky (the same names as the soft music scales: dawn, day, dusk, night, rain). */
const moods = {
  dawn: { ...MOOD_BASE, bpm: [72, 78], swing: 0.2, vel: 0.85, kicks: ['lazy', 'boombap'], snares: ['rim', 'backbeat'], hats: ['offbeat', 'eighths'], comping: ['held', 'syncopated'], melody: 0.4, crackle: 1.2, bright: 2700, progs: { 'soft-morning': 3, 'late-bus': 2, lantern: 2, 'rain-window': 1 } },
  day: { ...MOOD_BASE, bpm: [76, 82], swing: 0.22, vel: 1, kicks: ['boombap', 'bounce', 'lazy'], snares: ['backbeat', 'ghost'], hats: ['eighths', 'sixteenth'], comping: ['syncopated', 'offbeats', 'held'], melody: 0.5, crackle: 0.8, bright: 3200, progs: { 'soft-morning': 3, 'late-bus': 3, lantern: 3, 'rain-window': 2 } },
  dusk: { ...MOOD_BASE, bpm: [70, 76], swing: 0.24, vel: 0.9, kicks: ['boombap', 'lazy'], snares: ['ghost', 'rim'], hats: ['eighths', 'offbeat'], comping: ['held', 'syncopated'], melody: 0.35, crackle: 1.4, bright: 2300, progs: { 'rain-window': 3, 'late-bus': 2, lantern: 2, 'slow-tea': 2, moonlit: 1 } },
  night: { ...MOOD_BASE, bpm: [68, 71], swing: 0.26, vel: 0.6, kickP: 0.8, snareP: 0.3, hatP: 0.5, dropBar: 0.35, kicks: ['heartbeat', 'lazy'], snares: ['softclap'], hats: ['sparse'], comping: ['held', 'sparse'], melody: 0.25, crackle: 1.8, bright: 1900, keys: 0.9, progs: { moonlit: 3, 'slow-tea': 3, 'rain-window': 1 } },
  rain: { ...MOOD_BASE, bpm: [68, 73], swing: 0.25, vel: 0.7, kickP: 0.9, snareP: 0.8, hatP: 0.8, dropBar: 0.2, kicks: ['lazy', 'rainy'], snares: ['rim', 'softclap'], hats: ['offbeat', 'sparse'], comping: ['held', 'syncopated'], melody: 0.3, crackle: 3.2, bright: 2100, progs: { 'rain-window': 3, moonlit: 2, 'slow-tea': 3 } },
};

export default Object.freeze({
  beatsPerBar: 4,
  stepsPerBar: 16,
  maxPolyphony: 10, // notes (electric piano + bass + melody) sounding at once, release tails included; drums and crackle apart
  humanizeMs: 9, // every hit is moved by at most this much (seeded)
  strumMs: 14, // the electric piano chord is rolled: each note up to 3 x this later
  velJitter: 0.12, // every hit's velocity is changed by at most this fraction
  releaseS: 0.35, // electric piano release after the held part
  maxTailS: 1.6, // a bar's sound may ring this long after the bar ends (it is mixed into the next bar's start by the player)
  keysRange: [53, 73],
  bassRange: [36, 47],
  melodyRange: [69, 84],
  qualities,
  progressions,
  kicks,
  snares,
  hats,
  comping,
  moods,
  // synth (audio/lofiRender.js)
  renderRateHz: 22050,
  tremolo: { hz: 2.6, depth: 0.1 }, // slow tremolo of the electric piano
  tape: { wowHz: 0.21, wowCents: 3.5, flutterHz: 5.4, flutterCents: 0.8 }, // slow pitch drift of the "tape", global (never restarts at a bar)
  crackleLevel: 0.05,
  drive: 1.15, // soft saturation before the final level (tanh): warmth, and a guaranteed ceiling
  stemGain: 0.62, // level of the rendered bar (peak well under 1) before the engine's lofi gain
});
