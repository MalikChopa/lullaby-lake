// The window around the 16:9 picture (render/backdrop.js): geometry only, with a fake canvas and window.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createBackdrop } from '../src/render/backdrop.js';

function rig(vw, vh) {
  const calls = [];
  const ctx = { imageSmoothingEnabled: false, drawImage: (...a) => calls.push(a) };
  const canvas = { width: 0, height: 0, hidden: true, getContext: () => ctx };
  const listeners = [];
  const win = { innerWidth: vw, innerHeight: vh, addEventListener: (n, f) => listeners.push([n, f]) };
  const b = createBackdrop({ canvas, source: { tag: 'source' }, win });
  return { b, canvas, calls, win, listeners };
}

test('backdrop: a 16:9 window needs nothing (the canvas stays hidden, nothing is drawn)', () => {
  const r = rig(1280, 720);
  assert.equal(r.canvas.hidden, true);
  assert.equal(r.calls.length, 0);
});

test('backdrop: a taller window gets bars above and below, filled from the top and bottom rows; a wider one gets bars on the sides', () => {
  const t = rig(1000, 800); // picture 1000 x 562.5: bars of ~118 px above and below
  assert.equal(t.canvas.hidden, false);
  assert.equal(t.canvas.width, 125);
  assert.equal(t.canvas.height, 100);
  const srcs = t.calls.map((c) => c.slice(1, 5).join(','));
  assert.ok(srcs.includes('0,0,480,270'), 'the picture itself is drawn first');
  assert.ok(srcs.includes('0,0,480,4'), 'top rows');
  assert.ok(srcs.includes('0,264,480,6'), 'bottom rows');
  assert.ok(!srcs.some((s) => s.startsWith('0,0,6,')), 'no side bars');
  const w = rig(1600, 600); // picture 1066 x 600: bars of ~267 px left and right
  assert.equal(w.canvas.hidden, false);
  const sw = w.calls.map((c) => c.slice(1, 5).join(','));
  assert.ok(sw.includes('0,0,6,270') && sw.includes('474,0,6,270'), 'left and right columns');
  assert.ok(!sw.includes('0,0,480,4'));
});

test('backdrop: follows the window size, redraws only every 6th picture, never throws without a canvas', () => {
  const r = rig(1280, 720);
  assert.equal(r.canvas.hidden, true);
  r.win.innerWidth = 1000;
  r.win.innerHeight = 900;
  r.listeners.find(([n]) => n === 'resize')[1]();
  assert.equal(r.canvas.hidden, false);
  const n0 = r.calls.length;
  for (let i = 0; i < 5; i++) r.b.tick();
  assert.equal(r.calls.length, n0, '5 pictures: no redraw');
  r.b.tick();
  assert.ok(r.calls.length > n0, 'the 6th redraws');
  assert.doesNotThrow(() => createBackdrop({ canvas: null, source: null, win: { innerWidth: 10, innerHeight: 10 } }).tick());
});
