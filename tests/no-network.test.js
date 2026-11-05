import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

const BANNED = [/\bfetch\s*\(/, /XMLHttpRequest/, /\bWebSocket\b/, /\bEventSource\b/, /sendBeacon/, /\bimport\s*\(/, /https?:\/\//];

// J6 part D: the ONE place allowed to call fetch( is the loader of the three recorded music tracks (same origin, relative path, refused
// unless it matches assets/music/<name>.mp3|ogg). It is exempt from the fetch rule ONLY; every other rule applies to it too.
const LOADER = 'src/audio/trackLoader.js';
const isLoader = (f) => f.slice(ROOT.length).replace(/\\/g, '/') === LOADER;
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('no network: src/** and index.html contain no network call or address (the music loader is the one fetch, below)', () => {
  const files = [...walk(join(ROOT, 'src')), join(ROOT, 'index.html')];
  assert.ok(files.length > 15);
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    for (const re of BANNED) {
      if (re === BANNED[0] && isLoader(f)) continue;
      assert.ok(!re.test(src), `${f.slice(ROOT.length)} contains ${re}`);
    }
  }
});

test('no network: the only fetch( in src/ is one call in the music loader, which refuses anything but assets/music/<name>.mp3|ogg', async () => {
  const hits = [];
  for (const f of walk(join(ROOT, 'src'))) {
    const code = stripComments(readFileSync(f, 'utf8'));
    const n = (code.match(/\bfetch\s*\(/g) || []).length;
    if (n) hits.push([f.slice(ROOT.length).replace(/\\/g, '/'), n]);
  }
  assert.deepEqual(hits, [[LOADER, 1]]);
  const { isTrackUrl, loadTrackBytes } = await import('../src/audio/trackLoader.js');
  const calls = [];
  globalThis.fetch = async (u) => (calls.push(u), { ok: true, arrayBuffer: async () => new ArrayBuffer(1) });
  try {
    for (const bad of ['https://example.org/a.mp3', '//x/a.mp3', '../a.mp3', 'a.mp3', 'assets/music/a.wav', 'assets/music/a.mp3?x']) await assert.rejects(loadTrackBytes(bad), bad);
    assert.deepEqual(calls, [], 'refused before any request');
    await loadTrackBytes('assets/music/lofi-again.ogg');
    assert.deepEqual(calls, ['assets/music/lofi-again.ogg']);
  } finally {
    delete globalThis.fetch;
  }
  const data = (await import('../src/data/audio.js')).default;
  for (const t of data.real.tracks) assert.ok(isTrackUrl(t.url) && !/^[a-z]+:|^\/\//i.test(t.url), t.url);
});

test('no network: the page links only local files (no CDN, no external font)', () => {
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  for (const m of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    assert.ok(!/^(https?:)?\/\//.test(m[1]), 'external link ' + m[1]);
  }
});
