// Art pass data: which 3D models the world uses (Kenney CC0 packs, see refonte/assets/models/CREDITS.txt) and the palette grade.
// MODEL_FILES: id (the shipped file refonte/assets/models/<id>.glb) -> { pack, file (name of the model in that pack), role }.
// The packs are private (maquette/packs/extracted, never published): `node refonte/tools/art-bake.mjs --ship` bakes only the models listed
// here into lean GLBs (no texture, vertex colours) in refonte/assets/models/.

/** Palette grade applied to every model colour (world/models.js harmonize): saturation, warm tint, lift, levels per channel. */
export const HARMONY = Object.freeze({
  // [source hue, target hue, saturation multiplier, lightness multiplier]; the sources are the Kenney colours (see CREDITS.txt):
  // lavender grey stone ~229, salmon wood ~18, tan / yellow ~38, teal leaves ~155-168, cyan glass ~190, red ~352
  anchors: Object.freeze([[0, 355, 0.9, 1], [18, 26, 0.62, 0.8], [40, 42, 0.85, 0.95], [100, 96, 0.84, 1.0], [154, 102, 0.8, 1.04], [168, 108, 0.76, 1.06], [182, 158, 0.66, 0.9], [200, 204, 0.6, 1], [229, 268, 0.28, 1], [275, 275, 0.8, 1], [330, 345, 0.9, 1]].map((a) => Object.freeze(a))),
  sat: 0.92,
  warm: Object.freeze([1.03, 1.0, 0.94]),
  lift: 0.01,
  steps: 24,
});

const nat = (file) => ({ pack: 'nature-kit', file });
const town = (file) => ({ pack: 'fantasy-town-kit_2.0', file });
const pirate = (file) => ({ pack: 'pirate-kit', file });
const surv = (file) => ({ pack: 'survival-kit', file });
const furn = (file) => ({ pack: 'furniture-kit', file });

export const MODEL_FILES = {
  // pines and trees (Nature Kit)
  pine_a: nat('tree_pineTallA'), pine_b: nat('tree_pineTallB'), pine_c: nat('tree_pineTallC_detailed'), pine_d: nat('tree_pineRoundA'), pine_e: nat('tree_pineRoundC'), pine_f: nat('tree_pineDefaultA'),
  tree_a: nat('tree_oak'), tree_b: nat('tree_detailed'),
  bush_a: nat('plant_bush'), bush_b: nat('plant_bushDetailed'), bush_c: nat('plant_bushLarge'), bush_d: nat('plant_bushTriangle'),
  stone_l1: nat('stone_largeA'), stone_l2: nat('stone_largeC'), stone_l3: nat('stone_largeE'), stone_s1: nat('stone_smallA'), stone_s2: nat('stone_smallD'), stone_s3: nat('stone_smallG'),
  stone_t1: nat('stone_tallA'), stone_t2: nat('stone_tallC'), stone_t3: nat('stone_tallH'),
  stump_a: nat('stump_old'), stump_b: nat('stump_roundDetailed'), log_a: nat('log'), log_b: nat('log_large'),
  lily_l: nat('lily_large'), lily_s: nat('lily_small'), mush_r: nat('mushroom_redGroup'), mush_t: nat('mushroom_tanGroup'), mush_s: nat('mushroom_red'),
  // the village (Fantasy Town Kit)
  wall_block: town('wall-block'), wall_wood: town('wall-wood-block'), roof: town('roof-gable'), chimney: town('chimney'), lantern: town('lantern'), fence: town('fence'),
  // the boat (Pirate Kit)
  boat_row: pirate('boat-row-small'),
  // props (Survival Kit, Furniture Kit)
  barrel: surv('barrel'), box: surv('box'), signpost: surv('signpost'), bench: furn('bench'),
  // ---- round 2 of the art pass (brief 26)
  // camp life (Survival Kit): the fire, a canvas lean-to, a bare frame (drying rack), a bedroll, a bucket, an axe, fish
  campfire: surv('campfire-pit'), bedroll: surv('bedroll'), bucket: surv('bucket'), axe: surv('tool-axe'), fish_l: surv('fish-large'), fish_s: surv('fish'),
  // nature: firewood, flowers, the forest mix (round trees, slim trees, young pines), ferns, moss, a pot, a tall stump
  log_s: nat('log_stack'), log_sl: nat('log_stackLarge'),
  fl_p1: nat('flower_purpleA'), fl_p2: nat('flower_purpleC'), fl_r1: nat('flower_redA'), fl_r2: nat('flower_redC'), fl_y1: nat('flower_yellowA'), fl_y2: nat('flower_yellowC'),
  fern_a: nat('grass_leafsLarge'), fern_b: nat('plant_flatTall'), moss: nat('hanging_moss'),
  tree_c: nat('tree_default'), tree_d: nat('tree_fat'), tree_e: nat('tree_thin'), tree_g: nat('tree_simple'),
  pine_g: nat('tree_pineGroundA'), pine_s: nat('tree_pineSmallA'), pine_k: nat('tree_cone'),
  pot: nat('pot_small'), stump_t: nat('stump_oldTall'),
  // the village (Fantasy Town Kit): a door and shuttered windows for the walls, posts and planks for porches (the well, the cabin), hedges, banners, a cart
  door: town('wall-wood-door'), window: town('wall-wood-window-shutters'), post: town('pillar-wood'), planks: town('planks'),
  hedge_l: town('hedge-large'), banner: town('banner-red'), cart: town('cart'),
  // the landing (Pirate Kit): an oar to lean on a wall
  paddle: pirate('tool-paddle'),
};

/**
 * The models of the interior rooms (refonte/src/interior, data/interiors.js), loaded only when a room is entered (not at game start). Shipped in
 * refonte/assets/models/interior/<id>.glb; ids start with "i_". Same shape as MODEL_FILES.
 */
export const INTERIOR_MODEL_FILES = {
  // furniture (Furniture Kit)
  i_bedS: furn('bedSingle'), i_bedD: furn('bedDouble'), i_shelfC: furn('bookcaseClosed'), i_shelfO: furn('bookcaseOpen'), i_shelfL: furn('bookcaseOpenLow'),
  i_books: furn('books'), i_chair: furn('chair'), i_chairC: furn('chairCushion'), i_desk: furn('desk'),
  i_lampT: furn('lampRoundTable'), i_lampF: furn('lampRoundFloor'), i_pot: furn('pottedPlant'), i_plant1: furn('plantSmall1'), i_plant2: furn('plantSmall2'),
  i_rugR: furn('rugRectangle'), i_rugO: furn('rugRound'), i_mat: furn('rugDoormat'), i_side: furn('sideTable'), i_table: furn('table'),
  i_tableC: furn('tableCloth'), i_tableO: furn('tableRound'), i_cab: furn('kitchenCabinet'), i_cabU: furn('kitchenCabinetUpper'), i_sink: furn('kitchenSink'),
  i_pillow: furn('pillow'), i_bear: furn('bear'), i_radio: furn('radio'),
  i_lounge: furn('loungeChair'), i_bar: furn('kitchenBar'), i_stool: furn('stoolBar'), i_coffee: furn('tableCoffee'),
  // brief 31 (room coherence): the shop counter (drawer cabinets), a wall lamp, the low window seat, the coat stand
  i_counter: furn('kitchenCabinetDrawer'), i_lampW: furn('lampWall'), i_seatLow: furn('benchCushionLow'), i_coat: furn('coatRackStanding'),
  // the workshop and the chest (Survival Kit), sea things (Pirate Kit), the market stall and the lantern (Fantasy Town Kit)
  i_anvil: surv('workbench-anvil'), i_grind: surv('workbench-grind'), i_chest: surv('chest'), i_hammer: surv('tool-hammer'),
  i_pickaxe: surv('tool-pickaxe'), i_bottle: surv('bottle'), i_barrel: surv('barrel'), i_bucket: surv('bucket'), i_axe: surv('tool-axe'), i_fish: surv('fish-large'),
  i_ship: pirate('ship-small'), i_crateB: pirate('crate-bottles'), i_lantern: town('lantern'),
  // brief 31: an open barrel (rods stand in it), an open box and a crate of parts
  i_barrelO: surv('barrel-open'), i_boxO: surv('box-open'), i_crate: pirate('crate'),
};
