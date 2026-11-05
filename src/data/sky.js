// Day/night cycle and sky data (J3). Data only: nothing here is code.
// The picture is a blend of the five baked moods of palettes.js (dusk, day, night, rain, fog), driven by the game clock and the
// weather (core/sky.js). The weather's own numbers (wash, cover, veil, drops) are in weather.js.

export default Object.freeze({
  // phase id -> mood used as its pure look (dawn borrows the "fog" mood: pale pink morning, its veil is set by the weather)
  layerOfPhase: { dawn: 'fog', day: 'day', dusk: 'dusk', night: 'night' },
  // cross-fade at the START of each phase: from (boundary - half) to (boundary + half), as a fraction of the day (0.04 = 19.2 s each side).
  // Sunrise is the slowest (the biggest change of light): night -> dawn takes 57.6 s, dawn -> day 38.4 s, day -> dusk 38.4 s, dusk -> night 48 s.
  blendHalf: { dawn: 0.06, day: 0.04, dusk: 0.04, night: 0.05 },
  // ambient light of each phase (0..1): scales the colours of the weather moods so rain by night stays dark
  light: { dawn: 0.86, day: 1, dusk: 0.66, night: 0.42 },
  // natural light of the weather moods: a weather mood is darkened when the phase is darker than that (rain by night stays dark)
  layerLight: { rain: 1, fog: 0.86 },
  // base mist veil of each phase (the weather adds its own)
  veil: { dawn: 0.2, day: 0, dusk: 0.18, night: 0 },
  // light of the cabin window and of the lantern, fireflies, birds, per phase (from the approved moods)
  cabin: { dawn: 0.6, day: 0, dusk: 1, night: 1.2 },
  lamp: { dawn: 0.6, day: 0.25, dusk: 1, night: 1.1 },
  flies: { dawn: 6, day: 0, dusk: 12, night: 14 },
  birds: { dawn: 1, day: 1, dusk: 0.6, night: 0 },
  // share of the 170 stars that are lit, per phase (dusk = the 70 stars of the dusk mood)
  stars: { dawn: 0.08, day: 0, dusk: 0.41, night: 1 },
  starsMax: 170,
  // a new game opens a little after the start of dusk (config.startDayFrac stays 0.5 for the core): the pure dusk mood, not half way from day
  startFrac: 0.54,
  smoke: 0.45,
  // sun and moon: an arc from left to right. rise/set are fractions of the day (the moon sets after midnight: 1.05 = 0.05).
  // x0..x1 = horizontal span, baseY = below the horizon (hidden under the hills), apexY = height at noon / midnight, fade = share of
  // the arc spent fading in and out. The moon is up long before dusk but only shows when the light is low (moonDark): it is
  // pale blue sky by day. At dusk (0.54) it stands high on the left, around midnight (0.8) near the top right, as in the mood.
  sun: { rise: 0.07, set: 0.5, x0: 40, x1: 440, baseY: 160, apexY: 30, fade: 0.07 },
  moon: { rise: 0.3, set: 1.05, x0: 40, x1: 440, baseY: 160, apexY: 34, fade: 0.07 },
  moonDark: { from: 0.8, width: 0.2 },
  // weather mix fades over this many seconds of game time (a change never jumps)
  weatherFadeS: 10,
  // pinned moods (?preset=) : how many clouds they show
  presetCover: { dusk: 0.55, day: 0.4, night: 0.14, rain: 1, fog: 0.3 },
  // the cloud pool: centre x, y, width, height, coverage threshold (a cloud appears when the cover reaches it), drift px/s
  clouds: [
    { x: 130, y: 40, w: 150, h: 14, thr: 0.04, v: 2.2 },
    { x: 330, y: 28, w: 110, h: 10, thr: 0.07, v: 1.6 },
    { x: 410, y: 92, w: 140, h: 16, thr: 0.18, v: 1.2 },
    { x: 60, y: 96, w: 100, h: 10, thr: 0.24, v: 1.9 },
    { x: 262, y: 24, w: 130, h: 12, thr: 0.3, v: 2.6 },
    { x: 214, y: 74, w: 90, h: 8, thr: 0.38, v: 1.4 },
    { x: 450, y: 40, w: 60, h: 7, thr: 0.44, v: 3 },
    { x: 150, y: 52, w: 120, h: 9, thr: 0.5, v: 1.8 },
    { x: 390, y: 70, w: 110, h: 8, thr: 0.56, v: 2.1 },
    { x: 100, y: 26, w: 280, h: 24, thr: 0.66, v: 1.5 },
    { x: 320, y: 34, w: 300, h: 22, thr: 0.72, v: 1.9 },
    { x: 200, y: 64, w: 260, h: 18, thr: 0.8, v: 1.3 },
    { x: 430, y: 70, w: 170, h: 16, thr: 0.86, v: 2.4 },
    { x: 50, y: 86, w: 150, h: 14, thr: 0.92, v: 1.7 },
    { x: 260, y: 92, w: 200, h: 12, thr: 0.96, v: 1.1 },
  ],
});
