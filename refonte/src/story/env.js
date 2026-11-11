// The bridge between the live game and the pure story code (J12-A), pure: builds the snapshot the conditions read, the variables of the lines, the hint of the
// current couplet, the cat's seat and the floating line of Le Dormeur. Nothing here touches the DOM, the clock or a random generator (a number in [0, 1) is passed in).
import { COUPLETS, STORY_SPOTS, AMBIENT, COUPLET_COUNT } from '../data/story.js';
import { BOAT_UNLOCK } from '../data/boat.js';
import { pickAmbient } from './dialogue.js';

/**
 * The environment of the conditions and the variables of the lines.
 * @param {{ story: object, world: {phase: string, weather: string}, eco: object, t: (k: string, p?: object) => string }} o  story = the engine's get(), eco = the economy state
 */
export function dialogueEnv({ story, world, eco, t }) {
  const cur = COUPLETS.find((c) => c.n === story.step) || null;
  return {
    flags: story.flags,
    step: story.step,
    couplets: story.couplets,
    seen: new Set(story.dialogueSeen),
    phase: world.phase,
    weather: world.weather,
    money: eco.money,
    fish: eco.bucket.length,
    rod: Math.max(...eco.gear.rods),
    lantern: !!eco.gear.lantern,
    baits: eco.gear.baits,
    vars: {
      n: story.couplets.length,
      total: COUPLETS.length,
      title: cur ? t(`story.couplet.${cur.n}.title`) : '',
      hint: cur ? t(hintKeyOf(story)) : t('story.hint.none'),
      fishNeed: BOAT_UNLOCK.fish,
      pearlsNeed: BOAT_UNLOCK.pearls,
      fishHave: eco.bucket.length,
    },
  };
}

/** The text key of the hint of the current couplet: couplet 6 says first that the boat is not ready (J12-B), the others say where. */
export const hintKeyOf = (story) => (story.step === 6 && !story.flags['boat.ready'] ? 'story.couplet.6.hintNoBoat' : `story.couplet.${story.step}.hint`);

/** The place the cat sits at when it hints the next couplet: { x, z, spot, islet } or null when no couplet is current (islet = its seat once the angler is on the islet). */
export function catSeat(story) {
  const c = COUPLETS.find((x) => x.n === story.step);
  return c ? { x: c.catSeat[0], z: c.catSeat[1], spot: c.spot, islet: c.isletSeat || null } : null;
}

/** Text key of the greeting in the shop for a story state (one per step, from 1; the last one for every later step). */
export const greetingKey = (story) => (story.flags['finale.done'] ? 'story.d.ondine.greet.fin' : `story.d.ondine.greet.${Math.max(1, Math.min(8, story.step))}`);

/** The floating line of Le Dormeur: only at night (or dusk) near the place of the current couplet (within `radius` m); null otherwise. Returns { id, key, x, z }. */
export function dormeurLine(story, world, player, lastId, r, radius = 14) {
  if (world.phase !== 'night' && world.phase !== 'dusk') return null;
  // after the finale the spirit still murmurs near the islet
  const c = COUPLETS.find((x) => x.n === story.step) || (story.flags['finale.done'] ? { spot: 'islet' } : null);
  if (!c) return null;
  const sp = STORY_SPOTS[c.spot];
  if (!sp || Math.hypot(player.x - sp.x, player.z - sp.z) > radius) return null;
  const env = { flags: story.flags, step: story.step, couplets: story.couplets, phase: world.phase, weather: world.weather, seen: [] };
  const p = pickAmbient(AMBIENT.dormeur, env, lastId, r);
  return p ? { id: p.id, key: p.key, x: sp.over[0], z: sp.over[1] } : null;
}

/** The ambient line of a character for the live state: { id, key } or null. `lastId` is the id given last time (never twice in a row). */
export const ambientFor = (character, env, lastId, r) => pickAmbient(AMBIENT[character] || [], env, lastId, r);

/** Is the couplet number valid for this version of the story? */
export const hasCouplet = (n) => Number.isInteger(n) && n >= 1 && n <= COUPLET_COUNT && COUPLETS.some((c) => c.n === n);
