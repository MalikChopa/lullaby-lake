// Interface icons of the UI redesign (brief 27), drawn by code: 11 x 11 maps, '#' = pixel, like ecoIcons.js (which they extend: pearl, bucket, rod, bait, float,
// lantern, scroll, letter, check, cross, lock, diamond... live there). Nothing is carried by an icon alone: every icon sits next to a word or a number, or has an
// aria-label / title on its button. drawAny(canvas, name, color) looks the name up here, then in ecoIcons, then in the 2D game's set (camera, book, speaker, close...).

import { ECO_ICONS, ECO_W, ECO_H } from './ecoIcons.js';
import { drawIcon } from '../../../src/ui/icons.js';
import icons2d from '../../../src/data/icons.js';

export const UI_ICONS = Object.freeze({
  // time of day and weather
  sun: ['.....#.....', '.....#.....', '..#.....#..', '....###....', '...#####...', '##.#####.##', '...#####...', '....###....', '..#.....#..', '.....#.....', '.....#.....'],
  moon: ['...####....', '..###......', '.###.......', '.###.......', '####.......', '####.......', '####.......', '.###....##.', '.####..###.', '..#######..', '....###....'],
  dawn: ['...........', '.....#.....', '..#..#..#..', '....###....', '...#####...', '###########', '...........', '.#########.', '...........', '..#######..', '...........'],
  dusk: ['...........', '...........', '...........', '....###....', '...#####...', '###########', '...........', '.#.#.#.#.#.', '...........', '..#.#.#.#..', '...........'],
  cloud: ['...........', '...........', '....###....', '..#######..', '.#########.', '###########', '###########', '.#########.', '...........', '...........', '...........'],
  rain: ['...........', '....###....', '..#######..', '.#########.', '###########', '.#########.', '...........', '..#..#..#..', '.#..#..#...', '...........', '...........'],
  mist: ['...........', '...........', '.#########.', '...........', '#########..', '...........', '.#########.', '...........', '#########..', '...........', '...........'],
  // the menu and its entries
  menu: ['...........', '.#########.', '.#########.', '...........', '.#########.', '.#########.', '...........', '.#########.', '.#########.', '...........', '...........'],
  sliders: ['...........', '.#########.', '...###.....', '...###.....', '...........', '.#########.', '.......###.', '.......###.', '...........', '.#########.', '.....###...'],
  bag: ['....###....', '...#...#...', '..#######..', '.#.......#.', '.#.#####.#.', '.#.#...#.#.', '.#.#####.#.', '.#.......#.', '.#.......#.', '..#######..', '...........'],
  boat: ['.....#.....', '.....##....', '.....###...', '.....####..', '.....#.....', '.....#.....', '.....#.....', '###########', '.#########.', '..#######..', '...........'],
  home: ['.....#.....', '....###....', '...#####...', '..#######..', '.#########.', '..#######..', '..##...##..', '..##.#.##..', '..##.#.##..', '..#######..', '...........'],
  line: ['.....#.....', '.....#.....', '.....#.....', '.....#.....', '.....#.....', '.....#.....', '.....#.....', '.....#.....', '.....#.....', '..#..#.....', '...###.....'],
  spark: ['...........', '.....#.....', '.....#.....', '....###....', '.#########.', '....###....', '.....#.....', '.....#.....', '...........', '...........', '...........'],
  chevDown: ['...........', '...........', '...........', '.##.....##.', '..##...##..', '...##.##...', '....###....', '.....#.....', '...........', '...........', '...........'],
  chevUp: ['...........', '...........', '.....#.....', '....###....', '...##.##...', '..##...##..', '.##.....##.', '...........', '...........', '...........', '...........'],
  hand: ['...#.......', '...#.#.#...', '.#.#.#.#...', '.#.#####...', '.#.######..', '.########..', '..#######..', '..#######..', '...#####...', '...........', '...........'],
});

export const ICON_NAMES = Object.freeze([...new Set([...Object.keys(UI_ICONS), ...Object.keys(ECO_ICONS), ...Object.keys(icons2d)])]);

/** The weather id of src/data/weather.js -> the icon name; the phase -> its icon. */
export const WEATHER_ICON = Object.freeze({ clear: 'sun', cloudy: 'cloud', rain: 'rain', mist: 'mist' });
export const PHASE_ICON = Object.freeze({ dawn: 'dawn', day: 'sun', dusk: 'dusk', night: 'moon' });

function paintMap(canvas, map, color) {
  canvas.width = ECO_W;
  canvas.height = ECO_H;
  const g = canvas.getContext('2d');
  g.clearRect(0, 0, ECO_W, ECO_H);
  g.fillStyle = color;
  map.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) if (row[x] === '#') g.fillRect(x, y, 1, 1);
  });
}

/** Paints the icon `name` (this module, then ecoIcons, then the 2D set) on a canvas. Returns false for an unknown name. */
export function drawAny(canvas, name, color = '#fdf2dc') {
  const map = UI_ICONS[name] || ECO_ICONS[name];
  if (map) {
    paintMap(canvas, map, color);
    canvas.dataset.painted = name;
    return true;
  }
  if (icons2d[name]) {
    drawIcon(canvas, name, color);
    canvas.dataset.painted = name;
    return true;
  }
  return false;
}

/** Paints every <canvas data-uic="name"> under root (the colour comes from the CSS `color` of the canvas, so a button state can change it). */
export function paintUiIcons(root = document) {
  root.querySelectorAll('canvas[data-uic]').forEach((c) => {
    if (c.dataset.painted === c.dataset.uic) return;
    drawAny(c, c.dataset.uic, (typeof getComputedStyle === 'function' && getComputedStyle(c).color) || '#fdf2dc');
  });
}
