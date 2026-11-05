// Sound hooks: the game says which sound it wants (`play(name)`); this counts them (tests prove "no sound when the fish leaves",
// "one signal per bite") and forwards them to the audio engine when there is one (J3). The count does not depend on the engine:
// it is the same with the sound muted or not started.

export function createAudioHooks({ engine = null } = {}) {
  const log = []; // the last 500 names only: a long session must not keep a growing list
  let count = 0;
  return {
    /** Called by the game for each sound it wants. */
    play(name) {
      log.push(name);
      count++;
      if (log.length > 500) log.shift();
      if (engine) engine.sfx(name);
    },
    get count() {
      return count;
    },
    log,
  };
}
