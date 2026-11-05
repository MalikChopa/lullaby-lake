import test from 'node:test';
import assert from 'node:assert/strict';
import presets, { PRESET_NAMES, DEFAULT_PRESET, getPreset, isPresetName } from '../src/data/palettes.js';
import icons from '../src/data/icons.js';
import fr from '../src/data/strings.fr.js';
import en from '../src/data/strings.en.js';
import sprites from '../src/data/fishSprites.js';
import speciesList from '../src/data/species.js';
import { bakeBackground, bakeForeground, W, H, HOR } from '../src/art/sceneBake.js';
import { createScene } from '../src/art/compose.js';
import { createRaster, hx, mixc, gradeColor } from '../src/art/raster.js';
import { paintFish, fishBounds, FISH_W, FISH_H } from '../src/art/fishPaint.js';
import { paintFrame, FRAMES } from '../src/art/framePaint.js';
import { dith } from '../src/art/dither.js';

const HEX = /^#[0-9a-f]{6}$/;
const cast = { tip: [312, 156], end: [345, 218], sag: -3, rings: 1 };
const lum = (p) => 0.3 * (p & 255) + 0.59 * ((p >>> 8) & 255) + 0.11 * ((p >>> 16) & 255);
const avgLum = (frame, y0, y1, x0 = 0, x1 = 150) => {
  let s = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) s += lum(frame[y * W + x]);
  return s / ((y1 - y0) * (x1 - x0));
};

test('presets: 5 moods as data, dusk is the default, unknown names fall back on dusk', () => {
  assert.deepEqual([...PRESET_NAMES], ['dusk', 'day', 'night', 'rain', 'fog']);
  assert.equal(DEFAULT_PRESET, 'dusk');
  assert.equal(getPreset('nope'), presets.dusk);
  assert.equal(getPreset(undefined), presets.dusk);
  assert.ok(isPresetName('rain') && !isPresetName('__proto__') && !isPresetName('toString'));
});

test('presets: every field is present and valid, labels exist in both languages, icons exist', () => {
  for (const name of PRESET_NAMES) {
    const P = presets[name];
    assert.ok(P.sky.length >= 7 && P.water.length === 7 && P.clouds.length === 5 && P.mt.length === 4 && P.pn.length === 4, name);
    for (const h of [...P.sky, ...P.water, ...P.clouds, ...P.mt.flat(), ...P.pn.flat(), P.fogColor]) assert.match(h, HEX, name);
    assert.equal(P.grade.mul.length, 3);
    assert.equal(P.grade.add.length, 3);
    assert.ok(P.grade.sat > 0);
    assert.ok(P.cl.every((c) => c.length === 4));
    assert.ok(['moon', 'sun', null].includes(P.body));
    assert.ok(P.flies >= 0 && P.flies <= 14 && P.stars >= 0);
    assert.ok(P.labelKey in fr && P.labelKey in en, 'label ' + P.labelKey);
    assert.ok('scene.label.' + name in fr && 'scene.label.' + name in en);
    assert.ok(icons[P.icon], 'icon ' + P.icon);
  }
  assert.equal(presets.rain.rain, true);
  assert.equal(presets.night.birds, false);
  assert.ok(presets.night.stars > 100 && presets.day.stars === 0);
});

test('raster: translucent over transparent keeps colour and alpha; graded and raw colours differ under a grade', () => {
  const R = createRaster(4, 4);
  R.rcA(0, 0, 2, 2, [200, 100, 50], 0.5);
  const p = R.buf[0];
  assert.equal(p & 255, 200);
  assert.equal((p >>> 8) & 255, 100);
  assert.ok(Math.abs((p >>> 24) - 128) <= 1);
  R.rcr(0, 0, 1, 1, '#ffffff');
  R.rcA(0, 0, 1, 1, [0, 0, 0], 0.5);
  assert.ok(Math.abs((R.buf[0] & 255) - 128) <= 1 && R.buf[0] >>> 24 === 255);
  R.setGrade({ mul: [0.5, 0.5, 0.5], add: [0, 0, 0], sat: 1 });
  R.px(3, 3, '#ffffff');
  R.pxr(2, 3, '#ffffff');
  assert.equal(R.buf[3 * 4 + 3] & 255, 127);
  assert.equal(R.buf[3 * 4 + 2] & 255, 255);
  R.px(-5, 0, '#fff'); // clipped without error
  R.rc(2, 2, 99, 99, '#102030');
  assert.deepEqual(gradeColor([100, 100, 100], { mul: [1, 1, 1], add: [0, 0, 0], sat: 0 }).map(Math.round), [100, 100, 100]);
  assert.deepEqual(mixc([0, 0, 0], [100, 200, 50], 0.5), [50, 100, 25]);
  assert.deepEqual(hx('#0a141e'), [10, 20, 30]);
});

test('sceneBake: same seed = same layers, other seed = other layers', () => {
  const P = getPreset('dusk');
  const a = bakeBackground(P, 19);
  const b = bakeBackground(P, 19);
  const c = bakeBackground(P, 20);
  assert.equal(a.buf.length, W * H);
  assert.deepEqual(a.buf, b.buf);
  assert.notDeepEqual(a.buf, c.buf);
  assert.deepEqual(bakeForeground(P, 77).buf, bakeForeground(P, 77).buf);
  assert.notDeepEqual(bakeForeground(P, 77).buf, bakeForeground(P, 78).buf);
});

test('sceneBake: the sky is fully painted, the water is left transparent, banks and trees are rooted in the ground', () => {
  for (const name of PRESET_NAMES) {
    const { buf, bankBot } = bakeBackground(getPreset(name), 19);
    for (let y = 0; y < HOR; y++) for (let x = 0; x < W; x++) assert.ok(buf[y * W + x] >>> 24 === 255, `${name}: transparent sky pixel at ${x},${y}`);
    let open = 0;
    for (let x = 0; x < W; x++) if (buf[(H - 1) * W + x] >>> 24 === 0) open++;
    assert.ok(open > W * 0.6, `${name}: open water on the last row: ${open}`);
    assert.ok(bankBot.some((v) => v > 0), name);
    // no floating tree: the row just under the horizon is painted all along (ground under the pines)
    for (let x = 0; x < W; x += 7) assert.ok(buf[(HOR + 3) * W + x] >>> 24 === 255, `${name}: hole in the bank at x=${x}`);
  }
});

test('compose: a frame is fully opaque and deterministic; the water moves with time and freezes with reduced motion', () => {
  const s = createScene({ preset: getPreset('dusk') });
  const p = (time, reduced) => ({ time, reduced, cast, splash: null });
  const a = Uint32Array.from(s.render(p(1.5, false)));
  assert.ok(a.every((v) => v >>> 24 === 255), 'opaque');
  const again = createScene({ preset: getPreset('dusk') });
  assert.deepEqual(a, Uint32Array.from(again.render(p(1.5, false))));
  const b = Uint32Array.from(s.render(p(2.4, false)));
  let diff = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) diff++;
  assert.ok(diff > 3000, 'the picture moves: ' + diff + ' pixels differ');
  for (const name of PRESET_NAMES) {
    const sc = createScene({ preset: getPreset(name) });
    const r1 = Uint32Array.from(sc.render(p(1, true)));
    const r2 = Uint32Array.from(sc.render(p(7.3, true)));
    assert.deepEqual(r1, r2, name + ': reduced motion = still picture');
  }
});

test('compose: sky lighter near the horizon, water darker toward the bottom, night darker than day', () => {
  const f = {};
  for (const n of PRESET_NAMES) f[n] = Uint32Array.from(createScene({ preset: getPreset(n) }).render({ time: 1, reduced: true, cast, splash: null }));
  assert.ok(avgLum(f.dusk, 138, 146) > avgLum(f.dusk, 0, 8));
  assert.ok(avgLum(f.dusk, 160, 170, 250, 300) > avgLum(f.dusk, 255, 265, 250, 300));
  assert.ok(avgLum(f.day, 0, 270, 0, 480) > avgLum(f.night, 0, 270, 0, 480) * 1.6);
  assert.ok(avgLum(f.rain, 0, 60, 0, 480) > avgLum(f.night, 0, 60, 0, 480));
});

test('compose: ceiling on distinct colours (smooth gradients, no palette): every preset stays under 16 000 (measured at most 13 500, dusk)', () => {
  for (const n of PRESET_NAMES) {
    const fr0 = createScene({ preset: getPreset(n) }).render({ time: 3, reduced: false, cast, splash: null });
    const colors = new Set(fr0).size;
    assert.ok(colors >= 400 && colors <= 16000, `${n}: ${colors} colours`);
  }
});

test('compose: every moving part paints inside the picture for extreme inputs (no throw, still opaque)', () => {
  const sc = createScene({ preset: getPreset('rain') });
  const extremes = [
    { tip: [-50, -50], end: [-20, 400], sag: -3, rings: 2 },
    { tip: [999, 999], end: [700, 5], sag: 0, rings: 1 },
    { tip: [312, 156], end: null, sag: 0, rings: 0 },
  ];
  for (const c of extremes) {
    const fr0 = sc.render({ time: 123.456, reduced: false, cast: c, splash: { age: 0.3, x: 470 } });
    assert.ok(fr0.every((v) => v >>> 24 === 255));
  }
});

test('fishPaint: sprite is 40x24 RGBA, uses its colours, has an outline and an eye; silhouette is one colour', () => {
  const spec = sprites['carpe-lune'];
  const rgba = paintFish(spec);
  assert.equal(rgba.length, FISH_W * FISH_H * 4);
  const colors = new Set();
  let opaque = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i + 3] === 255) {
      opaque++;
      colors.add((rgba[i] << 16) | (rgba[i + 1] << 8) | rgba[i + 2]);
    }
  }
  assert.ok(opaque > 250, 'body pixels: ' + opaque);
  assert.ok(colors.size >= 8 && colors.size <= 40, 'colours: ' + colors.size);
  assert.ok(colors.has(0x1a1238), 'outline colour');
  assert.ok(colors.has(0xffffff), 'eye');
  const sil = paintFish(spec, { silhouette: true });
  const s2 = new Set();
  for (let i = 0; i < sil.length; i += 4) if (sil[i + 3] === 255) s2.add((sil[i] << 16) | (sil[i + 1] << 8) | sil[i + 2]);
  assert.equal(s2.size, 1);
  assert.deepEqual(paintFish(spec), paintFish(spec));
});

test('framePaint: concentric layers, notched corners, centre colour; the four mock-up frames build', () => {
  const f = paintFrame(9, ['#000000', '#ff0000', '#00ff00'], true);
  assert.equal(f.length, 9 * 9 * 4);
  assert.equal(f[3], 0); // corner pixel (0,0) is empty
  assert.equal(f[(4 * 9 + 0) * 4 + 3], 255); // left edge middle
  assert.deepEqual([...f.slice((1 * 9 + 4) * 4, (1 * 9 + 4) * 4 + 3)], [255, 0, 0]); // second layer
  assert.deepEqual([...f.slice((4 * 9 + 4) * 4, (4 * 9 + 4) * 4 + 3)], [0, 255, 0]); // centre
  assert.equal(paintFrame(9, ['#000000'], false)[3], 255); // no notch
  for (const k of ['panel', 'slot', 'btn', 'btn2']) {
    const fr0 = FRAMES[k];
    assert.equal(fr0.build().length, fr0.size * fr0.size * 4);
  }
});

test('dither: ratio 0 = never, ratio 1 = always, in between = proportional', () => {
  let n0 = 0;
  let n1 = 0;
  let nh = 0;
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      if (dith(x, y, 0)) n0++;
      if (dith(x, y, 1)) n1++;
      if (dith(x, y, 0.5)) nh++;
    }
  }
  assert.deepEqual([n0, n1, nh], [0, 16, 8]);
});

test('icons: every map is rectangular, 11 pixels wide, drawn with # and .', () => {
  for (const [name, map] of Object.entries(icons)) {
    assert.ok(map.length >= 7 && map.length <= 11, name);
    for (const row of map) assert.match(row, /^[#.]{11}$/, name);
    assert.ok(map.join('').includes('#'));
  }
});

test('fishPaint: the 24 species - nothing is cut by the 40x24 canvas, each has an outline and its own silhouette, same input = same pixels', () => {
  assert.equal(Object.keys(sprites).length, speciesList.length);
  const silhouettes = new Set();
  const colorSets = new Set();
  for (const sp of speciesList) {
    const spec = sprites[sp.sprite];
    assert.ok(spec, 'sprite of ' + sp.id);
    const b = fishBounds(spec);
    assert.ok(b.minX >= 1 && b.minY >= 1 && b.maxX <= FISH_W - 2 && b.maxY <= FISH_H - 2, `${sp.id} touches the canvas edge: ${JSON.stringify(b)}`);
    const full = paintFish(spec);
    let opaque = 0;
    const cols = new Set();
    for (let i = 0; i < full.length; i += 4) {
      if (full[i + 3] === 255) {
        opaque++;
        cols.add((full[i] << 16) | (full[i + 1] << 8) | full[i + 2]);
      }
    }
    assert.ok(opaque >= 90, `${sp.id}: ${opaque} pixels`);
    assert.ok(cols.has(0x1a1238), sp.id + ' outline');
    assert.ok(cols.has(0xffffff) || spec.eye === 'half' || spec.eyeColor, sp.id + ' eye');
    assert.deepEqual(full, paintFish(spec));
    const sil = paintFish(spec, { silhouette: true });
    silhouettes.add(Buffer.from(sil).toString('base64'));
    colorSets.add(Buffer.from(full).toString('base64'));
  }
  assert.equal(silhouettes.size, speciesList.length, 'all silhouettes differ');
  assert.equal(colorSets.size, speciesList.length, 'all sprites differ');
});
