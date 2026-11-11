// "La Berceuse du lac" (J12-A): the story as DATA. No logic here, no text: every text is a key of data/strings-story.js (FR + EN). Names, order, rewards
// and the texts were validated by the owner on 2026-11-10. J12-B extends this file (couplets 6-8, `boat.ready`, `islet.open`, `finale.done`, Roseau's boat talk,
// the deep waters) by appending to COUPLETS / DIALOGUES / AMBIENT / LETTERS and to data/dream.js DREAM_FISH; nothing in story/*.js needs to change.
//
// Conditions are the small JSON objects of story/cond.js; dialogue nodes are those of story/dialogue.js.

import { SPOTS } from './map.js';
import { BOAT_SPOTS, BOAT_UNLOCK } from './boat.js';

/** The names of the flags the engine and the hooks use (story.flags). `couplet.<n>.found` is set by markCouplet(n). */
export const FLAGS = Object.freeze({
  started: 'story.started',
  intro: 'intro.done',
  couplet: (n) => `couplet.${n}.found`,
  boatReady: 'boat.ready', // J12-B: the boat is ready
  isletOpen: 'islet.open', // J12-B: the islet can be visited
  finaleDone: 'finale.done', // J12-B: the last couplet is sung
});
/** Couplets of the whole story (J12-B fills 6 to 8): the engine accepts any n from 1 to this number. */
export const COUPLET_COUNT = 8;

/**
 * The couplets (1 to 5 in J12-A). Each one is carried by a dream fish (data/dream.js, same couplet number).
 *   spot     fishing spot id (data/map.js SPOTS) where its fish bites          when  { phases, weather } in words (the log shows the texts below)
 *   catSeat  [x, z] where the cat sits when it hints this place                reward { pearls }
 */
export const COUPLETS = Object.freeze([
  { n: 1, spot: 'pier', catSeat: [2.0, -10.3], reward: { pearls: 60 } },
  { n: 2, spot: 'boardwalk', catSeat: [-17.0, -13.0], reward: { pearls: 80 } },
  { n: 3, spot: 'pier', catSeat: [3.9, -9.9], reward: { pearls: 120 } },
  { n: 4, spot: 'point', catSeat: [-30.5, -11.9], reward: { pearls: 160 } },
  { n: 5, spot: 'beach', catSeat: [24.5, -5.2], reward: { pearls: 220 } },
  // J12-B: the boat's couplets. The cat waits at the landing ("by boat"); isletSeat = where it sits once the angler is on the islet.
  { n: 6, spot: 'depths', catSeat: [25.2, -13.7], reward: { pearls: 260 } },
  { n: 7, spot: 'islet', catSeat: [25.2, -13.7], isletSeat: [7.4, -25.1], reward: { pearls: 320 } },
  { n: 8, spot: 'heart', catSeat: [25.2, -13.7], isletSeat: [7.4, -25.1], reward: { pearls: 420 } },
].map((c) => Object.freeze(c)));

/** Registry of the places the story talks about (spot id -> world point of the fishing spot and the water in front of it). */
export const STORY_SPOTS = Object.freeze(
  Object.fromEntries([...BOAT_SPOTS.map((b) => ({ ...b, face: [0, 0] })), ...SPOTS].map((s) => [s.id, Object.freeze({ id: s.id, x: s.x, z: s.z, water: s.water, face: s.face, boat: !!s.boat, over: [s.x + s.face[0] * 3, s.z + s.face[1] * 3] })])),
);

/** Who can be talked to. kind 'villager' = a walking villager of data/map.js VILLAGERS; 'cat' = the cat; 'spirit' = Le Dormeur (floating lines only); 'narr' = narration. */
export const CHARACTERS = Object.freeze({
  ondine: { kind: 'villager', villager: 'shopkeeper', talkR: 2.3 },
  roseau: { kind: 'villager', villager: 'sailor', talkR: 2.3 },
  pomme: { kind: 'villager', villager: 'child', talkR: 2.3 },
  biscotte: { kind: 'cat', talkR: 1.4 }, // small: the cat walks a little behind the angler, its marker must not take over the walking hint
  dormeur: { kind: 'spirit', talkR: 0 },
  narr: { kind: 'narr', talkR: 0 },
});

/** The cabin's places to look at (no interior in J8-J12: a writing desk and a window seat beside the cabin). */
export const CABIN_POINTS = Object.freeze([
  { id: 'desk', x: -9.2, z: 9.8, r: 1.8, prop: ['crate', -9.2, 8.5] },
  { id: 'seat', x: -7.9, z: 10.4, r: 1.8, prop: ['bench', -7.9, 9.3] },
]);

// ------------------------------------------------------------------------------------------------ ambient lines
const L = (char, id, cond) => ({ id, key: `story.a.${char}.${id}`, ...(cond ? { if: cond } : {}) });
const T = (...phases) => ({ time: phases });
const W = (...w) => ({ weather: w });
const FIN = { flag: 'finale.done' }; // J12-B: lines of the time after the finale
export const AMBIENT = Object.freeze({
  ondine: [L('ondine', 'f1', FIN), L('ondine', 'f2', FIN), L('ondine', 'a1', { all: [T('day'), W('clear')] }), L('ondine', 'a2', W('rain')), L('ondine', 'a3', W('mist')), L('ondine', 'a4', T('dusk')), L('ondine', 'a5', T('night')), L('ondine', 'a6'), L('ondine', 'a7'), L('ondine', 'a8'), L('ondine', 'a9', T('dawn')), L('ondine', 'a10', { flag: 'boat.ready' })],
  roseau: [L('roseau', 'f1', FIN), L('roseau', 'f2', FIN), L('roseau', 'a1'), L('roseau', 'a2', W('rain')), L('roseau', 'a3', W('mist')), L('roseau', 'a4', T('night')), L('roseau', 'a5', T('dawn')), L('roseau', 'a6'), L('roseau', 'a7', { step: { gte: 3 } }), L('roseau', 'a8'), L('roseau', 'a9'), L('roseau', 'a10', { step: { gte: 6 } }), L('roseau', 'a11', { flag: 'boat.ready' })],
  pomme: [L('pomme', 'f1', FIN), L('pomme', 'f2', FIN), L('pomme', 'a1'), L('pomme', 'a2', W('rain')), L('pomme', 'a3', T('night')), L('pomme', 'a4', W('mist')), L('pomme', 'a5', T('dawn')), L('pomme', 'a6'), L('pomme', 'a7', T('dusk')), L('pomme', 'a8', { step: { gte: 2 } }), L('pomme', 'a9'), L('pomme', 'a10'), L('pomme', 'a11', { step: { gte: 6 } })],
  biscotte: [L('biscotte', 'f1', FIN), L('biscotte', 'f2', FIN), L('biscotte', 'a1'), L('biscotte', 'a2'), L('biscotte', 'a3', T('day')), L('biscotte', 'a4', W('rain')), L('biscotte', 'a5', T('night')), L('biscotte', 'a6'), L('biscotte', 'a7'), L('biscotte', 'a8', { flag: 'boat.ready' })],
  dormeur: [L('dormeur', 'f1', FIN), L('dormeur', 'f2', FIN), L('dormeur', 'a1'), L('dormeur', 'a2', T('night')), L('dormeur', 'a3', W('mist', 'rain')), ...COUPLETS.map((c) => L('dormeur', 's' + c.n, { step: { eq: c.n } })), L('dormeur', 'a4', { step: { gte: 6 } })],
});

// ------------------------------------------------------------------------------------------------ dialogues
const node = (speaker, o = {}) => ({ speaker, ...o });
const route = (next) => ({ next });
const onceStep = (who, k) => ({ if: { all: [{ step: { eq: k } }, { not: { seen: `${who}.s${k}` } }] }, to: `s${k}` });
const stepLines = (who, speaker, ks, to = 'menu') => Object.fromEntries(ks.map((k) => [`s${k}`, node(speaker, { mark: `${who}.s${k}`, next: to })]));
const HINT = { text: 'story.c.hint', if: { step: { lte: 8 } }, next: 'hint' };
// ("Plus tard" is the box's own button: Escape does the same; no choice repeats it)

export const DIALOGUES = Object.freeze({
  // the first start, at the cabin door (4 lines, skippable, never shown again once seen or skipped: the shell sets intro.done at its end)
  intro: {
    start: 'i1',
    nodes: {
      i1: node('narr', { next: 'i2' }),
      i2: node('narr', { next: 'i3' }),
      i3: node('narr', { next: 'i4' }),
      i4: node('narr', { end: true, effects: [{ set: FLAGS.intro }] }),
    },
  },
  ondine: {
    start: 'root',
    nodes: {
      root: route([{ if: { not: { seen: 'ondine.first' } }, to: 'first' }, ...[1, 2, 3, 4, 5].map((k) => onceStep('ondine', k)), { if: { all: [{ step: { eq: 6 } }, { not: { seen: 'ondine.s6' } }] }, to: 's6' }, onceStep('ondine', 7), onceStep('ondine', 8), { if: { all: [{ flag: FLAGS.finaleDone }, { not: { seen: 'ondine.fin' } }] }, to: 'fin' }, { to: 'menu' }]),
      first: node('ondine', { mark: 'ondine.first', next: 'first2' }),
      first2: node('ondine', { next: 'menu' }),
      ...stepLines('ondine', 'ondine', [1, 2, 3, 4, 5, 6, 7, 8]),
      // after the finale: a small gift, a title (cosmetic only: no gameplay effect)
      fin: node('ondine', { mark: 'ondine.fin', choices: [{ text: 'story.c.gift', effects: [{ set: 'gift.ondine' }], next: 'finGift' }, { text: 'story.c.thanks', next: 'menu' }] }),
      finGift: node('ondine', { next: 'menu' }),
      menu: node('ondine', { ambient: 'ondine', choices: [{ text: 'story.c.shop', effects: [{ open: 'shop' }] }, HINT] }),
      hint: node('ondine', { text: 'story.d.ondine.hint', next: 'menu2' }),
      menu2: node('ondine', { text: 'story.d.ondine.more', choices: [{ text: 'story.c.shop', effects: [{ open: 'shop' }] }] }),
    },
  },
  roseau: {
    start: 'root',
    nodes: {
      root: route([{ if: { not: { seen: 'roseau.first' } }, to: 'first' }, { if: { all: [{ step: { gte: 6 } }, { not: { flag: FLAGS.boatReady } }, { not: { seen: 'roseau.offer' } }] }, to: 'offer' }, onceStep('roseau', 7), onceStep('roseau', 8), { if: { all: [{ flag: FLAGS.finaleDone }, { not: { seen: 'roseau.fin' } }] }, to: 'fin' }, { to: 'menu' }]),
      first: node('roseau', { mark: 'roseau.first', next: 'first2' }),
      first2: node('roseau', { next: 'first3' }),
      first3: node('roseau', { next: 'first4' }),
      first4: node('roseau', { next: 'menu' }),
      menu: node('roseau', { ambient: 'roseau', choices: [{ text: 'story.c.legend', next: 'legend' }, { text: 'story.c.boat', next: 'boat' }, HINT] }),
      legend: node('roseau', { next: 'legend2' }),
      legend2: node('roseau', { end: true }),
      // J12-B hook: when the boat is ready (flag boat.ready) the old sailor says so
      // J12-B: after the 5th couplet he offers the boat for three fish from the bucket (any kind) or a modest price: both always within reach, and 'later' costs nothing
      boat: route([{ if: { flag: FLAGS.boatReady }, to: 'boatYes' }, { if: { step: { gte: 6 } }, to: 'boatAsk' }, { to: 'boatNo' }]),
      boatNo: node('roseau', { end: true }),
      boatYes: node('roseau', { end: true }),
      offer: node('roseau', { mark: 'roseau.offer', next: 'boatAsk' }),
      boatAsk: node('roseau', { choices: [{ text: 'story.c.boatFish', if: { fish: { gte: BOAT_UNLOCK.fish } }, effects: [{ boat: 'fish' }], next: 'boatThanks' }, { text: 'story.c.boatPay', if: { money: { gte: BOAT_UNLOCK.pearls } }, effects: [{ boat: 'pearls' }], next: 'boatThanks' }, { text: 'story.c.boatLater', next: 'boatLater' }] }),
      boatThanks: node('roseau', { end: true }),
      boatLater: node('roseau', { end: true }),
      s7: node('roseau', { mark: 'roseau.s7', next: 'menu' }),
      s8: node('roseau', { mark: 'roseau.s8', next: 'menu' }),
      fin: node('roseau', { mark: 'roseau.fin', next: 'fin2' }),
      fin2: node('roseau', { next: 'fin3' }),
      fin3: node('roseau', { next: 'menu' }),
      hint: node('roseau', { text: 'story.d.roseau.hint', end: true }),
    },
  },
  pomme: {
    start: 'root',
    nodes: {
      root: route([{ if: { not: { seen: 'pomme.first' } }, to: 'first' }, ...[1, 2, 3, 4, 5].map((k) => onceStep('pomme', k)), { if: { all: [{ step: { eq: 6 } }, { not: { seen: 'pomme.s6' } }] }, to: 's6' }, onceStep('pomme', 7), onceStep('pomme', 8), { if: { all: [{ flag: FLAGS.finaleDone }, { not: { seen: 'pomme.fin' } }] }, to: 'fin' }, { to: 'menu' }]),
      first: node('pomme', { mark: 'pomme.first', next: 'first2' }),
      first2: node('pomme', { next: 'menu' }),
      ...stepLines('pomme', 'pomme', [1, 2, 3, 4, 5, 6, 7, 8]),
      fin: node('pomme', { mark: 'pomme.fin', next: 'fin2' }),
      fin2: node('pomme', { next: 'menu' }),
      menu: node('pomme', { ambient: 'pomme', choices: [HINT] }),
      hint: node('pomme', { text: 'story.d.pomme.hint', end: true }),
    },
  },
  // the cat barks in text: one line, no tree. Its first lines of each step point at the place (and it walks there: app/walk.js)
  biscotte: {
    start: 'root',
    nodes: {
      root: route([...[1, 2, 3, 4, 5, 6, 7, 8].map((k) => ({ if: { all: [{ step: { eq: k } }, { not: { seen: `biscotte.s${k}` } }] }, to: `s${k}` })), { to: 'amb' }]),
      ...Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8].map((k) => [`s${k}`, node('biscotte', { mark: `biscotte.s${k}`, end: true })])),
      amb: node('biscotte', { ambient: 'biscotte', end: true }),
    },
  },
  // the window seat of the cabin: the lullaby is sung back (the couplets found so far), and a line about it
  seat: {
    start: 'r0',
    nodes: {
      // (bug fix, brief 32: all eight couplets found but the finale never played, e.g. the page was closed before the 8th catch card: the bench offers it)
      r0: route([{ if: { flag: FLAGS.finaleDone }, to: 'nfin' }, { if: { step: { gt: COUPLET_COUNT } }, to: 'nfin' }, { to: 'n1' }]),
      // after the finale: the whole lullaby can be listened to again from the bench
      nfin: node('narr', { choices: [{ text: 'story.c.listen', effects: [{ open: 'finale' }] }, { text: 'story.c.sitMore' }] }),
      n1: node('narr', { effects: [{ lullaby: 'all' }], next: 'n2' }),
      n2: route([{ if: { step: { gte: 2 } }, to: 'n2b' }, { to: 'n2a' }]),
      n2a: node('narr', { end: true }),
      n2b: node('narr', { end: true }),
    },
  },
  // the story beat after each couplet (shown when the catch card is closed)
  // (the 8th beat IS the finale, below)
  ...Object.fromEntries(COUPLETS.filter((c) => c.n < 8).map((c) => [`beat${c.n}`, { start: 'b1', nodes: { b1: node('narr', { next: 'b2' }), b2: node('dormeur', { end: true }) } }])),
  // J12-B: the finale. Skippable (Escape = later; finale.done is set at the end OR at the skip by the shell), replayable from the cabin bench. The shell starts the scene
  // (camera drift, lights, the whole melody) with the effect `finale: 'start'` and stops it with 'end' or when the talk is closed.
  finale: {
    start: 'f1',
    nodes: {
      f1: node('narr', { effects: [{ finale: 'start' }], next: 'f2' }),
      f2: node('narr', { next: 'f3' }),
      f3: node('dormeur', { next: 'f4' }),
      f4: node('dormeur', { next: 'f5' }),
      f5: node('narr', { next: 'f6' }),
      f6: node('narr', { next: 'f7' }),
      f7: node('narr', { effects: [{ set: FLAGS.finaleDone }, { finale: 'end' }, { letter: 'l9' }, { open: 'letters' }], end: true }),
    },
  },
});

// ------------------------------------------------------------------------------------------------ letters (the grandmother's pages)
/** l0 is there from the start; l<n> appears with couplet n. Keys: story.letter.<id>.title / .body. */
export const LETTERS = Object.freeze([{ id: 'l0', couplet: 0 }, ...COUPLETS.map((c) => ({ id: `l${c.n}`, couplet: c.n })), { id: 'l9', couplet: 9, flag: FLAGS.finaleDone }]);
