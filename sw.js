// Lullaby Lake, site root: RETIREMENT worker (2026-11-11). The 2D game that used to live at the site root had a cache-first worker here
// (caches "lullaby-lake-<version>"). The site now opens the HD-2D game (refonte/, its own worker and caches "lullaby-hd2d-<version>").
// Browsers re-check this file on navigation: this version takes over at once, deletes ONLY the old 2D caches, removes itself and reloads the
// open tabs, which then get the new root page from the network (it sends them to refonte/). It answers no request.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('lullaby-lake-')).map((k) => caches.delete(k))))
      .then(() => self.registration.unregister())
      .then(() => self.clients.matchAll({ type: 'window' }))
      .then((list) => Promise.all(list.map((c) => (c.navigate ? c.navigate(c.url).catch(() => {}) : null))))
      .catch(() => {}),
  );
});
