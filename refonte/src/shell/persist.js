// The save door of the HD-2D game: the same behaviour as src/platform/persist.js (load once, write on demand, .bak, .corrupt, a later version or
// a second tab makes it read-only, nothing throws) but with an injected codec, so that the HD-2D format (shell/save.js) is the one read and written.
//   keys     <ns>save  <ns>save.bak  <ns>save.corrupt
//   load()   -> { save, status } ; status 'new' | 'ok' | 'restored' | 'fresh' | 'future' | 'memory'
//   write()  -> true when stored ; false when refused (read-only, invalid, storage gone)

import { hdCodec } from './save.js';

export function createHdPersist({ storage, ns, codec = hdCodec, onNotice = () => {} }) {
  const KEY = ns + 'save';
  const BAK = ns + 'save.bak';
  const BAD = ns + 'save.corrupt';
  let readOnly = null; // null | 'future' | 'other-tab'
  let seen; // the text last read or written under KEY (null = nothing)
  let notifiedMemory = false;
  const notice = (kind) => {
    try {
      onNotice(kind);
    } catch {
      /* a failing listener must not break the game */
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
    load() {
      const text = storage.get(KEY);
      seen = text;
      if (storage.mode === 'memory') noticeMemory();
      if (text === null) return { save: null, status: storage.mode === 'memory' ? 'memory' : 'new' };
      const r = codec.parse(text);
      if (r.status === 'ok') return { save: r.save, status: storage.mode === 'memory' ? 'memory' : 'ok' };
      if (r.status === 'future') {
        readOnly = 'future';
        notice('future');
        return { save: null, status: 'future', version: r.version };
      }
      storage.set(BAD, text);
      const bak = storage.get(BAK);
      if (bak !== null) {
        const b = codec.parse(bak);
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
    write(save) {
      if (readOnly) return false;
      let text;
      try {
        text = codec.serialize(save);
      } catch {
        return false;
      }
      if (codec.parse(text).status !== 'ok') return false; // never store something we could not read again
      if (text === seen) return true;
      const cur = storage.get(KEY);
      if (cur !== null && cur !== seen) {
        readOnly = codec.parse(cur).status === 'future' ? 'future' : 'other-tab';
        notice(readOnly);
        return false;
      }
      if (cur !== null && codec.parse(cur).status === 'ok') storage.set(BAK, cur);
      const ok = storage.set(KEY, text);
      if (storage.mode === 'memory') noticeMemory();
      if (!ok) return false;
      seen = text;
      return true;
    },
    peek() {
      return { main: storage.get(KEY), bak: storage.get(BAK), corrupt: storage.get(BAD) };
    },
  };
}
