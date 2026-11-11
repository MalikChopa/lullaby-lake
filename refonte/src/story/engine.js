// The story state and engine of "La Berceuse du lac" (J12-A), pure: no DOM, no clock, no random. A plain JSON object is part of the HD-2D save v4:
//   story = { flags: { name: true }, step: n, couplets: [n...], lettersRead: [id...], dialogueSeen: [id...], dreamCaught: [speciesId...] }
// step = the couplet being looked for (1..8); 9 = all eight are found (the finale follows). Everything is IDEMPOTENT and in ORDER: couplet n can only
// be found when step = n (a dream fish of a later couplet cannot even bite: data/dream.js `requires`), so the story can never be skipped, and it cannot
// be soft-locked: the game keeps spawning the conditions of the current couplet (same fish, same place and hour, every day), and the cat and the log hint where.
//
// HOOKS for J12-B (documented in docs/JOURNAL.md "J12-A"):
//   story.flags namespace : story.started, intro.done, couplet.<n>.found (n = 1..8), boat.ready, islet.open, finale.done   (story.flag(name), story.setFlag(name))
//   story.on(fn) | story.on(type, fn)   types: 'fish-caught' 'spot-entered' 'item-gained' 'dialogue-ended' (the inputs, repeated) and 'couplet' 'flag' 'letter' 'seen' (the results)
//   story.event(type, payload)          the input side: the shell tells the engine what happened; payload of 'fish-caught' = { speciesId }, 'spot-entered' = { spot },
//                                       'item-gained' = { kind, id }, 'dialogue-ended' = { id, reason }
//   story.markCouplet(n)                marks a couplet found (plays the sting through deps.sting, updates the log by the 'couplet' event); false when it is not the current one
//   data/dream.js DREAM_FISH            append a dream fish = a new species + its spot + its requirement; the engine reads COUPLETS / DREAM_FISH
import { COUPLETS, LETTERS, FLAGS, COUPLET_COUNT } from '../data/story.js';
import { DREAM_FISH } from '../data/dream.js';

const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const strList = (x) => Array.isArray(x) && x.every((s) => typeof s === 'string');

export function newStory() {
  return { flags: { [FLAGS.started]: true }, step: 1, couplets: [], lettersRead: [], dialogueSeen: [], dreamCaught: [] };
}

export function cloneStory(s) {
  return { flags: { ...s.flags }, step: s.step, couplets: [...s.couplets], lettersRead: [...s.lettersRead], dialogueSeen: [...s.dialogueSeen], dreamCaught: [...s.dreamCaught] };
}

/** Lists what is wrong with a story object (empty = valid). */
export function validateStory(s) {
  const e = [];
  if (!isObj(s)) return ['story'];
  if (!isObj(s.flags) || Object.values(s.flags).some((v) => typeof v !== 'boolean')) e.push('story.flags');
  if (!Number.isInteger(s.step) || s.step < 1 || s.step > COUPLET_COUNT + 1) e.push('story.step');
  if (!Array.isArray(s.couplets) || s.couplets.some((n) => !Number.isInteger(n) || n < 1 || n > COUPLET_COUNT) || new Set(s.couplets).size !== s.couplets.length) e.push('story.couplets');
  // the couplets are found in order: 1..k, and the step is k + 1
  else if (s.couplets.some((n, i) => n !== i + 1) || (Number.isInteger(s.step) && s.step !== s.couplets.length + 1)) e.push('story.order');
  if (!strList(s.lettersRead)) e.push('story.lettersRead');
  if (!strList(s.dialogueSeen)) e.push('story.dialogueSeen');
  if (!strList(s.dreamCaught)) e.push('story.dreamCaught');
  return e;
}

/** Migration v3 -> v4 of the HD-2D save: the story starts at step 1 with the first letter only. Everything else is kept. */
export function migrateV3toV4(save) {
  return { ...save, v: 4, story: newStory() };
}

/** The letters visible with these couplets found: l0 always, l<n> for every found couplet n. */
// J12-B: a letter may also wait for a flag (the last one, l9, appears with finale.done): lettersFor(couplets, flags)
export const lettersFor = (couplets, flags = {}) => LETTERS.filter((l) => (l.flag ? !!flags[l.flag] : l.couplet === 0 || couplets.includes(l.couplet))).map((l) => l.id);

/** The couplet descriptor of a number (data/story.js) or null. */
export const coupletOf = (n) => COUPLETS.find((c) => c.n === n) || null;
/** The dream fish (data/dream.js) of a couplet or null. */
export const dreamOf = (n) => DREAM_FISH.find((d) => d.couplet === n) || null;

/**
 * @param {object} initial a valid story (else a new game's)
 * @param {{ sting?: (n: number) => void, give?: (reward: object) => void }} deps  sting = the melody of the couplet (the shell); give = the pearls of the reward
 */
export function createStoryStore(initial, { sting = () => {}, give = () => {} } = {}) {
  let st = initial && validateStory(initial).length === 0 ? cloneStory(initial) : newStory();
  let rev = 0;
  const listeners = [];
  const emit = (type, payload = {}) => {
    rev++;
    for (const l of listeners.slice()) {
      if (l.type !== null && l.type !== type) continue;
      try {
        l.fn({ type, ...payload }, st);
      } catch {
        /* a failing listener must not break the story */
      }
    }
  };
  const S = {
    get: () => st,
    rev: () => rev,
    /** on(fn) listens to everything; on(type, fn) to one type. */
    on(a, b) {
      if (typeof a === 'function') listeners.push({ type: null, fn: a });
      else listeners.push({ type: a, fn: b });
    },
    load(next) {
      if (validateStory(next).length) return false;
      st = cloneStory(next);
      emit('load');
      return true;
    },
    flag: (name) => typeof name === 'string' && Object.prototype.hasOwnProperty.call(st.flags, name) && !!st.flags[name],
    setFlag(name, v = true) {
      if (typeof name !== 'string' || name === '__proto__' || name === 'constructor' || name === 'prototype') return false;
      if (Object.prototype.hasOwnProperty.call(st.flags, name) && st.flags[name] === !!v) return false;
      st = { ...st, flags: { ...st.flags, [name]: !!v } };
      emit('flag', { name, value: !!v });
      return true;
    },
    /** The dialogue seen marks ("ondine.first", "ondine.s2"...). */
    seen: (id) => st.dialogueSeen.includes(id),
    markSeen(id) {
      if (typeof id !== 'string' || st.dialogueSeen.includes(id)) return false;
      st = { ...st, dialogueSeen: [...st.dialogueSeen, id] };
      emit('seen', { id });
      return true;
    },
    letters: () => lettersFor(st.couplets, st.flags),
    unreadLetters: () => lettersFor(st.couplets, st.flags).filter((id) => !st.lettersRead.includes(id)),
    readLetter(id) {
      if (!lettersFor(st.couplets, st.flags).includes(id) || st.lettersRead.includes(id)) return false;
      st = { ...st, lettersRead: [...st.lettersRead, id] };
      emit('letter', { id, read: true });
      return true;
    },
    /** The couplet being looked for (descriptor) or null when the couplets of this version are all found. */
    current: () => coupletOf(st.step),
    /** The state of the story for the conditions of the dialogues. */
    snapshot: () => ({ flags: st.flags, step: st.step, couplets: st.couplets, seen: st.dialogueSeen }),
    /**
     * Marks couplet n found: ONLY the current one (n = step), once. Plays the sting, gives the pearls, unlocks the letter n, moves to the next step, tells the log.
     * Returns true when it happened, false when it was already found, not yet current or unknown (nothing changes then).
     */
    markCouplet(n) {
      if (!Number.isInteger(n) || n !== st.step || !coupletOf(n) || st.couplets.includes(n)) return false;
      st = { ...st, flags: { ...st.flags, [FLAGS.couplet(n)]: true, ...(n >= 6 ? { [FLAGS.isletOpen]: true } : {}) }, couplets: [...st.couplets, n], step: n + 1 };
      const c = coupletOf(n);
      give(c.reward);
      sting(n);
      emit('couplet', { n, reward: c.reward, letter: `l${n}`, next: coupletOf(n + 1) });
      return true;
    },
    /** The input side (see the header). A caught dream fish of the CURRENT couplet marks it. */
    event(type, payload = {}) {
      if (type === 'fish-caught' && payload.speciesId) {
        const d = DREAM_FISH.find((x) => x.species.id === payload.speciesId);
        if (d && !st.dreamCaught.includes(d.species.id)) st = { ...st, dreamCaught: [...st.dreamCaught, d.species.id] };
        emit(type, payload);
        if (d) S.markCouplet(d.couplet);
        return;
      }
      emit(type, payload);
    },
    /** Debug / tests: jumps so that couplets 1..n-1 are found (n = 1: a new story). Not used by the game. */
    jumpTo(n) {
      st = newStory();
      for (let k = 1; k < n && k <= COUPLET_COUNT; k++) {
        const c = coupletOf(k);
        if (!c) break;
        st = { ...st, flags: { ...st.flags, [FLAGS.couplet(k)]: true, ...(k >= 6 ? { [FLAGS.isletOpen]: true } : {}), ...(n >= 7 ? { [FLAGS.boatReady]: true } : {}) }, couplets: [...st.couplets, k], step: k + 1, dreamCaught: dreamOf(k) ? [...st.dreamCaught, dreamOf(k).species.id] : st.dreamCaught };
      }
      emit('load');
    },
  };
  return S;
}
