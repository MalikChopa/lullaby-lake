// The save door: loads once at start, writes on demand, and protects what is stored (ARCHITECTURE section 8).
//   keys     <ns>save  (current)   <ns>save.bak  (the version before the last write)   <ns>save.corrupt  (a damaged text, kept)
//   load()   -> { save, status } ; status 'new' | 'ok' | 'restored' (damaged, the .bak was used) | 'fresh' (damaged, no usable .bak)
//              | 'future' (written by a later game version: never touched) | 'memory' (storage unavailable)
//   write()  -> true when stored ; false when refused: read-only (future / other tab), invalid, or storage gone
// It never throws. Pure of the DOM: `storage` is platform/storage.js (or a fake in tests).

import { parseSave, serialize } from '../core/save.js';

export function createPersist({ storage, ns = 'lullaby-lake:', onNotice = () => {} }) {
  const KEY = ns + 'save';
  const BAK = ns + 'save.bak';
  const BAD = ns + 'save.corrupt';
  let readOnly = null; // null | 'future' | 'other-tab'
  let seen; // the text we last read or wrote under KEY (null = nothing); undefined before load()
  let notifiedMemory = false;

  const notice = (kind) => {
    try {
      onNotice(kind);
    } catch {
      /* ignore */
    }
  };
  const noticeMemory = () => {
    if (notifiedMemory) return;
    notifiedMemory = true;
    notice('memory');
  };

  return {
    keys: { main: KEY, bak: BAK, corrupt: BAD },
    get readOnly() {
      return readOnly;
    },

    /** Reads the save. Never writes (the first write is the caller's `write`). */
    load() {
      const text = storage.get(KEY);
      seen = text;
      if (storage.mode === 'memory') noticeMemory();
      if (text === null) return { save: null, status: storage.mode === 'memory' ? 'memory' : 'new' };
      const r = parseSave(text);
      if (r.status === 'ok') return { save: r.save, status: storage.mode === 'memory' ? 'memory' : 'ok' };
      if (r.status === 'future') {
        readOnly = 'future';
        notice('future');
        return { save: null, status: 'future', version: r.version };
      }
      // damaged: keep a copy of the text, then try the previous version
      storage.set(BAD, text);
      const bak = storage.get(BAK);
      if (bak !== null) {
        const b = parseSave(bak);
        if (b.status === 'ok') {
          notice('restored');
          return { save: b.save, status: 'restored' };
        }
      }
      notice('fresh');
      return { save: null, status: 'fresh' };
    },

    /** Another tab changed the save (storage event): this page stops writing. Returns true the first time. */
    otherTab() {
      if (readOnly) return false;
      readOnly = 'other-tab';
      notice('other-tab');
      return true;
    },

    /** Stores the save: serialise, check that it reads back, keep the previous good text as .bak, write. */
    write(save) {
      if (readOnly) return false;
      let text;
      try {
        text = serialize(save);
      } catch {
        return false;
      }
      const back = parseSave(text);
      if (back.status !== 'ok') return false; // never store something we could not read again
      if (text === seen) return true; // unchanged
      const cur = storage.get(KEY);
      if (cur !== null && cur !== seen) {
        // the stored text is not the one we know: someone else wrote (a second tab) or a later version did
        const other = parseSave(cur);
        readOnly = other.status === 'future' ? 'future' : 'other-tab';
        notice(readOnly);
        return false;
      }
      if (cur !== null && parseSave(cur).status === 'ok') storage.set(BAK, cur);
      const ok = storage.set(KEY, text);
      if (storage.mode === 'memory') noticeMemory();
      if (!ok) return false;
      seen = text;
      return true;
    },

    /** Tests and the debug hook: what is stored right now. */
    peek() {
      return { main: storage.get(KEY), bak: storage.get(BAK), corrupt: storage.get(BAD) };
    },
  };
}
