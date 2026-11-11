// The screen-reader voice of the HD-2D game (brief 33): ONE polite live region (#live), each event said once, nothing lost, no flood.
//   - lines said in the same short window (a catch, its milestone and a found couplet arrive in the same frame) are JOINED into one message ("a · b · c"),
//     where the 2D game's announcer kept only the last one;
//   - the same line said again within `repeatMs` is dropped (a toast and its announcement, a panel that refreshes twice);
//   - the region is emptied, then filled a moment later, so a screen reader hears a line even when it is the same text as the previous one (a second sale).
// `createLineQueue` is pure (unit-tested with a fake clock); `createAnnouncer` is the small DOM part.

/** Pure: collects lines and says when to flush. `now()` in ms. */
export function createLineQueue({ windowMs = 120, repeatMs = 1500, maxLen = 400 } = {}) {
  let pending = [];
  const recent = new Map(); // line -> when it was last said
  return {
    /** Adds a line; returns false when it is dropped (empty, or said very recently, or already waiting). */
    add(text, now) {
      const s = String(text || '').trim();
      if (!s) return false;
      const at = recent.get(s);
      if (at !== undefined && now - at < repeatMs) return false;
      if (pending.includes(s)) return false;
      pending.push(s);
      return true;
    },
    /** The message to say now (the waiting lines joined), or '' when none. */
    flush(now) {
      if (!pending.length) return '';
      const lines = pending;
      pending = [];
      for (const s of lines) recent.set(s, now);
      for (const [s, t] of recent) if (now - t > repeatMs * 4) recent.delete(s);
      let msg = lines.join(' · ');
      if (msg.length > maxLen) msg = msg.slice(0, maxLen - 1) + '…';
      return msg;
    },
    waiting: () => pending.slice(),
    windowMs,
  };
}

/** The live region. Same interface as the 2D game's announcer (say, text). */
export function createAnnouncer(el, { now = () => performance.now(), later = (fn, ms) => setTimeout(fn, ms), ...o } = {}) {
  const q = createLineQueue(o);
  let timer = null;
  let last = '';
  return {
    say(text) {
      if (!q.add(text, now())) return;
      if (timer) return;
      timer = later(() => {
        timer = null;
        const msg = q.flush(now());
        if (!msg) return;
        last = msg;
        el.textContent = '';
        later(() => {
          el.textContent = msg;
        }, 30);
      }, q.windowMs);
    },
    get text() {
      return el.textContent;
    },
    /** The last message given to the region (the checks read it). */
    last: () => last,
  };
}
