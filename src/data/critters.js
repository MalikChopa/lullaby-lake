// Living scenery (J6 part B). Data only: how often each silent creature shows up and when it may. Tune here, not in the code.
// Times are in game seconds (a day lasts 480 s: dawn 60, day 180, dusk 60, night 180). Nothing here makes a sound or carries a text.
//
// Each kind of event has:
//   tod      weight of each phase in the "gate" (0..1): the gate is the sum of (phase weight x this weight), so a creature fades with the
//            light and never pops when a phase or a weather changes (the phase weights come from core/sky.js, they cross-fade)
//   rain, cover, veil  [from, to]: the gate falls from 1 to 0 as the rain / cloud cover / mist goes from `from` to `to`
//   need     smallest gate at which an event may START (an event that has started goes on, and fades if the gate drops under `need`)
//   gapS     waiting time between two events, drawn in [min, max] and counted ONLY while the gate is high enough (so a creature
//            of the dusk waits through the day), at full speed when the gate is 1 and proportionally slower below; firstS = the same for the first one of a session
//   durS     how long an event lasts
//   slowByCover  the countdown runs this much slower under a full cloud cover (fish jump more when the sky is calm and clear)
// cls "sky" = flyovers that share `skyMinGapS`: two never start less than that apart.

export default Object.freeze({
  skyMinGapS: 90,
  fadeS: 1.5, // flyovers come in and go out of the picture over this long

  kinds: Object.freeze({
    birds: { cls: 'sky', tod: { dawn: 0.7, day: 1, dusk: 0.5 }, need: 0.5, rain: [0.05, 0.3], veil: [0.5, 0.85], gapS: [180, 360], firstS: [50, 150], durS: [26, 34], count: [3, 5], band: [28, 76] },
    geese: { cls: 'sky', tod: { dawn: 0.4, dusk: 1 }, need: 0.5, rain: [0.05, 0.3], veil: [0.4, 0.8], gapS: [150, 300], firstS: [20, 90], durS: [38, 46], count: [5, 7], band: [22, 50] },
    heron: { cls: 'sky', tod: { dawn: 0.8, dusk: 1 }, need: 0.5, rain: [0.05, 0.3], veil: [0.3, 0.7], gapS: [200, 420], firstS: [30, 120], durS: [26, 32], band: [88, 118] },
    owl: { cls: 'sky', tod: { night: 1 }, need: 0.7, rain: [0.05, 0.3], cover: [0.6, 0.9], veil: [0.4, 0.8], gapS: [150, 330], firstS: [20, 90], durS: [14, 18], band: [62, 108] },
    bat: { cls: 'sky', tod: { dusk: 1, night: 0.3 }, need: 0.45, rain: [0, 0.2], veil: [0.4, 0.8], gapS: [60, 140], firstS: [10, 40], durS: [6, 9], span: [140, 340], band: [84, 150] },
    star: { cls: 'star', tod: { night: 1, dusk: 0.2 }, need: 0.8, rain: [0, 0.05], cover: [0.25, 0.5], veil: [0.1, 0.3], gapS: [240, 540], firstS: [40, 160], durS: [1.0, 1.4], span: [20, 400] },
    jump: { cls: 'jump', tod: { dawn: 1, day: 1, dusk: 1, night: 0.7 }, need: 0.3, rain: [0.3, 0.6], veil: [0.7, 1], gapS: [40, 90], firstS: [12, 35], durS: [2.6, 2.6], slowByCover: 0.35, spots: [[212, 184], [262, 178], [292, 190], [322, 182], [352, 176], [392, 180], [432, 184], [462, 178]], floatKeepPx: 60 },
    dragon: { cls: 'dragon', tod: { dawn: 0.3, day: 1 }, need: 0.6, rain: [0, 0.05], veil: [0.2, 0.35], gapS: [40, 90], firstS: [15, 50], durS: [18, 30], count: [1, 2], box: [396, 196, 474, 236] },
    frog: { cls: 'frog', tod: { dawn: 0.5, day: 1, dusk: 0.8 }, need: 0.5, rain: [0.3, 0.7], veil: [0.5, 0.85], gapS: [45, 110], firstS: [12, 40], durS: [50, 110], hopS: 0.55, enterS: 0.8, leaveS: 0.8 },
  }),

  // lily pads where the frog sits: centre x, y of the pad and its half-width (as painted in art/sceneBake.js), and the pads it may hop to
  pads: Object.freeze([
    { x: 346, y: 240, w: 16, next: [1, 2] },
    { x: 372, y: 248, w: 13, next: [0, 3] },
    { x: 330, y: 254, w: 11, next: [0, 1] },
    { x: 394, y: 238, w: 10, next: [1] },
  ]),

  // the frog on its pad: blinks and ripples now and then; hops to a neighbouring pad every hopGapS
  frog: Object.freeze({ blinkGapS: [2.5, 7], blinkS: 0.2, rippleGapS: [9, 20], hopGapS: [14, 30] }),

  // the cat (art/catPaint.js draws the poses; core/critters.js picks them). Timings in seconds of animation time.
  cat: Object.freeze({
    blink: { gapS: [2.6, 6.5], durS: 0.2 },
    ear: { gapS: [7, 16], durS: 0.32 },
    tail: { gapS: [3.5, 8], durS: 1.8, stepS: 0.45 },
    yawn: { gapS: [45, 100], durS: 2.4 },
    noticeS: 1.4, // seconds of "waiting" before the cat looks at the float
    happyS: 3, // content after a catch
    bounceS: 0.26, // the little hops of a content cat (step of 1 pixel up and down)
    bounceCount: 4,
    // sleep: curls up at night and in heavy rain; wakes at dawn. On / off levels differ so it never flickers between the two.
    sleep: { nightOn: 0.55, nightOff: 0.4, rainOn: 0.7, rainOff: 0.5, dozeS: 2.8, riseS: 0.9, wakeYawnS: 2.2, breathS: 2.1 },
  }),
});
