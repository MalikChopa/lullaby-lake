import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (p.endsWith('.js')) out.push(p);
  }
  return out;
}

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}

const FORBIDDEN = [
  /\bdocument\b/, /\bwindow\b/, /\bMath\.random\b/, /\bDate\.now\b/, /\bnew Date\b/, /\bperformance\b/, /\blocalStorage\b/,
  /\bfetch\b/, /\bcrypto\b/, /\bnavigator\b/, /\brequestAnimationFrame\b/, /\bsetTimeout\b/, /\bsetInterval\b/,
];

for (const dir of ['src/core', 'src/art']) {
  test(`purity: ${dir} uses no DOM, clock, random, storage or network`, () => {
    const files = walk(join(ROOT, dir));
    assert.ok(files.length > 3, 'files found in ' + dir);
    for (const f of files) {
      const src = stripComments(readFileSync(f, 'utf8'));
      for (const re of FORBIDDEN) assert.ok(!re.test(src), `${relative(ROOT, f)} contains ${re}`);
    }
  });

  test(`purity: ${dir} only imports from core/, art/ and data/`, () => {
    for (const f of walk(join(ROOT, dir))) {
      const src = readFileSync(f, 'utf8');
      for (const m of src.matchAll(/(?:import|export)[^'"]*?from\s*['"]([^'"]+)['"]/g)) {
        const spec = m[1];
        assert.ok(spec.startsWith('./') || spec.startsWith('../'), `${relative(ROOT, f)} imports ${spec}`);
        const target = join(f, '..', spec).replace(/\\/g, '/');
        assert.ok(/\/src\/(core|art|data)\//.test(target), `${relative(ROOT, f)} imports ${spec}`);
      }
      assert.ok(!/\bimport\s*\(/.test(src), relative(ROOT, f) + ' has a dynamic import');
    }
  });
}

test('purity: the checker itself catches a violation', () => {
  assert.ok(FORBIDDEN.some((re) => re.test(stripComments('const x = Math.random();'))));
  assert.ok(!FORBIDDEN.some((re) => re.test(stripComments('// document window\nconst x = 1;'))));
});
