// Code-made pieces of the interior rooms (brief 31): the small things the Kenney packs do not have (a wood stove with its pipe, a forge, a shop scale,
// a door bell, bait jars, spools of line, a vice, a fishing net, a rod rack, drawings, maps, wall shelves and boards, a candle). Pure: each painter
// pushes boxes / cylinders / cones into a builder (world/geo.js createBuilder, or the capture builder of interior/layout.js), so they are merged with
// the furniture (no extra draw call). Colours: lin(hex) (sRGB -> linear) is passed in.
//
// Placement (data/interiors.js): { kind, x, z, y (base), rot } like the models; rot 0 = the front faces +z (the room), the back is toward -z (the back
// wall). Wall pieces (wall: 'n' | 'w'): their back lies on the wall plane (local z = 0 at x/z of the prop), they grow toward the room.
// Sizes are in metres; the angler sprite is about 1.5 m tall, a door 2.05 m.

/** Local frame of a piece: P(lx, ly, lz) -> world point; turn = the rotation for builder.box. */
function frame(q) {
  const c = Math.cos(q.rot || 0);
  const s = Math.sin(q.rot || 0);
  const y0 = q.y || 0;
  return { at: (lx, lz) => [q.x + lx * c + lz * s, q.z - lx * s + lz * c], y0, turn: q.rot || 0 };
}
/** A box in the local frame: centre (lx, lz), base at ly (above the piece base), size w (local x) x h x d (local z). */
const boxL = (b, f, lx, ly, lz, w, h, d, col) => {
  const [x, z] = f.at(lx, lz);
  b.box(x, f.y0 + ly, z, w, h, d, col, f.turn);
};
const cylL = (b, f, lx, ly, lz, r, h, n, col) => {
  const [x, z] = f.at(lx, lz);
  b.cyl(x, f.y0 + ly, z, r, h, n, col);
};
const coneL = (b, f, lx, ly, lz, r, h, n, col) => {
  const [x, z] = f.at(lx, lz);
  b.cone(x, f.y0 + ly, z, r, h, n, col, (f.turn || 0) + Math.PI / 4);
};

/** A rod rack on a wall: two rails, three rods with their reels, a landing net hanging under them. 1.0 m wide, 0.2 to 2.1 m high. */
export function rodRack(b, q, lin) {
  const f = frame(q);
  const rail = lin('#6a4a34');
  boxL(b, f, 0, 1.55, 0.05, 1.0, 0.08, 0.1, rail);
  boxL(b, f, 0, 0.75, 0.05, 1.0, 0.08, 0.1, rail);
  for (let i = 0; i < 3; i++) {
    boxL(b, f, -0.32 + i * 0.32, 0.6, 0.12, 0.03, 1.35 + (i % 2) * 0.15, 0.03, lin(i === 1 ? '#a8845a' : '#8a6644'));
    boxL(b, f, -0.32 + i * 0.32, 0.95, 0.15, 0.06, 0.06, 0.06, lin('#4a4a52'));
  }
  boxL(b, f, 0, 0.2, 0.06, 1.0, 0.5, 0.02, lin('#c8b890'));
}

/**
 * A stove with its pipe to the wall: q.w wide (0.6 default), cast iron on short legs, a door with a warm window, a top plate, the pipe going up from the
 * back then into the wall at q.pipe metres (1.9 default). q.kettle: a kettle on top; q.pot: a stew pot on top; q.oven: a second door (a cook stove).
 */
export function stove(b, q, lin) {
  const f = frame(q);
  const w = q.w || 0.6;
  const d = q.d || 0.5;
  const iron = lin('#3c3436');
  const dark = lin('#262224');
  const glow = lin('#ff9a48');
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) boxL(b, f, sx * (w / 2 - 0.05), 0, sz * (d / 2 - 0.05), 0.06, 0.08, 0.06, dark);
  boxL(b, f, 0, 0.08, 0, w, 0.5, d, iron);
  boxL(b, f, 0, 0.58, 0, w + 0.04, 0.04, d + 0.04, dark);
  // the fire door (with its glowing window) and, for a cook stove, the oven door
  const fx = q.oven ? -w / 4 : 0;
  boxL(b, f, fx, 0.18, d / 2 + 0.005, 0.26, 0.24, 0.02, dark);
  boxL(b, f, fx, 0.24, d / 2 + 0.016, 0.16, 0.1, 0.01, glow);
  boxL(b, f, fx + 0.1, 0.3, d / 2 + 0.03, 0.03, 0.03, 0.02, lin('#c8a050'));
  if (q.oven) {
    boxL(b, f, w / 4, 0.16, d / 2 + 0.005, 0.26, 0.3, 0.02, dark);
    boxL(b, f, w / 4, 0.4, d / 2 + 0.025, 0.18, 0.025, 0.02, lin('#c8a050'));
  }
  // the pipe: up from the back of the top plate, then a short elbow into the wall behind
  const back = -d / 2;
  const py = q.pipe || 1.9;
  cylL(b, f, 0, 0.62, back + 0.1, 0.065, py - 0.62, 8, dark);
  boxL(b, f, 0, py - 0.13, (back + 0.1 + back - (q.gap ?? 0.1)) / 2, 0.13, 0.13, 0.1 + (q.gap ?? 0.1), dark);
  if (q.kettle) {
    cylL(b, f, w * 0.18, 0.62, 0.06, 0.08, 0.12, 8, lin('#8a9aa8'));
    cylL(b, f, w * 0.18, 0.74, 0.06, 0.035, 0.04, 6, lin('#6a7a88'));
    boxL(b, f, w * 0.18 + 0.1, 0.68, 0.06, 0.07, 0.025, 0.025, lin('#8a9aa8'));
  }
  if (q.pot) {
    cylL(b, f, w * 0.2, 0.62, 0.04, 0.13, 0.15, 10, lin('#4a4446'));
    cylL(b, f, w * 0.2, 0.77, 0.04, 0.135, 0.02, 10, lin('#5a5456'));
    boxL(b, f, w * 0.2, 0.79, 0.04, 0.05, 0.03, 0.05, lin('#c8a050'));
  }
}

/** A small forge of stone: a hearth of coals under a hood, its chimney up to the top of the wall (q.top, 2.5 default). 1.0 x 0.8 m. */
export function forge(b, q, lin) {
  const f = frame(q);
  const stone = lin('#8a7a72');
  const stoneD = lin('#6a5c56');
  boxL(b, f, 0, 0, 0, 1.0, 0.72, 0.8, stone);
  boxL(b, f, 0, 0.72, 0, 1.04, 0.06, 0.84, stoneD);
  boxL(b, f, 0, 0.74, 0.05, 0.6, 0.05, 0.45, lin('#2a2020'));
  for (const [lx, lz] of [[-0.15, 0.05], [0.08, -0.05], [0.18, 0.12], [-0.04, 0.16]]) boxL(b, f, lx, 0.78, lz, 0.11, 0.04, 0.1, lin('#ff8a3a'));
  // the arch in the front of the base (wood store) and the hood on two posts
  boxL(b, f, 0, 0.08, 0.402, 0.5, 0.3, 0.01, lin('#2a2020'));
  for (const sx of [-1, 1]) boxL(b, f, sx * 0.46, 0.78, -0.34, 0.08, 0.62, 0.08, stoneD);
  boxL(b, f, 0, 1.4, -0.05, 1.0, 0.12, 0.7, stoneD);
  coneL(b, f, 0, 1.52, -0.08, 0.5, 0.34, 4, stone);
  const top = (q.top || 2.5) - (q.y || 0);
  boxL(b, f, 0, 1.75, -0.12, 0.26, top - 1.75, 0.26, stoneD);
}

/** A shop scale for fish: a base, a post, a beam with two pans hung on cords. 0.34 wide, 0.32 high. */
export function scale(b, q, lin) {
  const f = frame(q);
  const brass = lin('#c8a050');
  const dark = lin('#6a4a34');
  boxL(b, f, 0, 0, 0, 0.24, 0.03, 0.14, dark);
  boxL(b, f, 0, 0.03, 0, 0.03, 0.27, 0.03, brass);
  boxL(b, f, 0, 0.29, 0, 0.36, 0.022, 0.025, brass);
  for (const sx of [-1, 1]) {
    boxL(b, f, sx * 0.165, 0.15, 0, 0.006, 0.14, 0.006, lin('#4a4038'));
    cylL(b, f, sx * 0.165, 0.135, 0, 0.07, 0.015, 10, brass);
  }
}

/** The door bell: an iron bracket out of the wall and a small brass bell under it (wall piece, q.y = the bracket height). */
export function bell(b, q, lin) {
  const f = frame(q);
  boxL(b, f, 0, 0, 0.09, 0.025, 0.025, 0.18, lin('#3a3436'));
  boxL(b, f, 0, -0.05, 0.16, 0.008, 0.05, 0.008, lin('#3a3436'));
  coneL(b, f, 0, -0.13, 0.16, 0.05, 0.08, 8, lin('#d8b050'));
  boxL(b, f, 0, -0.15, 0.16, 0.02, 0.02, 0.02, lin('#a07830'));
}

/** A candle in a brass dish (its flame is the light's glow). 0.11 m. */
export function candle(b, q, lin) {
  const f = frame(q);
  cylL(b, f, 0, 0, 0, 0.045, 0.015, 8, lin('#c8a050'));
  cylL(b, f, 0, 0.015, 0, 0.018, 0.09, 6, lin('#f2e6c8'));
}

/** A row of q.n (3) jars of bait: glass, a dark filling, a cork lid. 0.12 m high, 0.12 m apart. */
export function jars(b, q, lin) {
  const f = frame(q);
  const n = q.n || 3;
  const fill = ['#6a4a3a', '#8a6a3a', '#5a5a3a'];
  for (let i = 0; i < n; i++) {
    const lx = (i - (n - 1) / 2) * 0.13;
    cylL(b, f, lx, 0, 0, 0.055, 0.085, 8, lin(fill[i % 3]));
    cylL(b, f, lx, 0.085, 0, 0.055, 0.04, 8, lin('#a8ccc4'));
    cylL(b, f, lx, 0.125, 0, 0.06, 0.024, 8, lin('#c8a070'));
  }
}

/** q.n (3) spools of fishing line on their flanges, side by side. 0.07 m high. */
export function spools(b, q, lin) {
  const f = frame(q);
  const n = q.n || 3;
  const line = ['#5a8ac0', '#7aa86a', '#e8dcc0', '#c86a5a'];
  for (let i = 0; i < n; i++) {
    const lx = (i - (n - 1) / 2) * 0.12;
    cylL(b, f, lx, 0, 0, 0.05, 0.012, 8, lin('#8a6644'));
    cylL(b, f, lx, 0.012, 0, 0.04, 0.046, 8, lin(line[i % 4]));
    cylL(b, f, lx, 0.058, 0, 0.05, 0.012, 8, lin('#8a6644'));
  }
}

/** A bench vice (to clamp at the front edge of a workbench): base, fixed and moving jaws, the screw and its handle. */
export function vice(b, q, lin) {
  const f = frame(q);
  const iron = lin('#5a5a64');
  boxL(b, f, 0, 0, 0, 0.14, 0.04, 0.12, iron);
  boxL(b, f, 0, 0.04, -0.035, 0.14, 0.09, 0.04, iron);
  boxL(b, f, 0, 0.04, 0.05, 0.14, 0.08, 0.035, iron);
  boxL(b, f, 0, 0.07, 0.1, 0.025, 0.025, 0.08, lin('#3a3a42'));
  boxL(b, f, 0, 0.07, 0.145, 0.12, 0.015, 0.015, lin('#3a3a42'));
}

/** A fishing net hung on a wall (q.w wide, q.h high, 1.0 x 0.8 default), a mesh of cords with cork and red floats along the top. */
export function net(b, q, lin) {
  const f = frame(q);
  const w = q.w || 1.0;
  const h = q.h || 0.8;
  const cord = lin('#c8b890');
  for (let i = 0; i <= 6; i++) boxL(b, f, -w / 2 + (i * w) / 6, 0, 0.02, 0.012, h * (0.8 + 0.2 * Math.sin(i * 1.3) ** 2), 0.012, cord);
  for (let j = 0; j < 5; j++) boxL(b, f, 0, h * (0.15 + j * 0.18), 0.025, w * (0.92 - j * 0.03), 0.012, 0.012, cord);
  boxL(b, f, 0, h - 0.01, 0.02, w + 0.06, 0.03, 0.03, lin('#8a6644'));
  for (let i = 0; i < 4; i++) boxL(b, f, -w * 0.36 + i * w * 0.24, h - 0.1, 0.05, 0.07, 0.07, 0.05, lin(i % 2 ? '#c8503a' : '#d8b060'));
}

/** A plain wall board (a tool board, the back of a mounted fish, a sign): q.w x q.h (0.9 x 0.6), 3 cm thick, a darker frame. */
export function board(b, q, lin) {
  const f = frame(q);
  const w = q.w || 0.9;
  const h = q.h || 0.6;
  boxL(b, f, 0, 0, 0.015, w, h, 0.03, lin(q.hex || '#b08a5a'));
  boxL(b, f, 0, 0, 0.032, w, 0.03, 0.006, lin('#6a4a34'));
  boxL(b, f, 0, h - 0.03, 0.032, w, 0.03, 0.006, lin('#6a4a34'));
}

/** A small wall shelf: a board q.w (0.8) x q.d (0.22) on two brackets; q.y = the height of the board's top. */
export function shelf(b, q, lin) {
  const f = frame(q);
  const w = q.w || 0.8;
  const d = q.d || 0.22;
  const wood = lin(q.hex || '#9a7048');
  boxL(b, f, 0, -0.03, d / 2, w, 0.03, d, wood);
  for (const sx of [-1, 1]) {
    boxL(b, f, sx * (w / 2 - 0.08), -0.2, 0.015, 0.03, 0.17, 0.03, wood);
    boxL(b, f, sx * (w / 2 - 0.08), -0.06, d * 0.4, 0.03, 0.03, d * 0.8, wood);
  }
}

/** Children's drawings pinned on a wall: q.n (4) sheets with a fish, a sun, the lake, a person in a big hat. */
export function drawings(b, q, lin) {
  const f = frame(q);
  const paper = lin('#f4ecd8');
  const sheets = [[-0.42, 0.05, 0.26, 0.2], [-0.12, 0.18, 0.24, 0.3], [0.18, 0.0, 0.28, 0.22], [0.45, 0.14, 0.22, 0.26]].slice(0, q.n || 4);
  sheets.forEach(([lx, ly, w, h], i) => {
    boxL(b, f, lx, ly, 0.004, w, h, 0.008, paper);
    const z = 0.011;
    if (i === 0) {
      boxL(b, f, lx - 0.02, ly + h * 0.4, z, 0.1, 0.05, 0.004, lin('#e8843a'));
      boxL(b, f, lx + 0.06, ly + h * 0.38, z, 0.04, 0.07, 0.004, lin('#e8843a'));
    } else if (i === 1) {
      boxL(b, f, lx, ly + h * 0.55, z, 0.08, 0.08, 0.004, lin('#f2c84a'));
      boxL(b, f, lx, ly + 0.03, z, w * 0.8, 0.05, 0.004, lin('#6aa0d0'));
    } else if (i === 2) {
      boxL(b, f, lx, ly + 0.04, z, w * 0.8, 0.09, 0.004, lin('#5a8ac8'));
      boxL(b, f, lx + 0.05, ly + 0.14, z, 0.03, 0.05, 0.004, lin('#3a7a4a'));
    } else {
      boxL(b, f, lx, ly + 0.05, z, 0.05, 0.12, 0.004, lin('#c8503a'));
      boxL(b, f, lx, ly + 0.17, z, 0.12, 0.025, 0.004, lin('#e8c86a'));
    }
    boxL(b, f, lx, ly + h - 0.025, z, 0.015, 0.015, 0.006, lin('#c84a4a'));
  });
}

/** A chart of the lake: pinned on a wall (q.flat: lying on a desk instead). Parchment, the lake in blue, the island, a red cross. 0.6 x 0.42. */
export function chart(b, q, lin) {
  const f = frame(q);
  const w = q.w || 0.6;
  const h = q.h || 0.42;
  const parts = [[0, 0, w, h, '#e8d8a8', 0.006], [-0.03, 0.1, w * 0.55, h * 0.45, '#7aa8c8', 0.004], [-0.1, 0.14, w * 0.3, h * 0.25, '#7aa8c8', 0.004], [0.02, 0.16, 0.05, 0.04, '#8a9a5a', 0.004], [0.16, 0.22, 0.03, 0.03, '#c84a3a', 0.004]];
  if (q.flat) {
    // lying on a surface: local "up" of the sheet is +z, its height is the sheet thickness
    parts.forEach(([lx, ly, pw, ph, hex, t], i) => boxL(b, f, lx, i ? 0.006 : 0, -h / 2 + ly + ph / 2, pw, i ? 0.003 : t, ph, lin(hex)));
    return;
  }
  parts.forEach(([lx, ly, pw, ph, hex, t], i) => boxL(b, f, lx, ly, i ? 0.008 : t / 2, pw, ph, i ? 0.004 : t, lin(hex)));
  for (const sx of [-1, 1]) boxL(b, f, sx * (w / 2 - 0.03), h - 0.04, 0.012, 0.018, 0.018, 0.008, lin('#c84a4a'));
}

/** Rods standing up in a barrel or a jar (q.n, 4): thin poles of q.h (1.4) with a reel on two of them. */
export function rods(b, q, lin) {
  const f = frame(q);
  const n = q.n || 4;
  const h = q.h || 1.4;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const lx = Math.cos(a) * 0.09;
    const lz = Math.sin(a) * 0.09;
    boxL(b, f, lx, 0, lz, 0.025, h - (i % 2) * 0.2, 0.025, lin(i % 2 ? '#a8845a' : '#7a5a3a'));
    if (i % 2 === 0) boxL(b, f, lx + 0.03, 0.55, lz, 0.05, 0.05, 0.05, lin('#4a4a52'));
  }
}

/** A row of book spines standing on a shelf (q.n, 6), each its own colour and height. */
export function bookrow(b, q, lin) {
  const f = frame(q);
  const n = q.n || 6;
  const cols = ['#8a3a3a', '#3a5a8a', '#6a8a4a', '#c8a050', '#5a3a6a', '#a86a3a', '#3a6a6a'];
  let lx = -n * 0.025;
  for (let i = 0; i < n; i++) {
    const w = 0.035 + (i % 3) * 0.01;
    boxL(b, f, lx + w / 2, 0, 0, w, 0.18 + ((i * 7) % 5) * 0.015, 0.14, lin(cols[(i + (q.seed || 0)) % cols.length]));
    lx += w + 0.004;
  }
}

/** A reading stand for the fishing journal: a foot, a post, a sloping top with the open carnet on it. About 1.0 m high. */
export function lectern(b, q, lin) {
  const f = frame(q);
  const wood = lin('#8a6040');
  boxL(b, f, 0, 0, 0, 0.36, 0.04, 0.3, wood);
  boxL(b, f, 0, 0.04, 0, 0.07, 0.8, 0.07, wood);
  boxL(b, f, 0, 0.84, -0.04, 0.44, 0.04, 0.12, wood);
  // the sloping board (front low, back high) and the open carnet on it
  const P = (lx, ly, lz) => {
    const [x, z] = f.at(lx, lz);
    return [x, f.y0 + ly, z];
  };
  const slope = (w, d, y0, y1, dz, col) => {
    b.quad(P(-w / 2, y1, -d / 2 + dz), P(-w / 2, y0, d / 2 + dz), P(w / 2, y0, d / 2 + dz), P(w / 2, y1, -d / 2 + dz), col);
    b.quad(P(-w / 2, y0 - 0.03, d / 2 + dz), P(w / 2, y0 - 0.03, d / 2 + dz), P(w / 2, y0, d / 2 + dz), P(-w / 2, y0, d / 2 + dz), col);
  };
  slope(0.46, 0.34, 0.86, 1.0, 0, wood);
  slope(0.38, 0.26, 0.885, 0.99, 0.01, lin('#f2e6c8'));
  boxL(b, f, 0, 0.885, 0.0, 0.012, 0.11, 0.26, lin('#a85a3a'));
}

/** Letters on a desk: a small stack of envelopes tied with a ribbon and one open letter beside it. */
export function letters(b, q, lin) {
  const f = frame(q);
  for (let i = 0; i < 4; i++) boxL(b, f, -0.08 + (i % 2) * 0.01, i * 0.012, 0, 0.16, 0.012, 0.11, lin(i % 2 ? '#efe2c4' : '#e6d4b0'));
  boxL(b, f, -0.08, 0, 0, 0.02, 0.05, 0.115, lin('#c84a4a'));
  boxL(b, f, 0.12, 0, 0.02, 0.15, 0.004, 0.2, lin('#f6eedc'));
  for (let i = 0; i < 4; i++) boxL(b, f, 0.12, 0.004, -0.05 + i * 0.035, 0.11, 0.002, 0.008, lin('#6a6a8a'));
}

/** A sheet of paper with a drawing in progress and three short crayons beside it (on a table). */
export function crayons(b, q, lin) {
  const f = frame(q);
  boxL(b, f, 0, 0, 0, 0.3, 0.004, 0.22, lin('#f6eedc'));
  boxL(b, f, -0.03, 0.004, 0.0, 0.1, 0.002, 0.05, lin('#e8843a'));
  boxL(b, f, 0.07, 0.004, -0.04, 0.05, 0.002, 0.05, lin('#f2c84a'));
  ['#c84a4a', '#3a7ac8', '#4a9a5a'].forEach((hex, i) => boxL(b, f, 0.22, 0, -0.06 + i * 0.05, 0.08, 0.018, 0.018, lin(hex)));
}

/** Bunches of herbs drying on a cord (wall piece, q.w wide, q.y = the height of the cord). */
export function herbs(b, q, lin) {
  const f = frame(q);
  const w = q.w || 1.0;
  boxL(b, f, 0, 0, 0.08, w, 0.012, 0.012, lin('#c8b890'));
  for (const sx of [-1, 1]) boxL(b, f, sx * (w / 2), -0.02, 0.04, 0.03, 0.05, 0.08, lin('#6a4a34'));
  const greens = ['#6a8a4a', '#8aa05a', '#7a6a9a', '#5a7a4a', '#9a8a4a'];
  for (let i = 0; i < 5; i++) {
    const lx = -w * 0.38 + (i * w * 0.76) / 4;
    boxL(b, f, lx, -0.03, 0.08, 0.012, 0.03, 0.012, lin('#c8b890'));
    boxL(b, f, lx, -0.2 + (i % 2) * 0.03, 0.08, 0.09, 0.17, 0.07, lin(greens[i]));
  }
}

/** The code-made pieces (kind -> painter). */
export const CODE_PIECES = Object.freeze({ rodrack: rodRack, stove, forge, scale, bell, candle, jars, spools, vice, net, board, shelf, drawings, chart, rods, bookrow, lectern, letters, crayons, herbs });
