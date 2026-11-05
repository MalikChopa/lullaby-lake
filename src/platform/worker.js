// Offline support: registers sw.js (the service worker at the project root). Only on https, or on this machine over http
// (127.0.0.1 / localhost); never from a file:// page. A registration that fails is silent: the game does not need the worker.
// ?nosw=1 removes the worker and its caches (handy while developing: the worker serves files from its cache first).

/** True when this page may use a service worker. `loc` = { protocol, hostname }. */
export function canRegister(loc) {
  if (!loc) return false;
  if (loc.protocol === 'https:') return true;
  return loc.protocol === 'http:' && (loc.hostname === '127.0.0.1' || loc.hostname === 'localhost' || loc.hostname === '[::1]');
}

/**
 * Registers './sw.js' once the page has loaded (so it never competes with the first picture).
 * @param {{ win: object, nav: object, loc: object, enabled?: boolean, remove?: boolean }} o
 */
export function setupWorker({ win, nav, loc, enabled = true, remove = false }) {
  if (!nav || !('serviceWorker' in nav) || !canRegister(loc)) return false;
  const go = () => {
    try {
      if (remove) {
        // Only this page's own worker: on a shared origin (github.io) other projects keep theirs.
        const here = loc.href ? new URL('./', loc.href).href : null;
        nav.serviceWorker.getRegistrations().then((list) => list.filter((r) => !here || r.scope === here).forEach((r) => r.unregister())).catch(() => {});
        if (win.caches) win.caches.keys().then((keys) => keys.filter((k) => k.startsWith('lullaby-lake-')).forEach((k) => win.caches.delete(k))).catch(() => {});
      } else if (enabled) {
        nav.serviceWorker.register('./sw.js').catch(() => {});
      }
    } catch {
      /* the game does not depend on it */
    }
  };
  if (win.document && win.document.readyState === 'complete') go();
  else win.addEventListener('load', go, { once: true });
  return true;
}
