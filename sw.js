// Lullaby Lake service worker: keeps the whole static site in one cache so the game starts without a network after the first visit.
// - install: stores every file of FILES (asked again from the server, never from an old HTTP cache) in the cache of this VERSION.
// - fetch: same-origin GET only, cache first; a page address (also with ?debug=1 or any query) falls back on index.html;
//   a file missing from the cache goes to the network once (the only network call of this file).
// - the three recorded music tracks (MUSIC, J6 part D) are NOT stored at install (6.5 MB: the first visit stays small). They are stored the
//   first time they are asked for AND answered in full (status 200, not a page, no Range header), in the same versioned cache, then served
//   from it (offline too). Nothing else can be stored at run time: the list is data, matched on the exact address (no query).
//   A Range request (media elements ask for byte ranges; the game itself uses fetch, which does not) is answered with a correct 206/416 from the
//   cached copy; a Range request on a track that is not cached goes to the network and is not stored.
// - activate: deletes the caches of other versions. No skipWaiting, no claim: a new version starts at the NEXT launch, never in the
//   middle of a game.
// FILES, MUSIC and VERSION are written by `node tools/site-files.mjs --write` (npm run sw); tests/sw.test.js fails if they are stale.
// Nothing is ever sent anywhere and no other site is contacted.

const VERSION = '2f58c7729c4f';
// BEGIN FILES (written by tools/site-files.mjs --write; tests/sw.test.js checks it)
const FILES = [
  './',
  './index.html',
  './src/art/anglerPaint.js',
  './src/art/catPaint.js',
  './src/art/compose.js',
  './src/art/critterPaint.js',
  './src/art/dither.js',
  './src/art/fishPaint.js',
  './src/art/framePaint.js',
  './src/art/overlayPaint.js',
  './src/art/painter.js',
  './src/art/palette.js',
  './src/art/raster.js',
  './src/art/sceneBake.js',
  './src/art/skyPaint.js',
  './src/art/waterPaint.js',
  './src/audio/engine.js',
  './src/audio/hooks.js',
  './src/audio/noise.js',
  './src/audio/trackLoader.js',
  './src/core/audioMix.js',
  './src/core/clock.js',
  './src/core/collection.js',
  './src/core/critters.js',
  './src/core/crossfade.js',
  './src/core/fishDraw.js',
  './src/core/fishing.js',
  './src/core/game.js',
  './src/core/lang.js',
  './src/core/look.js',
  './src/core/playlist.js',
  './src/core/rng.js',
  './src/core/save.js',
  './src/core/sizeRoll.js',
  './src/core/sky.js',
  './src/core/toast.js',
  './src/core/validate.js',
  './src/core/weather.js',
  './src/data/audio.js',
  './src/data/config.js',
  './src/data/critters.js',
  './src/data/fishSprites.js',
  './src/data/icons.js',
  './src/data/palettes.js',
  './src/data/sky.js',
  './src/data/species.js',
  './src/data/strings.en.js',
  './src/data/strings.fr.js',
  './src/data/weather.js',
  './src/input/input.js',
  './src/main.js',
  './src/platform/debug.js',
  './src/platform/perf.js',
  './src/platform/persist.js',
  './src/platform/storage.js',
  './src/platform/worker.js',
  './src/render/angler.js',
  './src/render/backdrop.js',
  './src/render/layers.js',
  './src/render/photo.js',
  './src/render/pixi.js',
  './src/render/stage.js',
  './src/styles.css',
  './src/ui/announce.js',
  './src/ui/book.js',
  './src/ui/frames.js',
  './src/ui/hud.js',
  './src/ui/i18n.js',
  './src/ui/icons.js',
  './src/ui/rarity.js',
  './src/ui/screens.js',
  './src/ui/settings.js',
  './vendor/fonts/pixelify-sans/pixelify-sans-latin-400-normal.woff2',
  './vendor/pixi/pixi.min.mjs',
];
// run-time cache only (see the top of this file): the recorded tracks
const MUSIC = [
  './assets/music/chill-lofi-inspired.mp3',
  './assets/music/lofi-again.ogg',
  './assets/music/lofi-hip-hop-loop.ogg',
];
// END FILES
const CACHE_PREFIX = 'lullaby-lake-';
const CACHE_NAME = CACHE_PREFIX + VERSION;
const MUSIC_URLS = MUSIC.map((f) => new URL(f, self.location.href).href);

function network(request) {
  return fetch(request);
}

/** '206' answer for a Range header on a full cached response; the whole response when the header is not a single simple range. */
function slice(hit, range) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(String(range).trim());
  if (!m || (m[1] === '' && m[2] === '')) return Promise.resolve(hit);
  return hit.arrayBuffer().then((buf) => {
    const size = buf.byteLength;
    let start;
    let end;
    if (m[1] === '') {
      start = Math.max(0, size - Number(m[2]));
      end = size - 1;
    } else {
      start = Number(m[1]);
      end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);
    }
    const type = (hit.headers && hit.headers.get('Content-Type')) || 'application/octet-stream';
    if (start >= size || start > end) return new Response(null, { status: 416, headers: { 'Content-Range': 'bytes */' + size } });
    const body = buf.slice(start, end + 1);
    return new Response(body, { status: 206, statusText: 'Partial Content', headers: { 'Content-Type': type, 'Content-Length': String(body.byteLength), 'Content-Range': 'bytes ' + start + '-' + end + '/' + size, 'Accept-Ranges': 'bytes' } });
  });
}

function music(event) {
  const request = event.request;
  const range = request.headers && request.headers.get ? request.headers.get('range') : null;
  return caches.open(CACHE_NAME).then((cache) =>
    cache.match(request.url).then((hit) => {
      if (hit) return range ? slice(hit, range) : hit;
      return network(request).then((res) => {
        const type = (res.headers && res.headers.get && res.headers.get('Content-Type')) || '';
        if (!range && res.ok && res.status === 200 && !/^text\//i.test(type)) {
          const stored = cache.put(request.url, res.clone()).catch(() => {}); // a full quota or a closed cache never breaks the playback
          if (event.waitUntil) event.waitUntil(stored);
        }
        return res;
      });
    }),
  );
}

function answer(request) {
  const isPage = request.mode === 'navigate';
  return caches.open(CACHE_NAME).then((cache) =>
    cache.match(request, { ignoreSearch: isPage }).then((hit) => {
      if (hit) return hit;
      if (isPage) return cache.match('./index.html').then((page) => page || network(request));
      return network(request);
    }),
  );
}

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(FILES.map((f) => new Request(f, { cache: 'reload' })))));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE_NAME).map((k) => caches.delete(k)))),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  if (new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(MUSIC_URLS.includes(request.url) ? music(event) : answer(request));
});
