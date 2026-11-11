// The first-time coach (brief 27): a few small tips, each shown ONCE per save, dismissible, never blocking. Pure logic (unit-tested): the shell wires it to the
// save and to the screen. Where it is saved: the existing `hints` container of the HD-2D save ({ name: true }, shell/save.js: a map of booleans that already
// persists across sessions), under the tip's own name: no new field, no version bump. A tip is "seen" from the moment it is shown.
// 4 to 6 contextual tips: walk, cast, bite (reel), shop (sell), book (journal), log (story log); the older one-time notes (worn gear, boat) use the same coach.

export const TIPS = Object.freeze({
  walk: 'r.first.walk',
  cast: 'r.first.cast',
  bite: 'tip.bite',
  shop: 'eco.hint.shop',
  book: 'tip.book',
  log: 'tip.log',
  letter: 'story.letter.newToast',
  worn: 'chal.worn.hint',
  boatSeen: 'boat.first',
  boatReady: 'boat.ready.hint',
});
export const TIP_TTL_S = 14; // a tip fades by itself (it never asks for anything)
export const TIP_GAP_S = 1.2; // a short rest between two tips
const MAX_WAITING = 3;

/**
 * @param {{ seen: (id:string)=>boolean, mark: (id:string)=>void }} store  where "seen" lives (the save's hints)
 */
export function createCoach({ seen, mark, ttl = TIP_TTL_S, gap = TIP_GAP_S }) {
  const queue = [];
  let current = null; // { id, key, left }
  let rest = 0;
  const C = {
    /** Asks for a tip. False when it was already seen / is already waiting or showing / the id is unknown. */
    offer(id, key = TIPS[id]) {
      if (!key || seen(id) || (current && current.id === id) || queue.some((q) => q.id === id)) return false;
      if (queue.length >= MAX_WAITING) return false;
      queue.push({ id, key });
      return true;
    },
    /** dt in seconds; `ok` = the game is in a quiet moment (playing, no card, no dialogue, not in a fight). Returns the tip to show now, or null. */
    step(dt, ok = true) {
      if (current) {
        current.left -= dt;
        if (current.left <= 0) C.dismiss();
      } else if (rest > 0) rest -= dt;
      if (!current && ok && rest <= 0 && queue.length) {
        const n = queue.shift();
        if (!seen(n.id)) {
          mark(n.id);
          current = { id: n.id, key: n.key, left: ttl };
        }
      }
      return current ? { id: current.id, key: current.key } : null;
    },
    dismiss() {
      if (!current) return false;
      current = null;
      rest = gap;
      return true;
    },
    current: () => (current ? { id: current.id, key: current.key } : null),
    waiting: () => queue.map((q) => q.id),
    /** The action the tip speaks of was done (the player walked, cast...): the tip goes away at once. */
    done(id) {
      if (current && current.id === id) return C.dismiss();
      const i = queue.findIndex((q) => q.id === id);
      if (i >= 0) {
        queue.splice(i, 1);
        if (!seen(id)) mark(id);
      }
      return false;
    },
  };
  return C;
}
