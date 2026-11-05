// Which files make the static site, found by FOLLOWING the references from index.html (so a new file cannot be forgotten):
//   index.html -> src="..." / href="..."   |   .js / .mjs -> static import / export ... from   |   .css -> url(...)
// The service worker (sw.js) caches exactly this list. Used by tests/sw.test.js and by `node tools/site-files.mjs [--write]`:
//   no flag  : prints the list and the version
//   --write  : rewrites the FILES block and VERSION of sw.js (run it after any change to the site, `npm run sw`)
// The recorded music tracks (src/data/audio.js real.tracks) are NOT in the list: they are an explicit, separate list (MUSIC in sw.js), cached
// at run time by the worker, never at install. Their bytes are part of VERSION (a changed track starts a new cache).
// vendor/ files are not scanned inside (they are only followed up to the file itself).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, posix, extname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import audioData from '../src/data/audio.js';

export const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const TEXT = new Set(['.html', '.js', '.mjs', '.css']);

const local = (spec) => spec && !/^([a-z][a-z0-9+.-]*:|\/\/|#)/i.test(spec);
const clean = (spec) => spec.split('#')[0].split('?')[0];

function referencesOf(rel, text) {
  const ext = extname(rel);
  const out = [];
  if (ext === '.html') {
    for (const m of text.matchAll(/\b(?:src|href)\s*=\s*"([^"]+)"/g)) out.push(m[1]);
  } else if (ext === '.css') {
    for (const m of text.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)) out.push(m[1]);
  } else if (ext === '.js' || ext === '.mjs') {
    for (const m of text.matchAll(/^\s*(?:import|export)\b[^;'"]*?\bfrom\s*['"]([^'"]+)['"]/gm)) out.push(m[1]);
    for (const m of text.matchAll(/^\s*import\s*['"]([^'"]+)['"]/gm)) out.push(m[1]);
  }
  return out.filter(local).map(clean);
}

/** Sorted site-relative paths ('index.html', 'src/main.js', ...) reachable from index.html. */
export function siteFiles(root = ROOT) {
  const seen = new Set();
  const todo = ['index.html'];
  while (todo.length) {
    const rel = todo.pop();
    if (seen.has(rel)) continue;
    const abs = join(root, rel);
    if (!existsSync(abs)) throw new Error(`referenced file does not exist: ${rel}`);
    seen.add(rel);
    if (rel.startsWith('vendor/') && extname(rel) !== '.css') continue;
    if (!TEXT.has(extname(rel))) continue;
    for (const ref of referencesOf(rel, readFileSync(abs, 'utf8'))) {
      const target = posix.normalize(posix.join(posix.dirname(rel), ref));
      if (target.startsWith('..')) throw new Error(`${rel} points outside the site: ${ref}`);
      todo.push(target);
    }
  }
  return [...seen].sort();
}

/** Site-relative paths of the recorded tracks, from the data (sorted). Nothing else can be cached at run time. */
export function musicFiles() {
  return audioData.real.tracks.map((t) => t.url).sort();
}

/** A short hash of the site's files (text files with line endings normalised, so Windows and Linux checkouts agree) and of the music tracks. */
export function siteVersion(files, root = ROOT, music = musicFiles()) {
  const h = createHash('sha256');
  for (const rel of files) {
    let buf = readFileSync(join(root, rel));
    if (TEXT.has(extname(rel))) buf = Buffer.from(buf.toString('utf8').replace(/\r\n/g, '\n'), 'utf8');
    h.update(rel + '\0');
    h.update(buf);
    h.update('\0');
  }
  for (const rel of music) {
    h.update('music:' + rel + '\0');
    h.update(readFileSync(join(root, rel)));
    h.update('\0');
  }
  return h.digest('hex').slice(0, 12);
}

/** What the FILES array of sw.js must hold: './' (the bare address) first, then every file with a './' prefix. */
export function workerList(files) {
  return ['./', ...files.map((f) => './' + f)];
}

const BEGIN = '// BEGIN FILES (written by tools/site-files.mjs --write; tests/sw.test.js checks it)';
const END = '// END FILES';

export function renderBlock(files, version, music = musicFiles()) {
  const lines = workerList(files).map((f) => `  '${f}',`);
  const tracks = music.map((f) => `  './${f}',`);
  return `const VERSION = '${version}';\n${BEGIN}\nconst FILES = [\n${lines.join('\n')}\n];\n// run-time cache only (see the top of this file): the recorded tracks\nconst MUSIC = [\n${tracks.join('\n')}\n];\n${END}`;
}

/** Splits sw.js source around the generated block. */
export function swBlockRegex() {
  return /const VERSION = '[^']*';\n\/\/ BEGIN FILES[^\n]*\nconst FILES = \[[\s\S]*?\];\n\/\/ END FILES/;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const files = siteFiles();
  const version = siteVersion(files);
  if (process.argv.includes('--write')) {
    const path = join(ROOT, 'sw.js');
    const src = readFileSync(path, 'utf8');
    if (!swBlockRegex().test(src)) throw new Error('sw.js has no generated block');
    const next = src.replace(swBlockRegex(), renderBlock(files, version));
    if (next !== src) writeFileSync(path, next);
    console.log(next === src ? 'sw.js already up to date' : 'sw.js updated', '- version', version, '-', files.length, 'files');
  } else {
    console.log(version);
    console.log(workerList(files).join('\n'));
  }
}
