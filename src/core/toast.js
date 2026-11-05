// Short text lines that tell the player what changed in the world (phase, weather). Pure: time comes in as dt.
// A line stays 3 s, never needs a click; if several changes come at once they are shown one after the other (at most 2 waiting).

/** Text key of a game event, or null when the event is not announced. */
export function announceKey(event) {
  if (event.type === 'phaseChanged') return 'announce.phase.' + event.phase;
  if (event.type === 'weatherChanged') return 'announce.weather.' + event.weather;
  return null;
}

export function createToasts({ durationS = 3, maxWaiting = 2 } = {}) {
  let current = null;
  let leftS = 0;
  const waiting = [];
  return {
    /** Adds a line (ignored if it is already the current or the last waiting one). Returns true when it shows right away. */
    push(key) {
      if (!key || key === current || waiting[waiting.length - 1] === key) return false;
      if (current === null) {
        current = key;
        leftS = durationS;
        return true;
      }
      waiting.push(key);
      while (waiting.length > maxWaiting) waiting.shift();
      return false;
    },
    /** Moves time forward; returns true when the displayed line changed. */
    tick(dt) {
      if (current === null) return false;
      leftS -= dt;
      if (leftS > 0) return false;
      current = waiting.length ? waiting.shift() : null;
      leftS = durationS;
      return true;
    },
    get current() {
      return current;
    },
    get leftS() {
      return leftS;
    },
    get waiting() {
      return waiting.slice();
    },
  };
}
