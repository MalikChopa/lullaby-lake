// Offline support of the HD-2D game (brief 34): registers refonte/sw.js, whose scope is the refonte/ folder.
//
// WHEN the worker is registered (decided for this project, see docs/public-refonte/PLAN.md):
//   - on https (the published site) on a normal page; never on a debug page (?debug=1, ?perf=1), like the 2D game;
//   - on this machine (http://127.0.0.1, localhost) ONLY with ?sw=1: the HD-2D game is still being written, and a worker serves files from its
//     cache first: on a plain local visit it would hide every edit until the next `npm run sw:refonte`. The checks (j7 to j19) never pass ?sw=1,
//     so they never meet a worker; tools/check-j20.mjs does;
//   - never on file:, never on another http host (a worker needs a secure context);
//   - only once the 3D game has started (main.js calls it after app.start), so it never competes with the first picture, and a browser without
//     WebGL 2 (the fallback page) does not download three.js and the models for nothing.
// ?nosw=1 removes THIS worker (scope refonte/ only) and THIS game's caches ("lullaby-hd2d-..."); the 2D game's worker and caches stay.
//
// THE 2D GAME'S WORKER (../sw.js, scope = the site root, so it also covers refonte/): a visitor who played the 2D game first has it, and on the
// first visit to refonte/ it answers that page address with ITS OWN cached index.html (its page fallback). That page then loads ./src/main.js,
// i.e. THIS game's main.js, on a page that is not ours. main.js calls rescueForeignPage() first: it registers this game's worker (the scope
// refonte/ is longer, so from then on it is the one that controls refonte/ pages) and reloads once. Guarded against loops (sessionStorage), and
// a short FR/EN message is shown instead of a broken page. Once both workers exist, each one controls its own pages.
// Every browser object is injected: the whole module runs in Node (tests/refonte-offline.test.js).

/** This game's cache names start with this; the 2D game's start with "lullaby-lake-" (never touched here). */
export const CACHE_PREFIX = 'lullaby-hd2d-';
export const RESCUE_KEY = 'lullaby-hd2d:rescue';

/** The worker script and its scope, from the URL of this module (refonte/src/offline.js -> refonte/sw.js, scope refonte/). */
export function workerUrls(moduleUrl = import.meta.url) {
  return { script: new URL('../sw.js', moduleUrl).href, scope: new URL('../', moduleUrl).href };
}

/** True when this page may use a service worker at all. `loc` = { protocol, hostname }. */
export function canRegister(loc) {
  if (!loc) return false;
  if (loc.protocol === 'https:') return true;
  return loc.protocol === 'http:' && (loc.hostname === '127.0.0.1' || loc.hostname === 'localhost' || loc.hostname === '[::1]');
}

/**
 * What to do on this page: 'register', 'remove' or 'none'.
 * @param {{ protocol: string, hostname: string }} loc
 * @param {URLSearchParams} query
 */
export function workerPolicy(loc, query) {
  if (!canRegister(loc)) return 'none';
  if (query.get('nosw') === '1') return 'remove';
  if (query.get('sw') === '1') return 'register';
  if (loc.protocol === 'https:' && !query.has('debug') && !query.has('perf')) return 'register';
  return 'none';
}

/** True when the document is the HD-2D page (its import map maps "three"); false for the 2D game's page served at this address by its worker. */
export function isOurPage(doc) {
  try {
    const map = doc && doc.querySelector && doc.querySelector('script[type="importmap"]');
    return !!(map && /"three"\s*:/.test(map.textContent || ''));
  } catch {
    return false;
  }
}

/** Removes this game's worker (only the registration whose scope is refonte/) and this game's caches (only "lullaby-hd2d-..."). */
export function removeWorker({ nav, win, scope }) {
  const jobs = [];
  try {
    jobs.push(nav.serviceWorker.getRegistrations().then((list) => Promise.all(list.filter((r) => r.scope === scope).map((r) => r.unregister()))).catch(() => {}));
    if (win.caches) jobs.push(win.caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith(CACHE_PREFIX)).map((k) => win.caches.delete(k)))).catch(() => {}));
  } catch {
    /* the game does not depend on it */
  }
  return Promise.all(jobs);
}

/**
 * Registers or removes the worker, once the page has loaded. Never throws, never blocks the game.
 * @param {{ win: object, nav: object, loc: object, query: URLSearchParams, moduleUrl?: string }} o
 * @returns {'register'|'remove'|'none'} what was decided
 */
export function setupOffline({ win, nav, loc, query, moduleUrl = import.meta.url }) {
  if (!nav || !('serviceWorker' in nav)) return 'none';
  const what = workerPolicy(loc, query);
  if (what === 'none') return what;
  const { script, scope } = workerUrls(moduleUrl);
  const go = () => {
    try {
      if (what === 'remove') removeWorker({ nav, win, scope });
      else nav.serviceWorker.register(script, { scope }).catch(() => {});
    } catch {
      /* the game does not depend on it */
    }
  };
  if (win.document && win.document.readyState === 'complete') go();
  else win.addEventListener('load', go, { once: true });
  return what;
}

/** Waits until a registration has an active worker (activated), or rejects after `ms`. */
export function whenActive(reg, ms = 60000, timers = globalThis) {
  return new Promise((resolve, reject) => {
    const timer = timers.setTimeout(() => reject(new Error('timeout')), ms);
    const done = () => {
      timers.clearTimeout(timer);
      resolve(reg);
    };
    const check = () => {
      if (reg.active && reg.active.state === 'activated') return done();
      const w = reg.installing || reg.waiting || reg.active;
      if (!w) return reject(new Error('no worker'));
      w.addEventListener('statechange', () => {
        if (w.state === 'redundant') {
          timers.clearTimeout(timer);
          reject(new Error('install failed'));
        } else check();
      }, { once: true });
    };
    check();
  });
}

const MSG = {
  wait: ['Le lac se prépare…', 'The lake is getting ready…'],
  offline: ['Le lac en HD-2D n’est pas encore gardé sur cet appareil : reconnecte-toi une fois, puis recharge la page.', 'The HD-2D lake is not stored on this device yet: go online once, then reload the page.'],
  stuck: ['Le lac n’a pas pu se préparer. Recharge la page (Ctrl+Maj+R).', 'The lake could not get ready. Reload the page (Ctrl+Shift+R).'],
};
function say(doc, key) {
  try {
    const body = doc.body || doc.documentElement;
    body.textContent = '';
    const box = doc.createElement('div');
    box.setAttribute('role', 'status');
    box.style.cssText = 'font:18px/1.5 system-ui,sans-serif;max-width:36em;margin:15vh auto;padding:1em;color:#f3e9d2;background:#1d2433;border-radius:8px';
    for (const [i, text] of MSG[key].entries()) {
      const p = doc.createElement('p');
      p.lang = i === 0 ? 'fr' : 'en';
      p.textContent = text;
      box.appendChild(p);
    }
    if (key !== 'wait') {
      const a = doc.createElement('a');
      a.href = './';
      a.textContent = 'Réessayer / Try again';
      a.style.color = '#f3e9d2';
      box.appendChild(a);
    }
    body.appendChild(box);
  } catch {
    /* nothing more to do */
  }
}

/**
 * Called first by main.js. On our own page: forgets a past rescue and returns false (the game starts as usual). On a page that is not ours (the
 * 2D game's worker answered this address, see the top of this file): registers this game's worker, waits for it, reloads once; returns true and
 * main.js stops there (nothing of the game runs on a foreign page: no save is read or written).
 * @param {{ doc: object, nav: object, loc: object, store?: object, reload?: Function, moduleUrl?: string, timers?: object }} o
 * @returns {boolean}
 */
export function rescueForeignPage({ doc, nav, loc, store, reload, moduleUrl = import.meta.url, timers = globalThis }) {
  if (isOurPage(doc)) {
    try {
      store && store.removeItem(RESCUE_KEY);
    } catch {
      /* private browsing */
    }
    return false;
  }
  let tries = 0;
  try {
    tries = Number(store && store.getItem(RESCUE_KEY)) || 0;
    store && store.setItem(RESCUE_KEY, String(tries + 1));
  } catch {
    tries = 0;
  }
  if (tries >= 2 || !nav || !('serviceWorker' in nav) || !canRegister(loc)) {
    say(doc, 'stuck');
    return true;
  }
  say(doc, 'wait');
  const { script, scope } = workerUrls(moduleUrl);
  Promise.resolve()
    .then(() => nav.serviceWorker.register(script, { scope }))
    .then((reg) => whenActive(reg, 60000, timers))
    .then(() => reload())
    .catch(() => say(doc, nav.onLine === false ? 'offline' : 'stuck'));
  return true;
}
