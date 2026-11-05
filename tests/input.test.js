import test from 'node:test';
import assert from 'node:assert/strict';
import { createRouter } from '../src/input/input.js';

function make(ctx = {}) {
  const c = { screen: 'game', blocked: false, shortcuts: true, ...ctx };
  const out = [];
  const r = createRouter((a) => out.push(a), () => c);
  return { r, out, c };
}

test('Space on the scene: one press, one release', () => {
  const { r, out } = make();
  r.key({ type: 'down', key: ' ', target: 'canvas' });
  r.key({ type: 'up', key: ' ', target: 'canvas' });
  assert.deepEqual(out, ['primaryDown', 'primaryUp']);
});

test('a held key (auto-repeat) gives a single press', () => {
  const { r, out } = make();
  r.key({ type: 'down', key: ' ', target: 'body' });
  for (let i = 0; i < 20; i++) r.key({ type: 'down', key: ' ', repeat: true, target: 'body' });
  r.key({ type: 'up', key: ' ', target: 'body' });
  assert.deepEqual(out, ['primaryDown', 'primaryUp']);
});

test('Space or Enter on a focused button keeps its native effect and never casts', () => {
  const { r, out } = make();
  assert.equal(r.key({ type: 'down', key: ' ', target: 'control' }), false);
  r.key({ type: 'up', key: ' ', target: 'control' });
  assert.equal(r.key({ type: 'down', key: 'Enter', target: 'control' }), false);
  r.key({ type: 'up', key: 'Enter', target: 'control' });
  assert.deepEqual(out, []);
});

test('shortcut letters: C, R, P, M; ignored in a field, with a modifier, or when disabled', () => {
  const { r, out, c } = make();
  for (const k of ['c', 'R', 'p', 'm']) r.key({ type: 'down', key: k, target: 'body' });
  assert.deepEqual(out, ['book', 'settings', 'photo', 'mute']);
  out.length = 0;
  r.key({ type: 'down', key: 'c', target: 'field' });
  r.key({ type: 'down', key: 'c', target: 'body', mod: true });
  c.shortcuts = false;
  r.key({ type: 'down', key: 'c', target: 'body' });
  assert.deepEqual(out, []);
  r.key({ type: 'down', key: 'Escape', target: 'body' }); // Escape always works
  assert.deepEqual(out, ['back']);
});

test('Escape and keys do nothing on the home screen', () => {
  const { r, out } = make({ screen: 'home' });
  r.key({ type: 'down', key: 'Escape' });
  r.key({ type: 'down', key: 'c' });
  r.key({ type: 'down', key: ' ', target: 'body' });
  assert.deepEqual(out, []);
});

test('Space does not cast from the book or settings screens', () => {
  const { r, out } = make({ screen: 'book' });
  r.key({ type: 'down', key: ' ', target: 'body' });
  assert.deepEqual(out, []);
});

test('mouse or touch: down / up, one finger only, cancel releases', () => {
  const { r, out } = make();
  r.pointer({ type: 'down', id: 1, onScene: true });
  r.pointer({ type: 'down', id: 2, onScene: true });
  r.pointer({ type: 'up', id: 2 });
  assert.deepEqual(out, ['primaryDown']);
  r.pointer({ type: 'cancel', id: 1 });
  assert.deepEqual(out, ['primaryDown', 'primaryUp']);
});

test('a press on a button or the card (not on the scene) is not a cast', () => {
  const { r, out } = make();
  r.pointer({ type: 'down', id: 1, onScene: false });
  assert.deepEqual(out, []);
});

test('blur or hidden tab while charging = released', () => {
  const { r, out } = make();
  r.key({ type: 'down', key: ' ', target: 'body' });
  r.blur();
  assert.deepEqual(out, ['primaryDown', 'primaryUp']);
  r.blur();
  assert.equal(out.length, 2);
  assert.equal(r.heldCount(), 0);
});

test('key and pointer together: release only when both are up', () => {
  const { r, out } = make();
  r.key({ type: 'down', key: ' ', target: 'body' });
  r.pointer({ type: 'down', id: 1, onScene: true });
  r.key({ type: 'up', key: ' ', target: 'body' });
  assert.deepEqual(out, ['primaryDown']);
  r.pointer({ type: 'up', id: 1 });
  assert.deepEqual(out, ['primaryDown', 'primaryUp']);
});

test('portrait banner: presses and shortcuts are ignored', () => {
  const { r, out } = make({ blocked: true });
  r.pointer({ type: 'down', id: 1, onScene: true });
  r.key({ type: 'down', key: ' ', target: 'body' });
  r.key({ type: 'down', key: 'c', target: 'body' });
  assert.deepEqual(out, []);
});

test('Space on a box or a slider (a "field") is never consumed, key-down or key-up: a checkbox toggles on the key-up', () => {
  const { r, out } = make({ screen: 'settings' });
  assert.equal(r.key({ type: 'down', key: ' ', target: 'field' }), false);
  assert.equal(r.key({ type: 'up', key: ' ', target: 'field' }), false);
  assert.equal(r.key({ type: 'down', key: ' ', repeat: true, target: 'field' }), false);
  const g = make();
  assert.equal(g.r.key({ type: 'down', key: ' ', target: 'field' }), false);
  assert.equal(g.r.key({ type: 'up', key: ' ', target: 'field' }), false);
  assert.deepEqual([...out, ...g.out], []);
});
