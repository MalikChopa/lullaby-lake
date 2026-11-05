import test from 'node:test';
import assert from 'node:assert/strict';
import { photoFileName } from '../src/render/photo.js';
import config from '../src/data/config.js';
import { W, H } from '../src/art/sceneBake.js';

test('photo: file name = lullaby-lake-YYYYMMDD-HHMMSS.png from the local clock, nothing else', () => {
  assert.equal(photoFileName(new Date(2026, 10, 3, 9, 5, 7)), 'lullaby-lake-20261103-090507.png');
  assert.equal(photoFileName(new Date(2026, 0, 1, 23, 59, 59)), 'lullaby-lake-20260101-235959.png');
  assert.match(photoFileName(new Date()), /^lullaby-lake-\d{8}-\d{6}\.png$/);
});

test('photo: 480x270 enlarged by config.photoScale gives 1920x1080 (the "x4 (1280x720)" of the old 320x180 size is gone)', () => {
  assert.equal(config.photoScale, 4);
  assert.equal(W * config.photoScale, 1920);
  assert.equal(H * config.photoScale, 1080);
});
