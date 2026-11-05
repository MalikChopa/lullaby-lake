// Pixel icons: draws the maps of data/icons.js on small canvases (CSS scales them with nearest-neighbour).
import icons, { ICON_W, ICON_H } from '../data/icons.js';

export function drawIcon(canvas, name, color) {
  const map = icons[name];
  if (!map) return;
  canvas.width = ICON_W;
  canvas.height = ICON_H;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, ICON_W, ICON_H);
  ctx.fillStyle = color || '#fdf2dc';
  const top = (ICON_H - map.length) >> 1;
  map.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) if (row[x] === '#') ctx.fillRect(x, y + top, 1, 1);
  });
}

/** Paints every <canvas data-ic="name"> under root; dark on the light buttons, light everywhere else. */
export function paintIcons(root = document) {
  root.querySelectorAll('canvas[data-ic]').forEach((c) => drawIcon(c, c.dataset.ic, c.closest('.btn:not(.alt)') ? '#2a1c30' : '#fdf2dc'));
}
