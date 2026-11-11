// Start-up of the save side (J9-A), pure of the DOM: the storage door, the HD-2D save loaded once, the settings, the seed and the session count, and the
// one-time offer to import a 2D save. Everything the browser gives (localStorage, a random seed) is injected, so it is unit-tested in Node.
//   ?debug=1            -> its OWN keys (lullaby-lake:hd2d-debug:...), the player's save is never touched
//   ?debug=1&seed=N     -> a reproducible test: a memory storage, nothing is read or written
//   the 2D game's key (lullaby-lake:save) is only READ, once, to build the import offer; it is never written or removed.

import { createStorage, createMemoryBackend } from '../../../src/platform/storage.js';
import { parseDebug } from '../../../src/platform/debug.js';
import { createHdPersist } from './persist.js';
import { HD_NS, HD_DEBUG_NS, KEY_2D, QUALITIES, newHdSave, defaultHdSettings, importFrom2d } from './save.js';

const LEGACY_QUALITY_KEY = 'lullaby-lake:hd2d-quality'; // J8 kept the tier choice alone under this key

/**
 * @param {{ search: string, getBackend: () => object, randomSeed: () => number, onNotice?: (kind: string) => void }} o
 * @returns {{ dbg, memoryOnly, storage, persist, loaded, save, sessions, seed, settings, offer, take(kind), keys }}
 *   save: the save object in use (a new one when nothing usable was stored); offer: { save, books } when a 2D save can be imported, else null;
 *   take(): applies the offer (the 2D carnet + settings replace the new save's) and returns the new save.
 */
export function boot({ search, getBackend, randomSeed, onNotice = () => {} }) {
  const dbg = parseDebug(search);
  const memoryOnly = dbg.debug && dbg.seed !== null;
  const storage = memoryOnly ? createStorage(createMemoryBackend, { probe: false }) : createStorage(getBackend);
  const pending = [];
  let hook = (kind) => pending.push(kind);
  const persist = createHdPersist({ storage, ns: dbg.debug ? HD_DEBUG_NS : HD_NS, onNotice: (k) => hook(k) });
  const loaded = persist.load();
  const seed = dbg.seed ?? (loaded.save ? loaded.save.seed : randomSeed());
  let save = loaded.save || newHdSave(seed);
  const sessions = memoryOnly ? 0 : save.sessions + 1;
  // a first HD-2D visit may carry the quality chosen in J8 (own key, read only)
  if (!loaded.save && !memoryOnly && !dbg.debug) {
    const q0 = storage.get(LEGACY_QUALITY_KEY);
    const q = q0 === 'ultra' ? 'high' : q0; // (ultra removed on 2026-11-10)
    if (QUALITIES.includes(q)) save = { ...save, settings: { ...save.settings, quality: q } };
  }
  // the import offer: only on a brand new game (no HD-2D save at all), outside the debug runs, when the storage really works
  let offer = null;
  if (loaded.status === 'new' && !dbg.debug && storage.mode === 'local') {
    const r = importFrom2d(storage.get(KEY_2D), seed);
    if (r.status === 'ok') offer = { save: r.save, books: r.books };
  }
  const B = {
    dbg,
    memoryOnly,
    storage,
    persist,
    loaded,
    save,
    sessions,
    seed,
    settings: { ...defaultHdSettings(), ...save.settings },
    offer,
    /** Replaces the new save by the imported one (carnet and settings only). Nothing is written here: the shell writes the HD-2D key as usual. */
    take() {
      if (!B.offer) return B.save;
      B.save = { ...B.offer.save, seed };
      B.settings = { ...defaultHdSettings(), ...B.save.settings };
      B.offer = null;
      return B.save;
    },
    /** Notices raised while loading are given to the first listener; later ones go to it directly. */
    listen(fn) {
      hook = fn;
      pending.splice(0).forEach(fn);
    },
    keys: persist.keys,
  };
  void onNotice;
  return B;
}
