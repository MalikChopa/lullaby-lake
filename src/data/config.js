// Game settings as data. Nothing in core/ hard-codes these values.
export default Object.freeze({
  dayLengthS: 480,
  startDayFrac: 0.5,
  phases: [
    { id: 'dawn', from: 0, to: 0.125 },
    { id: 'day', from: 0.125, to: 0.5 },
    { id: 'dusk', from: 0.5, to: 0.625 },
    { id: 'night', from: 0.625, to: 1 },
  ],
  // Cast (J1b, timings of the approved mock-up). Charging: the power breathes between 0 and 1 (0.5 - 0.5 cos(powerRate t)), no
  // overshoot, no failure. Casting: the rod swings for swingS, the line is released at releaseAtS, the float flies for flightS and
  // splashes at landS = releaseAtS + flightS, which is exactly when the logical phase `casting` ends (tests/fishing.test.js checks it).
  cast: { powerRate: 2.2, tapMaxS: 0.15, minDistPx: 40, maxDistPx: 150, leanS: 0.8, swingS: 0.5, releaseAtS: 0.3, flightS: 1.05, landS: 1.35 },
  bite: {
    firstWaitS: [2, 4],
    waitS: [4, 12],
    holdS: 8, // decided by the user; the "let the fish wait" setting turns it into no limit
    returnWaitS: [4, 8],
    escapedMsgS: 2.5,
  },
  reel: { durationS: 1.2 },
  pace: 'long',
  paceSets: {
    short: { rarityWeights: { 1: 100, 2: 40, 3: 12, 4: 6 }, pity: { step: 0.15, cap: 10, guarantee: 30 } },
    medium: { rarityWeights: { 1: 100, 2: 40, 3: 12, 4: 6 }, pity: { step: 0.02, cap: 10, guarantee: 50 } },
    // J6 (24 species): `long` keeps its guarantee and its weights but the legendary weight goes 6 -> 12 so La Berceuse and La Comete stay
    // above 0.5 % of the bites with 24 species (median full carnet ~141 min for a calm player, simulated; see docs/JOURNAL.md).
    long: { rarityWeights: { 1: 100, 2: 40, 3: 8, 4: 12 }, pity: { step: 0, cap: 1, guarantee: 75 } },
  },
  autosaveS: 30,
  paletteSteps: 12,
  photoScale: 4,
  perf: { degradeWorkP95Ms: 14, restoreWorkP95Ms: 8, degradeWindowS: 5, restoreWindowS: 30, rainMax: 120, rainMaxLow: 50 },
});
