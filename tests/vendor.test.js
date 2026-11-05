import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

const dir = new URL('../vendor/pixi/', import.meta.url);

test('vendor: pixi.min.mjs matches the SHA-256 and version recorded in VERSION', () => {
  const info = readFileSync(new URL('VERSION', dir), 'utf8');
  const sha = /sha256:\s*([0-9a-f]{64})/.exec(info);
  const ver = /pixi\.js\s+(\d+\.\d+\.\d+)/.exec(info);
  assert.ok(sha && ver, 'VERSION has a sha256 and a version');
  const bytes = readFileSync(new URL('pixi.min.mjs', dir));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), sha[1]);
  assert.ok(bytes.toString('latin1', 0, 2000).includes('PixiJS - v' + ver[1]));
});

test('vendor: the MIT licence is shipped next to it', () => {
  assert.ok(existsSync(new URL('LICENSE', dir)));
  assert.match(readFileSync(new URL('LICENSE', dir), 'utf8'), /MIT License/);
});

test('vendor: no dependency in package.json', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.dependencies, undefined);
  assert.equal(pkg.devDependencies, undefined);
  assert.equal(pkg.type, 'module');
});
