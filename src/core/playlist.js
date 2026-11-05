// Order of the recorded tracks (J6 part D). Pure: ids and a seeded random stream in, ids out.
// The tracks are played in a shuffled order, round after round, and the same track is never played twice in a row (also across
// the end of one round and the start of the next). A track that failed to load can be dropped (`fail`): the others go on; the only
// way to hear the same track twice in a row is when it is the only one left.

/** Fisher-Yates on a copy. */
function shuffled(list, rng) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * @param {{ids:string[], rng:()=>number}} o
 */
export function createPlaylist({ ids, rng }) {
  const all = ids.slice();
  const failed = new Set();
  let queue = [];
  let last = null;

  function refill() {
    const usable = all.filter((id) => !failed.has(id));
    let round = shuffled(usable, rng);
    // a new round never starts with the track that just ended (swap it with the second one)
    if (round.length > 1 && round[0] === last) [round[0], round[1]] = [round[1], round[0]];
    queue = round;
  }

  return {
    /** The next track id, or null when every track has failed. */
    next() {
      queue = queue.filter((id) => !failed.has(id));
      if (queue.length === 0) refill();
      if (queue.length === 0) return null;
      if (queue.length > 1 && queue[0] === last) [queue[0], queue[1]] = [queue[1], queue[0]];
      last = queue.shift();
      return last;
    },
    /** A track that cannot be loaded or decoded leaves the rotation. */
    fail(id) {
      failed.add(id);
    },
    /** Forgets the failures (the style is chosen again: a new try). */
    retry() {
      failed.clear();
      queue = [];
    },
    get left() {
      return all.filter((id) => !failed.has(id)).length;
    },
    get last() {
      return last;
    },
  };
}
