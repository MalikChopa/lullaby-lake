// Sound as data (J3). The ambience, the effects, the 'soft' and 'lofi' music are synthesised by code with Web Audio. The third music
// style, 'real' (J6 part D), plays three recorded CC0 tracks (assets/music/, credited in THIRD-PARTY). Gains are linear amplitudes (1 = full scale);
// each voice peaks well under -12 dBFS and the master chain adds a compressor, so the sum stays under -6 dBFS (measured, tools/check-j3.mjs).
const DEFAULT_STYLE = 'soft'; // the music style of a new game ('soft' = the generative notes of J3, 'lofi' = J6 part C): the owner decides

export default Object.freeze({
  styles: Object.freeze(['soft', 'lofi', 'real']),
  defaultStyle: DEFAULT_STYLE,
  masterFadeInS: 4, // the master rises from silence over this time when the sound starts
  muteFadeS: 0.3, // mute = a fall over this time, then the context is suspended
  levelTcS: 1.2, // time constant of every voice level change (a weather change fades over 10 s on top of that)
  volumeTcS: 0.25, // time constant of a volume slider change (never a click)
  bufferRateHz: 22050, // sample rate of the looping buffers (made once; the context resamples)
  tickMs: 100, // scheduler period
  lookaheadS: 0.3,
  idleStopS: 2, // a voice whose target stays 0 for this long is stopped and its nodes freed
  limiter: { threshold: -18, knee: 10, ratio: 4, attack: 0.01, release: 0.25 },
  budget: { maxNodes: 24, sfxReserve: 5 }, // nodes alive at once; the last `sfxReserve` are kept for effects (a bite = 5 nodes), ambience never takes them
  trim: { ambience: 0.5, fx: 0.6, music: 0.5 }, // fixed gain of each bus before the volume sliders
  defaults: { ambience: 70, fx: 60, music: 40, muted: false, musicStyle: DEFAULT_STYLE },
  voices: {
    water: { gain: 0.3, lowpassHz: 520, seconds: 2.4, wobbleEveryS: 3 },
    wind: { gain: 0.16, q: 0.8, hz: [280, 900], glideEveryS: 4, seconds: 2.7 },
    rain: { gain: 0.2, highpassHz: 1000, seconds: 2.2 },
    crickets: { gain: 0.1, seconds: 1.5 },
  },
  birds: { everyS: [2, 8], chirps: [2, 4], hz: [2000, 5000], durS: [0.06, 0.12], gain: 0.05 },
  music: {
    everyS: [2, 5], attackS: 0.3, releaseS: 2, gain: 0.11, maxNotes: 3, delayS: 0.45, feedback: 0.3, wet: 0.5,
    // pentatonic scales (Hz): one per phase, one for rain and mist; a note is picked at random, never a wrong one
    scales: {
      dawn: [262, 294, 330, 392, 440],
      day: [392, 440, 494, 587, 659],
      dusk: [294, 330, 370, 440, 494],
      night: [220, 262, 294, 330, 392],
      rain: [220, 247, 294, 330, 370],
    },
  },
  // lofi (audio/lofiRender.js renders one bar at a time into a buffer; core/lofi.js writes the notes; data/lofi.js holds the tables)
  lofi: {
    gain: 0.4, // linear gain of the lofi chain before the music bus (the rendered bar peaks near 0.55 and sits around -18.6 dBFS RMS)
    fadeInTc: 1, // s, time constant of the cross-fade in (the soft notes just stop being started, their tails die in about 2.5 s)
    fadeOutTc: 0.7,
    offAfterS: 5, // the lofi nodes are freed this long after the style was left (or the music level fell to 0)
    tapeHz: 6500, // gentle low-pass of the whole lofi chain
    renderBudgetMs: 4, // work per scheduler tick (a bar needs about 30-60 ms in all on the dev PC: it is cut into pieces)
    firstBarBudgetMs: 10, // the first bar of a stream is made faster (the player has just chosen the style, the previous music is dying)
    aheadBarS: 3, // the next bar starts to be made when it is due in less than this many seconds
    duckGain: 0.708, // -3 dB while the catch jingle plays
    duckS: 0.3,
    startDelayS: 0.15, // the first bar starts this long after it is ready
  },
  // real lofi tracks (audio/engine.js + core/playlist.js + core/crossfade.js). Loaded only when this style is chosen, after the first gesture.
  // `gain` = fixed gain that brings each file to the same loudness as the generated lofi (about -26.6 dBFS RMS before the music bus):
  //   gain = 10^((-26.6 - RMS of the file) / 20); RMS of the mono mix measured with ffmpeg astats on 2026-11-05: -18.00, -17.41, -18.94 dBFS.
  // `decodeRate` = native sample rate of the file: it is decoded at that rate (not at the 48-96 kHz of the audio context) to save memory.
  // `url` is relative to the page (same origin); sw.js caches these exact paths at run time (see tools/site-files.mjs).
  real: {
    tracks: Object.freeze([
      Object.freeze({ id: 'chill', url: 'assets/music/chill-lofi-inspired.mp3', gain: 0.37, durationS: 123.2, decodeRate: 44100 }),
      Object.freeze({ id: 'again', url: 'assets/music/lofi-again.ogg', gain: 0.35, durationS: 87.8, decodeRate: 44100 }),
      Object.freeze({ id: 'loop', url: 'assets/music/lofi-hip-hop-loop.ogg', gain: 0.41, durationS: 127.9, decodeRate: 22050 }),
    ]),
    crossS: 4, // cross-fade between two tracks, and between a generated style and the tracks (equal power; each track also fades in from silence)
    preloadS: 50, // the next track starts to be fetched and decoded this long before the cross-fade is due (the tracks are 88-128 s long)
    startDelayS: 0.1, // the first track starts this long after it is decoded
    scheduleAheadS: 2, // the nodes of the next track are made this long before it starts (a node costs budget)
    leaveWaitS: 6, // real -> lofi: the tracks play on until the first lofi bar is scheduled, at most this long
  },
  sfx: {
    cast: { gain: 0.22, seconds: 0.5, hz: [400, 1800] },
    splash: { gain: 0.22, seconds: 0.3, hz: 1300 },
    reel: { gain: 0.1, seconds: 0.5, hz: [500, 1200] },
    ploc: { gain: 0.16, hz: [600, 180], durS: 0.15 },
    chime: { gain: 0.1, hz: [1320, 1980], durS: 0.8 },
    catch: { gain: 0.11, notes: [523, 659, 784], stepS: 0.18, durS: 0.9 },
    click: { gain: 0.07, hz: 900, durS: 0.04 },
  },
});
