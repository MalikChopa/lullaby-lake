import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { ROOT, siteFiles, siteVersion, workerList, swBlockRegex, renderBlock, musicFiles } from '../tools/site-files.mjs';
import audioData from '../src/data/audio.js';
import { canRegister, setupWorker } from '../src/platform/worker.js';

const SW_SRC = readFileSync(join(ROOT, 'sw.js'), 'utf8');

// ------------------------------------------------------------------ the list of files
function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

function swConstants() {
  const sandbox = { self: { addEventListener() {}, location: { origin: 'http://x', href: 'http://x/sw.js' } }, caches: {}, Request: class {}, fetch() {}, URL };
  const out = vm.runInNewContext(SW_SRC + '\n;({ VERSION, FILES, MUSIC, CACHE_NAME, CACHE_PREFIX })', sandbox);
  return JSON.parse(JSON.stringify(out)); // out of the vm realm: plain arrays for deepEqual
}

test('sw: FILES is exactly "./" + every file reachable from index.html (imports, links, fonts, vendor) - run `npm run sw` after adding a file', () => {
  const { FILES } = swConstants();
  const want = workerList(siteFiles());
  assert.ok(!FILES.some((f) => f.includes('assets/')), 'the music is not in the install list');
  const missing = want.filter((f) => !FILES.includes(f));
  const extra = FILES.filter((f) => !want.includes(f));
  assert.deepEqual({ missing, extra }, { missing: [], extra: [] }, 'sw.js is out of date: run `npm run sw`');
  assert.equal(FILES[0], './', 'the bare address is cached');
  assert.ok(FILES.includes('./index.html'));
});

test('sw: the list covers the things the brief names (index.html, every module, the font, PixiJS, the style sheet)', () => {
  const { FILES } = swConstants();
  for (const f of ['./index.html', './src/main.js', './src/styles.css', './vendor/pixi/pixi.min.mjs', './vendor/fonts/pixelify-sans/pixelify-sans-latin-400-normal.woff2', './src/render/photo.js', './src/platform/persist.js', './src/core/save.js']) {
    assert.ok(FILES.includes(f), f);
  }
});

test('sw: every file under src/ is in the list (a file the scanner cannot see would be missing offline)', () => {
  const { FILES } = swConstants();
  for (const abs of walk(join(ROOT, 'src'))) {
    const rel = './' + relative(ROOT, abs).replace(/\\/g, '/');
    assert.ok(FILES.includes(rel), rel + ' is not cached: is it imported by a module the scanner follows?');
  }
});

test('sw: every file of the list exists (a 404 at install would break the whole worker)', () => {
  const { FILES } = swConstants();
  for (const f of FILES) if (f !== './') assert.ok(statSync(join(ROOT, f)).isFile(), f);
});

test('sw: VERSION is the hash of the site files, so a changed file cannot ship under an old cache name', () => {
  const { VERSION, CACHE_NAME, CACHE_PREFIX } = swConstants();
  assert.equal(VERSION, siteVersion(siteFiles()), 'sw.js is out of date: run `npm run sw`');
  assert.equal(CACHE_NAME, CACHE_PREFIX + VERSION);
  assert.match(VERSION, /^[0-9a-f]{12}$/);
});

test('sw: the generated block of sw.js has the shape the tool rewrites', () => {
  assert.ok(swBlockRegex().test(SW_SRC));
  const block = renderBlock(['index.html', 'src/a.js'], 'abc');
  assert.ok(block.includes("'./',") && block.includes("'./index.html',") && block.includes("'./src/a.js',") && block.includes("VERSION = 'abc'"));
});

test('site-files: the scanner finds imports (multi-line too), CSS urls and html links, and ignores comments about them', () => {
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  assert.ok(/src\/main\.js/.test(html));
  const files = siteFiles();
  assert.ok(files.includes('src/ui/book.js') && files.includes('src/data/icons.js'));
  assert.ok(!files.includes('sw.js') && !files.includes('package.json'));
});

// ------------------------------------------------------------------ the worker logic, with a tiny fake world
class FakeResponse {
  constructor(body, { status = 200, headers = {} } = {}, from = 'built') {
    this.bytes = body === null ? new Uint8Array(0) : body instanceof Uint8Array ? body : new Uint8Array(body);
    this.status = status;
    this.ok = status >= 200 && status < 300;
    this.from = from;
    this.h = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), String(v)]));
    this.headers = { get: (k) => this.h[k.toLowerCase()] ?? null };
  }
  clone() {
    return new FakeResponse(this.bytes, { status: this.status, headers: this.h }, this.from);
  }
  async arrayBuffer() {
    return this.bytes.buffer.slice(this.bytes.byteOffset, this.bytes.byteOffset + this.bytes.byteLength);
  }
}

function fakeWorld({ files = ['./', './index.html', './a.js'], origin = 'http://127.0.0.1:4183', online = true } = {}) {
  const store = new Map(); // cache name -> Map(url -> body)
  const state = { online };
  const log = { fetches: [], added: [], puts: [] };
  const music = { status: 200, type: 'audio/mpeg', bytes: Uint8Array.from({ length: 1000 }, (_, i) => i % 251) }; // what the "server" answers for a track
  const href = (u) => new URL(u, origin + '/').href;
  const makeCache = (name) => {
    if (!store.has(name)) store.set(name, new Map());
    const m = store.get(name);
    return {
      async addAll(reqs) {
        for (const r of reqs) {
          log.added.push({ url: r.url, cache: r.cache });
          if (!state.online) throw new TypeError('offline');
          m.set(r.url, 'body of ' + r.url);
        }
      },
      async put(req, res) {
        log.puts.push(typeof req === 'string' ? req : req.url);
        m.set(typeof req === 'string' ? req : req.url, res);
      },
      async match(req, opts = {}) {
        const url = typeof req === 'string' ? href(req) : req.url;
        const strip = (u) => (opts.ignoreSearch ? u.split('?')[0] : u);
        for (const [k, v] of m) if (strip(k) === strip(url)) return v instanceof FakeResponse ? v : { body: v, from: 'cache' };
        return undefined;
      },
    };
  };
  const sandbox = {
    location: { origin },
    caches: {
      open: async (n) => makeCache(n),
      keys: async () => [...store.keys()],
      delete: async (n) => store.delete(n),
    },
    Request: class {
      constructor(u, o = {}) {
        this.url = href(u);
        this.cache = o.cache;
      }
    },
    fetch: async (req) => {
      log.fetches.push(req.url);
      if (!state.online) throw new TypeError('offline');
      if (new URL(req.url).pathname.includes('/assets/music/')) {
        const range = req.headers && req.headers.get('range');
        return new FakeResponse(music.bytes, { status: range ? 206 : music.status, headers: { 'content-type': music.type } }, 'network');
      }
      return { body: 'network ' + req.url, from: 'network' };
    },
    Response: FakeResponse,
    URL,
  };
  return { sandbox, store, log, href, state, music };
}

function loadWorker(world, version = 'v1') {
  const src = SW_SRC.replace(swBlockRegex(), renderBlock(['index.html', 'a.js'], version, musicFiles()));
  const listeners = {};
  // a fresh context per load (a real browser starts the new worker file in its own scope), the stores are shared
  vm.runInNewContext(src, { ...world.sandbox, self: { addEventListener: (t, f) => (listeners[t] = f), location: { ...world.sandbox.location, href: world.sandbox.location.origin + '/sw.js' } } });
  return listeners;
}

async function runInstall(listeners) {
  let p;
  await listeners.install({ waitUntil: (x) => (p = x) });
  await p;
}
async function runActivate(listeners) {
  let p;
  await listeners.activate({ waitUntil: (x) => (p = x) });
  await p;
}
async function ask(listeners, url, { method = 'GET', mode = 'no-cors', range = null } = {}) {
  let responded = null;
  const handled = { value: false };
  const waits = [];
  const headers = { get: (k) => (k.toLowerCase() === 'range' ? range : null) };
  listeners.fetch({ request: { url, method, mode, headers }, respondWith: (p) => ((handled.value = true), (responded = p)), waitUntil: (p) => waits.push(p) });
  const out = handled.value ? await responded : 'ignored';
  await Promise.all(waits);
  return out;
}

test('sw logic: install caches every file, asked from the server again (cache: reload)', async () => {
  const w = fakeWorld();
  const l = loadWorker(w);
  await runInstall(l);
  assert.deepEqual(w.log.added.map((a) => a.url), ['http://127.0.0.1:4183/', 'http://127.0.0.1:4183/index.html', 'http://127.0.0.1:4183/a.js']);
  assert.ok(w.log.added.every((a) => a.cache === 'reload'));
  assert.deepEqual([...w.store.keys()], ['lullaby-lake-v1']);
});

test('sw logic: no skipWaiting and no clients.claim anywhere (an update never takes over a running game)', () => {
  assert.ok(!/skipWaiting|clients\.claim/.test(SW_SRC.replace(/\/\/.*$/gm, '')));
});

test('sw logic: cache first - a cached file is served without any network call', async () => {
  const w = fakeWorld();
  const l = loadWorker(w);
  await runInstall(l);
  w.log.fetches.length = 0;
  const r = await ask(l, w.href('a.js'));
  assert.equal(r.from, 'cache');
  assert.deepEqual(w.log.fetches, []);
});

test('sw logic: offline, the bare address and the address with a query both give the game page', async () => {
  const w = fakeWorld();
  const l = loadWorker(w);
  await runInstall(l);
  w.state.online = false; // the network is cut after the first visit
  w.log.fetches.length = 0;
  for (const url of ['/', '/?debug=1', '/?utm=abc&debug=1', '/index.html', '/index.html?x=1']) {
    const r = await ask(l, w.href(url), { mode: 'navigate' });
    assert.equal(r.from, 'cache', url);
  }
  assert.equal((await ask(l, w.href('a.js'))).from, 'cache');
  assert.deepEqual(w.log.fetches, [], 'not one network attempt');
});

test('sw logic: a page address that is not cached falls back on index.html', async () => {
  const w = fakeWorld({ online: true });
  const l = loadWorker(w);
  await runInstall(l);
  const r = await ask(l, w.href('/some/where'), { mode: 'navigate' });
  assert.equal(r.from, 'cache');
  assert.ok(r.body.endsWith('/index.html'));
});

test('sw logic: a sub-resource missing from the cache goes to the network once, and is not stored', async () => {
  const w = fakeWorld();
  const l = loadWorker(w);
  await runInstall(l);
  const r = await ask(l, w.href('other.png'));
  assert.equal(r.from, 'network');
  assert.deepEqual(w.log.fetches, ['http://127.0.0.1:4183/other.png']);
  assert.equal(w.store.get('lullaby-lake-v1').has('http://127.0.0.1:4183/other.png'), false);
});

test('sw logic: other origins and non-GET requests are left alone (no respondWith)', async () => {
  const w = fakeWorld();
  const l = loadWorker(w);
  await runInstall(l);
  assert.equal(await ask(l, 'https://example.org/x.js'), 'ignored');
  assert.equal(await ask(l, w.href('a.js'), { method: 'POST' }), 'ignored');
  assert.equal(await ask(l, 'chrome-extension://abc/x.js'), 'ignored');
});

test('sw logic: activate deletes the other lullaby-lake caches, keeps its own and caches of other apps', async () => {
  const w = fakeWorld();
  w.store.set('lullaby-lake-old', new Map());
  w.store.set('lullaby-lake-older', new Map());
  w.store.set('someone-elses', new Map());
  const l = loadWorker(w, 'new');
  await runInstall(l);
  await runActivate(l);
  assert.deepEqual([...w.store.keys()].sort(), ['lullaby-lake-new', 'someone-elses']);
});

test('sw logic: a new VERSION installs a new cache next to the old one, the old one goes at activation', async () => {
  const w = fakeWorld();
  const oldL = { ...loadWorker(w, 'one') };
  await runInstall(oldL);
  await runActivate(oldL);
  assert.deepEqual([...w.store.keys()], ['lullaby-lake-one']);
  const newL = { ...loadWorker(w, 'two') }; // the browser fetched a changed sw.js: new constants
  await runInstall(newL);
  assert.deepEqual([...w.store.keys()].sort(), ['lullaby-lake-one', 'lullaby-lake-two'], 'both exist until the next launch');
  const r = await ask(oldL, w.href('a.js'));
  assert.equal(r.from, 'cache', 'the running version keeps serving from its own cache');
  await runActivate(newL);
  assert.deepEqual([...w.store.keys()], ['lullaby-lake-two']);
});

test('sw logic: install fails cleanly when the network is down (nothing half-stored is served)', async () => {
  const w = fakeWorld({ online: false });
  const l = loadWorker(w);
  await assert.rejects(runInstall(l));
});

// ------------------------------------------------------------------ the sw.js text itself
test('sw.js: one fetch( call, one fetch listener, addAll at install, nothing else that reaches out', () => {
  const code = SW_SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.equal((code.match(/\bfetch\s*\(/g) || []).length, 1, 'exactly one fetch(');
  assert.equal((code.match(/addEventListener\('fetch'/g) || []).length, 1);
  assert.equal((code.match(/\.addAll\(/g) || []).length, 1);
  assert.equal((code.match(/\.put\(/g) || []).length, 1, 'the only run-time write to the cache is the one for the music tracks');
  assert.ok(!/XMLHttpRequest|WebSocket|EventSource|sendBeacon|importScripts|import\s*\(|https?:\/\//.test(code));
});

// ------------------------------------------------------------------ registration rules
test('registration: https, localhost and 127.0.0.1 over http yes; file:, other http hosts no', () => {
  assert.equal(canRegister({ protocol: 'https:', hostname: 'user.github.io' }), true);
  assert.equal(canRegister({ protocol: 'http:', hostname: '127.0.0.1' }), true);
  assert.equal(canRegister({ protocol: 'http:', hostname: 'localhost' }), true);
  assert.equal(canRegister({ protocol: 'file:', hostname: '' }), false);
  assert.equal(canRegister({ protocol: 'http:', hostname: '192.168.1.20' }), false);
  assert.equal(canRegister({ protocol: 'http:', hostname: 'example.org' }), false);
  assert.equal(canRegister(null), false);
});

test('registration: registers ./sw.js after load; a rejected registration is silent; no worker support = nothing', async () => {
  const calls = [];
  const win = { document: { readyState: 'loading' }, listeners: {}, addEventListener(t, f) { this.listeners[t] = f; } };
  const nav = { serviceWorker: { register: (u) => (calls.push(u), Promise.reject(new Error('nope'))) } };
  assert.equal(setupWorker({ win, nav, loc: { protocol: 'http:', hostname: '127.0.0.1' } }), true);
  assert.deepEqual(calls, [], 'waits for the load event');
  win.listeners.load();
  await new Promise((r) => setTimeout(r, 5));
  assert.deepEqual(calls, ['./sw.js']);
  assert.equal(setupWorker({ win, nav: {}, loc: { protocol: 'https:', hostname: 'x' } }), false);
  assert.equal(setupWorker({ win, nav, loc: { protocol: 'file:', hostname: '' } }), false);
  calls.length = 0;
  win.document.readyState = 'complete';
  setupWorker({ win, nav, loc: { protocol: 'https:', hostname: 'x' }, enabled: false });
  assert.deepEqual(calls, [], 'disabled (debug pages): not registered');
});

test('registration: a throwing register() never breaks the page', () => {
  const win = { document: { readyState: 'complete' }, addEventListener() {} };
  const nav = { serviceWorker: { register: () => { throw new Error('SecurityError'); } } };
  assert.doesNotThrow(() => setupWorker({ win, nav, loc: { protocol: 'https:', hostname: 'x' } }));
});

test('registration: ?nosw=1 unregisters and deletes only the lullaby-lake caches', async () => {
  const deleted = [];
  const unreg = [];
  const win = {
    document: { readyState: 'complete' },
    addEventListener() {},
    caches: { keys: async () => ['lullaby-lake-abc', 'other'], delete: async (k) => deleted.push(k) },
  };
  const nav = { serviceWorker: { getRegistrations: async () => [{ unregister: () => unreg.push(1) }] } };
  setupWorker({ win, nav, loc: { protocol: 'http:', hostname: 'localhost' }, remove: true });
  await new Promise((r) => setTimeout(r, 5));
  assert.deepEqual(deleted, ['lullaby-lake-abc']);
  assert.deepEqual(unreg, [1]);
});

// ------------------------------------------------------------------ the recorded music tracks (J6 part D)
const TRACK_PATHS = audioData.real.tracks.map((t) => t.url);
const trackUrl = (w, i = 0) => w.href(TRACK_PATHS[i]);

test('sw music: MUSIC is exactly the three data paths, separate from FILES, and the files exist; assets/ holds nothing else but SOURCES.txt', () => {
  const { MUSIC, FILES } = swConstants();
  assert.deepEqual([...MUSIC], TRACK_PATHS.map((p) => './' + p).sort());
  assert.deepEqual(musicFiles(), TRACK_PATHS.slice().sort());
  assert.equal(MUSIC.length, 3);
  for (const m of MUSIC) {
    assert.ok(statSync(join(ROOT, m)).isFile(), m);
    assert.ok(!FILES.includes(m), 'not precached: ' + m);
  }
  const found = walk(join(ROOT, 'assets')).map((abs) => './' + relative(ROOT, abs).replace(/\\/g, '/'));
  assert.deepEqual(found.sort(), [...MUSIC, './assets/music/SOURCES.txt'].sort(), 'no other file under assets/');
});

test('sw music: VERSION also depends on the bytes of the tracks (a replaced track starts a new cache)', () => {
  const files = siteFiles();
  assert.notEqual(siteVersion(files, ROOT, []), siteVersion(files, ROOT, musicFiles()));
});

test('sw music: install does not fetch the tracks (the first visit stays small)', async () => {
  const w = fakeWorld();
  const l = loadWorker(w);
  await runInstall(l);
  assert.ok(w.log.added.every((a) => !a.url.includes('/assets/music/')));
  assert.deepEqual(w.log.fetches, []);
  assert.deepEqual(w.log.puts, []);
});

test('sw music: first ask goes to the network and is stored; later asks (even offline) come from the cache, with zero network call', async () => {
  const w = fakeWorld();
  const l = loadWorker(w);
  await runInstall(l);
  const r1 = await ask(l, trackUrl(w, 0), { mode: 'cors' });
  assert.equal(r1.from, 'network');
  assert.equal(r1.status, 200);
  assert.deepEqual(w.log.puts, [trackUrl(w, 0)]);
  assert.deepEqual(w.log.fetches, [trackUrl(w, 0)]);
  w.state.online = false;
  w.log.fetches.length = 0;
  const r2 = await ask(l, trackUrl(w, 0), { mode: 'cors' });
  assert.equal(r2.bytes.length, 1000);
  assert.deepEqual(w.log.fetches, [], 'no network when the track was heard before');
  // a track never heard, offline: the request fails (the game falls back silently), and nothing is stored
  await assert.rejects(ask(l, trackUrl(w, 1), { mode: 'cors' }));
  assert.equal(w.log.puts.length, 1);
  assert.deepEqual([...w.store.keys()], ['lullaby-lake-v1']);
});

test('sw music: only complete good answers are stored (404, an HTML page, a 206 or a Range request are passed through)', async () => {
  const w = fakeWorld();
  const l = loadWorker(w);
  await runInstall(l);
  w.music.status = 404;
  assert.equal((await ask(l, trackUrl(w, 0), { mode: 'cors' })).status, 404);
  w.music.status = 200;
  w.music.type = 'text/html; charset=utf-8'; // a server that answers every address with a page
  await ask(l, trackUrl(w, 0), { mode: 'cors' });
  w.music.type = 'audio/ogg';
  const part = await ask(l, trackUrl(w, 1), { mode: 'cors', range: 'bytes=0-99' });
  assert.equal(part.status, 206);
  assert.deepEqual(w.log.puts, [], 'nothing stored so far');
  await ask(l, trackUrl(w, 1), { mode: 'cors' });
  assert.deepEqual(w.log.puts, [trackUrl(w, 1)]);
});

test('sw music: nothing else can be cached at run time (other music-like paths, a query, other origins, non-GET)', async () => {
  const w = fakeWorld();
  const l = loadWorker(w);
  await runInstall(l);
  await ask(l, w.href('assets/music/other.mp3'), { mode: 'cors' });
  await ask(l, w.href(TRACK_PATHS[0] + '?x=1'), { mode: 'cors' });
  await ask(l, w.href('assets/music/SOURCES.txt'), { mode: 'cors' });
  await ask(l, w.href('src/main.js'), { mode: 'cors' });
  assert.equal(await ask(l, 'https://example.org/' + TRACK_PATHS[0]), 'ignored');
  assert.equal(await ask(l, trackUrl(w, 0), { method: 'POST' }), 'ignored');
  assert.deepEqual(w.log.puts, []);
});

test('sw music: Range requests on a cached track get a correct 206 (start-end, open end, suffix), a 416 past the end, the whole file for a header it does not understand', async () => {
  const w = fakeWorld();
  const l = loadWorker(w);
  await runInstall(l);
  await ask(l, trackUrl(w, 0), { mode: 'cors' }); // stored
  w.state.online = false;
  w.log.fetches.length = 0;
  const bytes = w.music.bytes;
  const a = await ask(l, trackUrl(w, 0), { mode: 'cors', range: 'bytes=10-19' });
  assert.equal(a.status, 206);
  assert.deepEqual([...a.bytes], [...bytes.slice(10, 20)]);
  assert.equal(a.headers.get('content-range'), 'bytes 10-19/1000');
  assert.equal(a.headers.get('content-length'), '10');
  assert.equal(a.headers.get('content-type'), 'audio/mpeg');
  const open = await ask(l, trackUrl(w, 0), { mode: 'cors', range: 'bytes=990-' });
  assert.deepEqual([...open.bytes], [...bytes.slice(990)]);
  assert.equal(open.headers.get('content-range'), 'bytes 990-999/1000');
  const zero = await ask(l, trackUrl(w, 0), { mode: 'cors', range: 'bytes=0-' });
  assert.equal(zero.bytes.length, 1000);
  assert.equal(zero.headers.get('content-range'), 'bytes 0-999/1000');
  const suffix = await ask(l, trackUrl(w, 0), { mode: 'cors', range: 'bytes=-5' });
  assert.deepEqual([...suffix.bytes], [...bytes.slice(995)]);
  const over = await ask(l, trackUrl(w, 0), { mode: 'cors', range: 'bytes=900-5000' });
  assert.equal(over.headers.get('content-range'), 'bytes 900-999/1000');
  const past = await ask(l, trackUrl(w, 0), { mode: 'cors', range: 'bytes=1000-1010' });
  assert.equal(past.status, 416);
  assert.equal(past.headers.get('content-range'), 'bytes */1000');
  const multi = await ask(l, trackUrl(w, 0), { mode: 'cors', range: 'bytes=0-1,5-9' });
  assert.equal(multi.status, 200);
  assert.equal(multi.bytes.length, 1000);
  assert.deepEqual(w.log.fetches, [], 'all of them from the cache');
});
