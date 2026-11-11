// The interior rooms as DATA (no logic): the cabin, the Boutique, the Atelier and the four village houses (brief 28). Pure: importable from Node tests.
// Room frame (metres): the floor is x in [0, w] (east) and z in [0, d] (south, toward the camera); the BACK wall is at z = 0 and the WEST wall at x = 0 (both
// visible: the front wall and the roof are left out, a diorama). y = up. The camera looks from the south-east.
//
// Props: { m: model id (INTERIOR_MODEL_FILES of data/models.js, or a shared world model of MODEL_FILES) | kind: a code-made piece, x, z, rot, h | w (size in metres), y (lift), fp: [w, d] footprint that
// blocks walking (none = walk-over: rugs, wall pieces), when: story condition (see interior/logic.js), swap: { class: '#hex' } recolour, lean }.
// rot: 0 = the front faces +z (the room), PI/2 = faces east (a piece against the west wall), PI = faces north, -PI/2 = faces west.
// Interactables: positions and labels only (the shell wires what they do): { id, kind, x, z, r }. Labels: data/strings-interior.js 'int.obj.<id>'.
// Lights: { kind: 'lamp' | 'candle' | 'hearth', x, y, z, when?, r? (radius of the glowing opening of a lamp), i? (strength, 1 = a full lamp) }: they glow at
// night (and always for the hearth) and sit IN their source (a lamp, a candle, a stove, a forge: checked by interior/layout.js). Windows: on the 'n' (back) or 'w' (west) wall.
// Coherence (brief 31, interior/layout.js): wall: 'n' | 'w' (hung on / leaning against that wall), flat: true (a rug), tuck: [i] (may overlap piece i: a chair
// pushed under its table), sx / sy / sz (stretch); an item put on a piece rests at the height of one of its surfaces (`node tools/interior-sheet.mjs --inventory`).

const H = Math.PI / 2;
const p = (m, x, z, rot, size, o = {}) => ({ m, x, z, rot, ...size, ...o });
const hh = (h) => ({ h });
const ww = (w) => ({ w });

export const ROOMS = {
  cabin: {
    id: 'cabin',
    building: 'cabin',
    w: 7,
    d: 5.5,
    wallH: 2.6,
    floor: { kind: 'planks', hex: '#c9a070' },
    wall: { kind: 'wood', hex: '#d9b27c', trim: '#8a5a3a' },
    door: { wall: 'n', x: 5.3, w: 1.0, h: 2.05, hex: '#9a6440' },
    windows: [{ wall: 'w', at: 2.75, w: 1.2, h: 1.0, y: 1.0 }, { wall: 'n', at: 2.0, w: 1.3, h: 1.0, y: 1.1 }],
    spawn: [5.3, 1.2],
    // Grandma's fishing cabin: the stove and its firewood in the warm corner with the cat's cushion, the window seat under the back window,
    // her desk and its letters, the rod rack by the door, the carnet on its stand, the round table on its rug, the bed against the west wall.
    props: [
      { kind: 'stove', x: 0.38, z: 1.45, rot: H, w: 0.6, d: 0.5, kettle: true, pipe: 1.95, gap: 0.12, fp: [0.66, 0.66] },
      p('log_s', 0.32, 0.42, H, ww(0.62), { fp: [0.37, 0.62] }),
      p('i_pillow', 1.3, 2.62, 0.4, ww(0.6), { lean: -H, sz: 0.5, y: 0.06 }),
      p('i_seatLow', 2.0, 0.36, 0, ww(1.3), { fp: [1.3, 0.66] }),
      p('i_pillow', 1.62, 0.16, 0.15, ww(0.36), { y: 0.619 }),
      p('i_pillow', 2.38, 0.16, -0.12, ww(0.36), { y: 0.619 }),
      p('i_desk', 3.6, 0.45, 0, hh(0.78), { fp: [1.45, 0.8] }),
      p('i_chairC', 3.6, 1.35, Math.PI, hh(0.95), { fp: [0.5, 0.5] }),
      { kind: 'letters', x: 3.45, z: 0.5, y: 0.78, rot: 0.1 },
      p('i_books', 3.0, 0.3, 0.2, hh(0.16), { y: 0.78 }),
      p('i_lampT', 4.1, 0.3, 0, hh(0.45), { y: 0.78 }),
      { kind: 'rodrack', x: 6.5, z: 0, rot: 0, wall: 'n' },
      p('i_pot', 6.7, 5.1, 0, hh(0.8), { fp: [0.45, 0.45] }),
      { kind: 'lectern', x: 6.6, z: 2.7, rot: -H, fp: [0.46, 0.34] },
      p('i_rugR', 4.3, 3.6, 0, ww(2.6), { flat: true }),
      p('i_tableO', 4.3, 3.6, 0, hh(0.75), { fp: [1.1, 1.1] }),
      p('i_chair', 3.3, 3.6, H, hh(0.95), { fp: [0.45, 0.45] }),
      p('i_chair', 5.3, 3.6, -H, hh(0.95), { fp: [0.45, 0.45] }),
      p('i_lampT', 4.3, 3.6, 0, hh(0.42), { y: 0.75, when: { couplet: 6 } }),
      p('i_bedS', 0.95, 4.55, H, hh(0.62), { fp: [1.0, 1.9] }),
      p('i_bear', 0.75, 4.8, H, hh(0.4), { y: 0.413, when: { couplet: 3 } }),
      p('i_side', 0.3, 3.55, H, hh(0.55), { fp: [0.5, 0.45] }),
      p('i_lampT', 0.3, 3.45, 0, hh(0.42), { y: 0.55 }),
      { kind: 'candle', x: 0.32, z: 3.75, y: 0.55, rot: 0, when: { couplet: 3 } },
    ],
    interactables: [
      { id: 'cabin.bed', kind: 'sleep', x: 2.25, z: 4.4, r: 0.7 },
      { id: 'cabin.desk', kind: 'letters', x: 3.6, z: 1.9, r: 0.7 },
      { id: 'cabin.seat', kind: 'lullaby', x: 2.0, z: 1.15, r: 0.6 },
      { id: 'cabin.stove', kind: 'hearth', x: 1.2, z: 1.55, r: 0.5 },
      { id: 'cabin.carnet', kind: 'carnet', x: 5.9, z: 2.7, r: 0.6 },
      { id: 'cabin.rods', kind: 'rods', x: 6.65, z: 1.0, r: 0.5 },
    ],
    lights: [
      { kind: 'hearth', x: 0.66, y: 0.3, z: 1.45 },
      { kind: 'lamp', x: 4.1, y: 1.22, z: 0.3 },
      { kind: 'lamp', x: 0.3, y: 0.96, z: 3.45, i: 0.6 },
      { kind: 'candle', x: 0.32, y: 0.655, z: 3.75, when: { couplet: 3 } },
      { kind: 'lamp', x: 4.3, y: 1.16, z: 3.6, when: { couplet: 6 } },
    ],
    cat: { x: 1.15, z: 2.35 },
    life: ['steam', 'dust'],
  },

  shop: {
    id: 'shop',
    building: 'shop',
    w: 7.5,
    d: 5.5,
    wallH: 2.7,
    floor: { kind: 'planks', hex: '#cfa97a' },
    wall: { kind: 'plaster', hex: '#e8c8a8', trim: '#6a3a2a' },
    door: { wall: 'n', x: 1.4, w: 1.0, h: 2.05, hex: '#4a6a4a' },
    windows: [{ wall: 'w', at: 2.6, w: 1.2, h: 1.0, y: 1.0 }, { wall: 'n', at: 3.0, w: 1.2, h: 1.0, y: 1.1 }],
    spawn: [1.4, 1.2],
    // A small fishing shop: the customers come in by the door (north-west) and walk the west aisle (rods, bait, nets) to the counter; Mme Ondine
    // stands behind the counter, her shelves of goods on the back wall behind her.
    props: [
      // the counter: three cabinets with drawers in a row, a wooden top; on it the scale, bait jars, the ledger, a lamp
      p('i_counter', 4.2, 2.75, 0, hh(0.95), { sz: 0.72, fp: [0.91, 0.69], swap: { stone: '#8a5a3a' } }),
      p('i_counter', 5.11, 2.75, 0, hh(0.95), { sz: 0.72, fp: [0.91, 0.69], swap: { stone: '#8a5a3a' } }),
      p('i_counter', 6.02, 2.75, 0, hh(0.95), { sz: 0.72, fp: [0.91, 0.69], swap: { stone: '#8a5a3a' } }),
      { kind: 'scale', x: 4.38, z: 2.72, y: 0.887, rot: 0 },
      { kind: 'jars', x: 5.08, z: 2.62, y: 0.887, rot: 0, n: 3 },
      p('i_books', 5.42, 2.85, 0.25, hh(0.12), { y: 0.887 }),
      p('i_ship', 6.05, 2.75, H, ww(0.45), { y: 0.887 }),
      p('i_lampT', 3.95, 2.62, 0, hh(0.45), { y: 0.887 }),
      // behind the counter: open shelves of goods, the closed cupboard with the model boat on top, a mounted fish, a wall lamp
      p('i_shelfO', 4.45, 0.28, 0, hh(1.9), { fp: [0.9, 0.56] }),
      p('i_shelfC', 5.4, 0.28, 0, hh(1.9), { fp: [0.9, 0.56] }),
      p('i_shelfO', 6.35, 0.28, 0, hh(1.9), { fp: [0.9, 0.56] }),
      p('lantern', 4.3, 0.3, 0, hh(0.36), { y: 1.317 }),
      { kind: 'jars', x: 4.5, z: 0.3, y: 0.799, rot: 0, n: 3 },
      { kind: 'spools', x: 6.35, z: 0.3, y: 0.799, rot: 0, n: 3 },
      p('box', 6.35, 0.3, 0, hh(0.25), { y: 1.317 }),
      { kind: 'board', x: 4.45, z: 0, y: 2.0, rot: 0, w: 0.62, h: 0.34, hex: '#9a7048', wall: 'n' },
      p('i_fish', 4.45, 0.09, 0, ww(0.5), { y: 2.04, wall: 'n' }),
      p('i_lampW', 3.85, 0.09, 0, ww(0.28), { y: 1.75, wall: 'n' }),
      // the west aisle: the rod rack by the door, a low shelf of bait under the window, a barrel of rods and a net
      { kind: 'rodrack', x: 0, z: 1.15, rot: H, wall: 'w' },
      p('i_shelfL', 0.28, 2.6, H, hh(0.9), { fp: [0.9, 0.56] }),
      { kind: 'jars', x: 0.3, z: 2.6, y: 0.832, rot: H, n: 4 },
      p('i_barrelO', 0.42, 4.05, 0, hh(0.75), { fp: [0.6, 0.6] }),
      { kind: 'rods', x: 0.42, z: 4.05, y: 0.051, rot: 0, n: 4, h: 1.45 },
      { kind: 'net', x: 0, z: 4.1, y: 1.0, rot: H, w: 1.0, h: 0.8, wall: 'w' },
      p('i_crateB', 1.4, 5.0, 0.25, ww(0.75), { fp: [0.8, 0.8] }),
      // the door: a bell above it, a doormat; a rug where the customers wait; a plant in the corner
      { kind: 'bell', x: 2.05, z: 0, y: 2.1, rot: 0, wall: 'n' },
      p('i_mat', 1.4, 0.75, 0, ww(1.0), { flat: true }),
      p('i_rugR', 5.1, 3.5, 0, ww(2.4), { flat: true }),
      p('i_pot', 7.05, 5.0, 0, hh(0.85), { fp: [0.5, 0.5] }),
    ],
    shopkeeper: { id: 'shopkeeper', x: 5.0, z: 1.75 },
    interactables: [
      { id: 'shop.counter', kind: 'counter', x: 5.1, z: 3.6, r: 0.6 },
      { id: 'shop.bell', kind: 'bell', x: 2.25, z: 1.0, r: 0.5 },
      { id: 'shop.shelf', kind: 'shelf', x: 1.05, z: 2.6, r: 0.7 },
      { id: 'shop.scale', kind: 'scale', x: 4.2, z: 3.6, r: 0.5 },
      { id: 'shop.ship', kind: 'lore', x: 6.2, z: 3.6, r: 0.5 },
    ],
    lights: [
      { kind: 'lamp', x: 3.95, y: 1.3, z: 2.62 },
      { kind: 'lamp', x: 3.85, y: 1.8, z: 0.12 },
    ],
    cat: null,
    life: ['dust'],
  },

  workshop: {
    id: 'workshop',
    building: 'workshop',
    w: 7,
    d: 5.5,
    wallH: 2.5,
    floor: { kind: 'planks', hex: '#b08a62' },
    wall: { kind: 'wood', hex: '#a87a52', trim: '#6a4a34' },
    door: { wall: 'n', x: 3.0, w: 1.4, h: 2.15, hex: '#6a4a34' },
    windows: [{ wall: 'w', at: 2.3, w: 1.1, h: 0.9, y: 1.1 }, { wall: 'n', at: 1.25, w: 1.2, h: 0.9, y: 1.2 }],
    spawn: [3.0, 1.3],
    // The repairer's workshop: the long bench on the back wall (vice, spools, a lamp) under its tool board, spare rods in a barrel by the door,
    // the grindstone under the window, the forge and its anvil in the west corner, the chest and the crates of parts on the east side.
    props: [
      p('i_table', 5.75, 0.36, 0, ww(2.0), { sz: 0.65, fp: [2.0, 0.7] }),
      { kind: 'vice', x: 5.0, z: 0.6, y: 0.777, rot: 0 },
      { kind: 'spools', x: 5.85, z: 0.3, y: 0.777, rot: 0, n: 4 },
      p('i_lampT', 6.5, 0.25, 0, hh(0.42), { y: 0.777 }),
      p('i_hammer', 6.1, 0.5, H, hh(0.3), { y: 0.867, roll: H }),
      { kind: 'board', x: 5.6, z: 0, y: 1.15, rot: 0, w: 1.7, h: 0.8, hex: '#c8a070', wall: 'n' },
      p('i_hammer', 5.0, 0.085, 0, hh(0.4), { y: 1.35, wall: 'n' }),
      p('i_axe', 5.55, 0.06, 0, hh(0.5), { y: 1.3, wall: 'n' }),
      p('i_pickaxe', 6.15, 0.076, 0, hh(0.55), { y: 1.28, wall: 'n' }),
      p('i_barrelO', 4.3, 0.4, 0, hh(0.7), { fp: [0.55, 0.55] }),
      { kind: 'rods', x: 4.3, z: 0.4, y: 0.05, rot: 0.4, n: 4, h: 1.5 },
      p('i_grind', 1.25, 0.5, H, hh(0.95), { fp: [1.1, 0.9] }),
      { kind: 'forge', x: 0.42, z: 3.95, rot: H, top: 2.5, fp: [1.04, 0.84] },
      p('i_anvil', 1.75, 4.65, 0, hh(0.8), { fp: [0.8, 0.7] }),
      p('i_bucket', 1.25, 3.05, 0, hh(0.4), { fp: [0.36, 0.36] }),
      p('i_chest', 6.55, 2.6, -H, hh(0.6), { fp: [0.8, 0.6] }),
      p('i_crate', 6.45, 4.0, 0, ww(0.8), { fp: [0.8, 0.8] }),
      p('i_boxO', 6.45, 3.3, 0.3, ww(0.5), { fp: [0.5, 0.5] }),
      p('i_barrel', 6.55, 4.95, 0, hh(0.8), { fp: [0.55, 0.55] }),
      p('i_stool', 4.75, 1.4, 0, hh(0.62), { fp: [0.4, 0.4] }),
      p('i_lampF', 0.4, 5.05, 0, hh(1.55), { fp: [0.4, 0.4] }),
    ],
    interactables: [
      { id: 'workshop.bench', kind: 'repair', x: 5.8, z: 1.55, r: 0.8 },
      { id: 'workshop.anvil', kind: 'anvil', x: 2.6, z: 4.65, r: 0.6 },
      { id: 'workshop.grind', kind: 'grind', x: 1.25, z: 1.55, r: 0.6 },
      { id: 'workshop.rods', kind: 'rods', x: 4.15, z: 1.2, r: 0.5 },
      { id: 'workshop.chest', kind: 'chest', x: 5.7, z: 2.75, r: 0.6 },
    ],
    lights: [
      { kind: 'lamp', x: 6.5, y: 1.17, z: 0.25 },
      { kind: 'lamp', x: 0.4, y: 1.52, z: 5.05, r: 0.1 },
      { kind: 'hearth', x: 0.5, y: 0.86, z: 3.95, when: { always: true } },
    ],
    cat: null,
    resident: { id: 'repairer', x: 6.0, z: 1.45 },
    life: ['dust', 'sparks'],
  },

  houseA: {
    id: 'houseA',
    building: 'houseA',
    w: 6,
    d: 5,
    wallH: 2.5,
    floor: { kind: 'planks', hex: '#d2b087' },
    wall: { kind: 'plaster', hex: '#efe2c8', trim: '#7a4a34' },
    door: { wall: 'n', x: 4.4, w: 1.0, h: 2.05, hex: '#7a4a34' },
    windows: [{ wall: 'w', at: 2.2, w: 1.2, h: 1.0, y: 1.0 }, { wall: 'n', at: 1.8, w: 1.2, h: 1.0, y: 1.1 }],
    spawn: [4.4, 1.2],
    // Pomme's room: a little drawing table under the window, her drawings pinned between the window and the door, the bed with the teddy bear
    // and a night light, the toy chest and the toys out on the rug (a wooden boat, a wooden fish, three very important pebbles), a low shelf of books.
    props: [
      p('i_table', 1.8, 0.45, 0, ww(1.2), { sz: 0.8, fp: [1.2, 0.6] }),
      p('i_chair', 1.8, 1.15, Math.PI, hh(0.75), { fp: [0.4, 0.4] }),
      { kind: 'crayons', x: 1.75, z: 0.45, y: 0.476, rot: 0.15 },
      p('i_lampT', 2.25, 0.3, 0, hh(0.36), { y: 0.476 }),
      { kind: 'drawings', x: 3.1, z: 0, y: 1.15, rot: 0, n: 4, wall: 'n' },
      p('i_shelfL', 0.28, 0.75, H, hh(0.9), { fp: [0.9, 0.56] }),
      p('i_books', 0.3, 0.6, H, hh(0.14), { y: 0.832 }),
      p('i_plant1', 0.3, 1.0, 0, hh(0.3), { y: 0.832 }),
      p('i_bedS', 0.92, 3.95, H, hh(0.6), { fp: [0.95, 1.85] }),
      p('i_bear', 0.62, 4.15, H, hh(0.36), { y: 0.4 }),
      p('i_side', 0.28, 3.05, H, hh(0.5), { fp: [0.5, 0.45] }),
      p('i_lampT', 0.28, 3.05, 0, hh(0.34), { y: 0.5 }),
      p('i_rugO', 2.9, 3.0, 0, ww(1.9), { flat: true }),
      p('i_chest', 2.15, 4.6, 0, hh(0.5), { fp: [0.65, 0.5] }),
      p('boat_row', 3.0, 3.2, 0.5, ww(0.42), { y: 0.0 }),
      p('i_fish', 2.6, 2.75, 1.1, ww(0.26), { lean: H, y: 0.045 }),
      p('stone_s1', 3.35, 2.65, 0, ww(0.08)),
      p('stone_s1', 3.47, 2.72, 1.2, ww(0.07)),
      p('stone_s1', 3.4, 2.82, 2.1, ww(0.06)),
      p('i_pot', 5.5, 2.4, 0, hh(0.8), { fp: [0.45, 0.45] }),
    ],
    interactables: [
      { id: 'houseA.toys', kind: 'toys', x: 3.0, z: 3.95, r: 0.6 },
      { id: 'houseA.drawing', kind: 'drawing', x: 3.1, z: 0.85, r: 0.6 },
      { id: 'houseA.bed', kind: 'bed', x: 2.1, z: 3.6, r: 0.5 },
      { id: 'houseA.table', kind: 'chat', x: 2.6, z: 1.45, r: 0.6 },
    ],
    lights: [
      { kind: 'lamp', x: 2.25, y: 0.83, z: 0.3, i: 0.7 },
      { kind: 'lamp', x: 0.28, y: 0.83, z: 3.05, i: 0.45 },
    ],
    cat: null,
    resident: { id: 'child', x: 2.55, z: 2.2 },
    life: ['dust'],
  },

  houseB: {
    id: 'houseB',
    building: 'houseB',
    w: 6.2,
    d: 5,
    wallH: 2.5,
    floor: { kind: 'planks', hex: '#a98062' },
    wall: { kind: 'plaster', hex: '#e8c8a8', trim: '#6a3a2a' },
    door: { wall: 'n', x: 1.5, w: 1.0, h: 2.05, hex: '#4a6a4a' },
    windows: [{ wall: 'w', at: 2.3, w: 1.2, h: 1.0, y: 1.0 }, { wall: 'n', at: 4.6, w: 1.2, h: 1.0, y: 1.1 }],
    spawn: [1.5, 1.2],
    // Captain Roseau's home: his coat by the door, the chart table with a chart of the lake and a candle, the same chart pinned above,
    // the model boat on top of the bookcase, the sea chest under an old oar, the ship's lantern on a barrel, the big bed in the warm corner.
    props: [
      p('i_coat', 0.35, 0.4, 0.3, hh(1.7), { fp: [0.5, 0.5] }),
      p('i_desk', 3.0, 0.45, 0, hh(0.78), { fp: [1.45, 0.8] }),
      p('i_chairC', 3.0, 1.35, Math.PI, hh(0.95), { fp: [0.5, 0.5] }),
      { kind: 'chart', x: 3.0, z: 0.5, y: 0.78, rot: 0.08, flat: true, w: 0.5, h: 0.36 },
      p('i_books', 2.45, 0.3, 0.2, hh(0.16), { y: 0.78 }),
      { kind: 'candle', x: 3.55, z: 0.35, y: 0.78, rot: 0 },
      { kind: 'chart', x: 3.0, z: 0, y: 1.2, rot: 0, w: 0.7, h: 0.48, wall: 'n' },
      p('i_shelfO', 5.72, 0.28, 0, hh(1.8), { fp: [0.9, 0.56] }),
      { kind: 'bookrow', x: 5.72, z: 0.3, y: 0.757, rot: 0, n: 7, seed: 2 },
      p('i_bottle', 5.5, 0.3, 0, hh(0.3), { y: 1.247 }),
      p('i_ship', 5.72, 0.3, 0, ww(0.55), { y: 1.739 }),
      p('i_chest', 0.36, 3.45, H, hh(0.6), { fp: [0.8, 0.6] }),
      p('paddle', 0.07, 3.95, H, hh(1.5), { roll: H, y: 1.68, wall: 'w' }),
      p('i_barrel', 0.45, 4.55, 0, hh(0.75), { fp: [0.55, 0.55] }),
      p('i_lantern', 0.45, 4.55, 0, hh(0.42), { y: 0.73 }),
      p('i_rugR', 3.95, 3.75, H, ww(2.2), { flat: true }),
      p('i_bedD', 5.15, 3.75, -H, hh(0.6), { fp: [1.5, 1.8] }),
    ],
    interactables: [
      { id: 'houseB.chest', kind: 'chest', x: 1.2, z: 3.45, r: 0.6 },
      { id: 'houseB.maps', kind: 'map', x: 3.0, z: 1.9, r: 0.6 },
      { id: 'houseB.model', kind: 'lore', x: 5.5, z: 1.15, r: 0.6 },
      { id: 'houseB.lantern', kind: 'lamp', x: 1.25, z: 4.55, r: 0.5 },
    ],
    lights: [
      { kind: 'candle', x: 3.55, y: 0.885, z: 0.35 },
      { kind: 'lamp', x: 0.45, y: 1.1, z: 4.55, r: 0.05 },
    ],
    cat: null,
    resident: { id: 'sailor', x: 2.2, z: 2.4 },
    life: ['dust'],
  },

  houseC: {
    id: 'houseC',
    building: 'houseC',
    w: 6,
    d: 5,
    wallH: 2.5,
    floor: { kind: 'planks', hex: '#d6b88c' },
    wall: { kind: 'plaster', hex: '#f2ead8', trim: '#5a4a3a' },
    door: { wall: 'n', x: 1.3, w: 1.0, h: 2.05, hex: '#8a5a3a' },
    windows: [{ wall: 'w', at: 2.4, w: 1.2, h: 1.0, y: 1.0 }, { wall: 'n', at: 3.9, w: 1.4, h: 1.0, y: 1.1 }],
    spawn: [1.3, 1.2],
    // The forager's kitchen: the cooking run on the west wall (a cupboard under the wall cabinet, the sink under the window, the wood cook stove
    // with its stew pot and pipe, firewood), herbs drying over the back window above the sideboard and its basket of mushrooms, the pantry,
    // the table with its cloth, a candle and a little plant, on a rug.
    props: [
      p('i_cab', 0.4, 1.4, H, hh(0.8), { sz: 0.95, fp: [0.76, 0.72] }),
      p('i_cabU', 0.2, 1.4, H, hh(0.6), { y: 1.45, wall: 'w' }),
      p('i_sink', 0.4, 2.35, H, hh(0.8), { sz: 0.95, fp: [0.76, 0.72] }),
      { kind: 'stove', x: 0.36, z: 3.55, rot: H, w: 0.9, d: 0.6, pot: true, oven: true, pipe: 1.9, gap: 0.06, fp: [0.94, 0.7] },
      p('log_s', 0.32, 4.55, H, ww(0.6), { fp: [0.36, 0.6] }),
      p('i_bar', 3.9, 0.36, 0, ww(1.0), { fp: [1.0, 0.6] }),
      p('mush_t', 3.65, 0.45, 0, ww(0.3), { y: 0.977 }),
      { kind: 'herbs', x: 3.9, z: 0, y: 2.38, rot: 0, w: 1.3, wall: 'n' },
      p('i_shelfC', 5.55, 0.28, 0, hh(1.8), { fp: [0.9, 0.56] }),
      p('i_rugR', 3.6, 3.3, 0, ww(2.4), { flat: true }),
      p('i_tableC', 3.6, 3.3, 0, hh(0.75), { fp: [1.5, 0.9] }),
      p('i_chair', 2.7, 3.3, H, hh(0.95), { fp: [0.45, 0.45], tuck: [10] }),
      p('i_chair', 4.5, 3.3, -H, hh(0.95), { fp: [0.45, 0.45], tuck: [10] }),
      p('i_plant2', 3.35, 3.25, 0, hh(0.3), { y: 0.75 }),
      { kind: 'candle', x: 3.85, z: 3.35, y: 0.75, rot: 0 },
      p('i_pot', 5.5, 1.3, 0, hh(0.85), { fp: [0.45, 0.45] }),
    ],
    interactables: [
      { id: 'houseC.kitchen', kind: 'kitchen', x: 1.35, z: 3.0, r: 0.7 },
      { id: 'houseC.table', kind: 'chat', x: 3.6, z: 2.3, r: 0.6 },
      { id: 'houseC.plant', kind: 'plant', x: 5.0, z: 1.75, r: 0.5 },
    ],
    lights: [
      { kind: 'hearth', x: 0.74, y: 0.3, z: 3.55, when: { always: true } },
      { kind: 'candle', x: 3.85, y: 0.855, z: 3.35 },
    ],
    cat: null,
    resident: { id: 'forager', x: 2.2, z: 2.0 },
    life: ['steam', 'dust'],
  },

  houseD: {
    id: 'houseD',
    building: 'houseD',
    w: 6,
    d: 5,
    wallH: 2.5,
    floor: { kind: 'planks', hex: '#c8a888' },
    wall: { kind: 'plaster', hex: '#dcd0e8', trim: '#5a4060' },
    door: { wall: 'n', x: 4.6, w: 1.0, h: 2.05, hex: '#5a5a8a' },
    windows: [{ wall: 'w', at: 2.0, w: 1.3, h: 1.1, y: 0.9 }, { wall: 'n', at: 1.7, w: 1.2, h: 1.0, y: 1.1 }],
    spawn: [4.6, 1.2],
    // The walker's reading nook: the armchair under the back window between the floor lamp and the little table with the radio, the bookcases on
    // the west wall, the coffee table with a book and a candle on a round rug, a map of the paths on the wall, the walking coat and hat by the door.
    props: [
      p('i_lampF', 0.4, 0.4, 0, hh(1.5), { fp: [0.4, 0.4] }),
      p('i_lounge', 1.45, 0.62, 0, hh(0.9), { fp: [1.0, 0.85] }),
      p('i_pillow', 1.45, 0.45, 0, ww(0.36), { y: 0.43 }),
      p('i_side', 2.55, 0.4, 0, hh(0.55), { fp: [0.6, 0.45] }),
      p('i_radio', 2.55, 0.38, 0, ww(0.42), { y: 0.55 }),
      { kind: 'chart', x: 3.3, z: 0, y: 1.2, rot: 0, w: 0.6, h: 0.42, wall: 'n' },
      p('i_coat', 5.6, 0.4, -0.3, hh(1.7), { fp: [0.5, 0.5] }),
      p('i_shelfC', 0.3, 3.4, H, hh(1.8), { fp: [0.9, 0.56] }),
      p('i_shelfO', 0.3, 4.35, H, hh(1.8), { fp: [0.9, 0.56] }),
      { kind: 'bookrow', x: 0.3, z: 4.35, y: 0.757, rot: H, n: 7, seed: 0 },
      { kind: 'bookrow', x: 0.3, z: 4.35, y: 1.247, rot: H, n: 6, seed: 3 },
      p('i_rugO', 2.4, 2.75, 0, ww(2.1), { flat: true }),
      p('i_coffee', 2.4, 2.75, 0, ww(1.1), { fp: [1.1, 0.65] }),
      p('i_books', 2.2, 2.75, 0.4, hh(0.12), { y: 0.383 }),
      { kind: 'candle', x: 2.7, z: 2.7, y: 0.383, rot: 0 },
      p('i_pot', 5.5, 3.6, 0, hh(1.0), { fp: [0.5, 0.5] }),
      p('i_plant1', 3.55, 0.35, 0, hh(0.35), { fp: [0.35, 0.35] }),
    ],
    interactables: [
      { id: 'houseD.nook', kind: 'book', x: 1.6, z: 1.55, r: 0.6 },
      { id: 'houseD.shelf', kind: 'shelf', x: 1.2, z: 3.85, r: 0.7 },
      { id: 'houseD.radio', kind: 'radio', x: 2.75, z: 1.25, r: 0.5 },
      { id: 'houseD.garden', kind: 'window', x: 0.75, z: 2.2, r: 0.5 },
    ],
    lights: [
      { kind: 'lamp', x: 0.4, y: 1.45, z: 0.4, r: 0.1, i: 0.6 },
      { kind: 'candle', x: 2.7, y: 0.488, z: 2.7 },
    ],
    cat: { x: 1.9, z: 3.5 },
    resident: { id: 'walker', x: 3.4, z: 2.3 },
    life: ['dust'],
  },
};

export const ROOM_IDS = Object.freeze(Object.keys(ROOMS));
/** Building id (data/map.js) -> room id. */
export const ROOM_OF_BUILDING = Object.freeze(Object.fromEntries(Object.values(ROOMS).map((r) => [r.building, r.id])));

/**
 * Who is home, by the phase of the day: the keepers of the shop and the workshop are always there (the counter and the bench must always work), the other residents
 * come and go. A villager not at home leaves the room empty and cosy (`int.out.<room>` is said at the door). Nothing depends on it: couplets, letters and the boat
 * unlock can also be had outside. The walk outside is unchanged (the villagers keep wandering): this list only decides who shows inside.
 */
export const SCHEDULE = Object.freeze({
  shopkeeper: Object.freeze({ always: true }),
  repairer: Object.freeze({ always: true }),
  child: Object.freeze({ home: Object.freeze(['dawn', 'night']) }),
  sailor: Object.freeze({ home: Object.freeze(['dusk', 'night']) }),
  forager: Object.freeze({ home: Object.freeze(['dawn', 'dusk']) }),
  walker: Object.freeze({ home: Object.freeze(['day', 'night']) }),
});
/** The dialogue (DIALOGUES / ROOM_DIALOGUES) of each villager. */
export const TALK_OF = Object.freeze({ shopkeeper: 'ondine', child: 'pomme', sailor: 'roseau', forager: 'forager', walker: 'walker', repairer: 'repairer' });

/**
 * What each interactable does (the shell wires them: interior/actions.js and app/interiorMode.js).
 * do: 'sleep' the bed; 'letters' the journal on Grandma's letters; 'lullaby' the window seat (dialogue 'seat', only the couplets found); 'book' the carnet; 'counter' Mme Ondine's
 * greeting then the shop; 'repair' the Atelier panel; 'rods' a one-liner, or the free emergency string while the gear is worn; 'line' a one-liner (text key int.look.<id>).
 */
export const ACTIONS = Object.freeze({
  'cabin.bed': { do: 'sleep', btn: 'use' },
  'cabin.desk': { do: 'letters', btn: 'use' },
  'cabin.seat': { do: 'lullaby', btn: 'use' },
  'cabin.carnet': { do: 'book', btn: 'use' },
  'cabin.stove': { do: 'line' },
  'cabin.rods': { do: 'rods' },
  'shop.counter': { do: 'counter', btn: 'talk' },
  'shop.bell': { do: 'line' },
  'shop.shelf': { do: 'line' },
  'shop.scale': { do: 'line' },
  'shop.ship': { do: 'line' },
  'workshop.bench': { do: 'repair', btn: 'use' },
  'workshop.anvil': { do: 'line' },
  'workshop.grind': { do: 'line' },
  'workshop.rods': { do: 'line' },
  'workshop.chest': { do: 'line' },
  'houseA.toys': { do: 'line' },
  'houseA.drawing': { do: 'line' },
  'houseA.bed': { do: 'line' },
  'houseA.table': { do: 'line' },
  'houseB.chest': { do: 'line' },
  'houseB.maps': { do: 'line' },
  'houseB.model': { do: 'line' },
  'houseB.lantern': { do: 'line' },
  'houseC.kitchen': { do: 'line' },
  'houseC.table': { do: 'line' },
  'houseC.plant': { do: 'line' },
  'houseD.nook': { do: 'line' },
  'houseD.shelf': { do: 'line' },
  'houseD.radio': { do: 'line' },
  'houseD.garden': { do: 'line' },
});

/** The bed offers to sleep until dawn or dusk (data only: the shell wires it). */
export const SLEEP = Object.freeze({ room: 'cabin', interactable: 'cabin.bed', options: Object.freeze(['dawn', 'dusk']) });
