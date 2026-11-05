// localStorage behind a safe door. Never throws: when the browser refuses (private mode, quota, disabled storage) it switches
// to an in-memory copy for the rest of the page and tells the caller once. The game keeps playing, only nothing is kept.
// `getBackend` is a function returning a Storage-like object (getItem / setItem / removeItem) or throwing: tests give a fake.

export function createMemoryBackend() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => void m.set(k, String(v)),
    removeItem: (k) => void m.delete(k),
  };
}

/**
 * @param {() => object} getBackend
 * @param {{ onFail?: (err: unknown) => void, probe?: boolean }} [opts] onFail is called ONCE, at the first failure
 * @returns {{ get(k: string): string | null, set(k: string, v: string): boolean, remove(k: string): void, readonly mode: 'local' | 'memory' }}
 */
export function createStorage(getBackend, { onFail = () => {}, probe = true } = {}) {
  let backend = null;
  let mode = 'local';
  const memory = createMemoryBackend();
  const fail = (err) => {
    if (mode === 'memory') return;
    mode = 'memory';
    backend = memory;
    try {
      onFail(err);
    } catch {
      /* a failing listener must not break the game */
    }
  };
  try {
    backend = getBackend();
    if (!backend) throw new Error('no storage');
    if (probe) {
      // Safari private mode (old) and full quotas only fail on a write: try one now
      backend.setItem('lullaby-lake:probe', '1');
      backend.removeItem('lullaby-lake:probe');
    }
  } catch (err) {
    fail(err);
  }
  const run = (fn, fallback) => {
    try {
      return fn(backend);
    } catch (err) {
      fail(err);
      try {
        return fn(memory);
      } catch {
        return fallback;
      }
    }
  };
  return {
    get: (k) => run((b) => b.getItem(k), null),
    set: (k, v) => {
      if (mode === 'memory') {
        memory.setItem(k, v);
        return true;
      }
      return run((b) => (b.setItem(k, v), true), false);
    },
    remove: (k) => void run((b) => b.removeItem(k), undefined),
    get mode() {
      return mode;
    },
  };
}
