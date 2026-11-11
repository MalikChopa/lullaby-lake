// The dream fish of "La Berceuse du lac" (J12-A): the fish that carry the couplets of the lullaby. DATA ONLY. They are species in the exact format of
// src/data/species.js (which is read-only) + a sprite spec for src/art/fishPaint.js + their requirements (the format of data/economy.js NEEDS, plus
// the story fields below). Every name and number was validated by the owner on 2026-11-10.
//
// EXTENDING (J12-B): append one entry to DREAM_FISH (couplet 6, 7, 8 ...). Nothing else is needed: DREAM_SPECIES, DREAM_SPRITES and DREAM_NEEDS are derived,
// the draw, the journal page, the story engine and the tests read these lists.
//   needs.requires : story flag that must be set before the fish can bite (always `couplet.<n-1>.found`: never before the previous couplet)
//   needs.spots    : fishing spot ids (data/map.js SPOTS) where it bites; where = { waterZone: minimum rod tier } as for every species
//   needs.lantern  : true = the fishing lantern must be lit (the gear that "matters")
//   weather        : 0 = never in that weather. The weights are raised (x3 .. x12) so that, once the conditions are right, the fish comes within a few bites:
//                    the luck guarantee of the core (75 bites at the pace `long`) is only the last safety net.
// Story fields: couplet (1..8), glow (the catch card gets a soft light and a text line).

const ALL = ['dawn', 'day', 'dusk', 'night'];
const SEASONS = ['spring', 'summer', 'autumn', 'winter'];

export const DREAM_FISH = Object.freeze([
  {
    couplet: 1,
    species: {
      id: 'murmure-aube', name: { fr: 'Murmure d’aube', en: 'Dawn Murmur' }, rarity: 2,
      phases: ['dawn'], seasons: SEASONS, weather: { clear: 3, cloudy: 3, rain: 3, mist: 3 },
      sizeCm: { min: 10, mode: 14, max: 20 },
      desc: { fr: 'Un petit rêve rose qui fredonne quand le jour hésite encore.', en: 'A small pink dream that hums while the day is still making up its mind.' },
      hint: { fr: 'À l’aube, au bout du ponton.', en: 'At dawn, at the end of the pier.' }, sprite: 'murmure-aube',
    },
    sprite: { colors: ['#f2a0b4', '#fff0e6', '#ffd6a0'], rx: 11, ry: 5, pat: 'dots', dotColor: '#fff6d8', tailStyle: 'veil', dorsal: 'veil', notes: true, sheen: true, tail: 8 },
    needs: { family: 'silver', where: { pier: 1 }, spots: ['pier'], requires: 'story.started' },
  },
  {
    couplet: 2,
    species: {
      id: 'chant-roseau', name: { fr: 'Chanteur des roseaux', en: 'Reed Singer' }, rarity: 2,
      phases: ALL, seasons: SEASONS, weather: { rain: 4, clear: 0, cloudy: 0, mist: 0 },
      sizeCm: { min: 14, mode: 20, max: 30 },
      desc: { fr: 'Il pose une note sur chaque goutte de pluie et garde la plus jolie.', en: 'It sets a note on every raindrop and keeps the prettiest one.' },
      hint: { fr: 'Sous la pluie, au bout du caillebotis.', en: 'In the rain, at the end of the boardwalk.' }, sprite: 'chant-roseau',
    },
    sprite: { colors: ['#6fae8e', '#e0f0d0', '#b8d890'], rx: 13, ry: 4, pat: 'stripe', tailStyle: 'veil', dorsal: 'spines', notes: true, tail: 8 },
    needs: { family: 'carp', where: { reeds: 1 }, spots: ['boardwalk'], requires: 'couplet.1.found' },
  },
  {
    couplet: 3,
    species: {
      id: 'lanterne-dormeuse', name: { fr: 'Lanterne dormeuse', en: 'Sleeping Lantern' }, rarity: 3,
      phases: ['dusk', 'night'], seasons: SEASONS, weather: { clear: 8, cloudy: 8, rain: 8, mist: 8 },
      sizeCm: { min: 16, mode: 22, max: 34 },
      desc: { fr: 'Une flamme douce dans un ventre rond. Elle attend qu’on lui tende une lumière.', en: 'A gentle flame in a round belly. It waits for someone to hold up a light.' },
      hint: { fr: 'Crépuscule ou nuit, bout du ponton, lanterne allumée.', en: 'Dusk or night, end of the pier, lantern lit.' }, sprite: 'lanterne-dormeuse',
    },
    sprite: { colors: ['#f4d27a', '#fff6d8', '#f0a060'], rx: 9, ry: 7, cy: 14, pat: 'none', antenna: true, dorsal: 'none', ventral: 'none', sideFin: false, tail: 6, glow: true, notes: true },
    needs: { family: 'glow', where: { pier: 1 }, spots: ['pier'], lantern: true, requires: 'couplet.2.found' },
  },
  {
    couplet: 4,
    species: {
      id: 'echarpe-brume', name: { fr: 'Écharpe de brume', en: 'Mist Scarf' }, rarity: 3,
      phases: ALL, seasons: SEASONS, weather: { mist: 12, clear: 0, cloudy: 0, rain: 0 },
      sizeCm: { min: 30, mode: 44, max: 70 },
      desc: { fr: 'Longue, pâle, elle s’enroule autour des pins et du silence.', en: 'Long and pale, it winds itself around the pines and the silence.' },
      hint: { fr: 'Dans la brume, à la pointe aux pins, canne de noisetier ou mieux.', en: 'In the mist, at Pine Point, hazel rod or better.' }, sprite: 'echarpe-brume',
    },
    sprite: { colors: ['#b8c4e0', '#f4f2fa', '#8c9ccc'], ribbon: true, rx: 17, ry: 2, pat: 'none', steam: true, notes: true },
    needs: { family: 'giant', where: { deep: 2 }, spots: ['point'], requires: 'couplet.3.found' },
  },
  {
    couplet: 5,
    species: {
      id: 'lueur-marche', name: { fr: 'Lueur du marché', en: 'Market Glimmer' }, rarity: 3,
      phases: ['dusk', 'night'], seasons: SEASONS, weather: { clear: 10, cloudy: 10, rain: 10, mist: 10 },
      sizeCm: { min: 12, mode: 17, max: 26 },
      desc: { fr: 'Elle brille comme une lampe de village et se sauve avec la dernière étincelle.', en: 'It shines like a village lamp and slips away with the last spark.' },
      hint: { fr: 'Au crépuscule ou la nuit, sur la plage du village.', en: 'At dusk or at night, on the village beach.' }, sprite: 'lueur-marche',
    },
    sprite: { colors: ['#ee8a5a', '#ffe8b0', '#ffd24a'], rx: 8, ry: 7, pat: 'none', rays: true, dorsal: 'none', ventral: 'none', sheen: true, glow: true, tail: 5 },
    needs: { family: 'silver', where: { shallow: 1 }, spots: ['beach'], requires: 'couplet.4.found' },
  },
  // ---- J12-B: the three that need the boat (their spots are boat spots or the islet's own shore). Validated by the owner on 2026-11-10 like the rest.
  {
    couplet: 6,
    species: {
      id: 'veilleur-abysse', name: { fr: 'Veilleur d’abysse', en: 'Deep Watcher' }, rarity: 3,
      phases: ['dusk', 'night'], seasons: SEASONS, weather: { clear: 10, cloudy: 10, mist: 10, rain: 0 },
      sizeCm: { min: 24, mode: 34, max: 52 },
      desc: { fr: 'Il porte une petite lampe et veille au fond du lac. Il ne monte que quand tout est calme.', en: 'It carries a small lamp, keeping watch on the lake bed. It rises only when all is calm.' },
      hint: { fr: 'En barque, grands fonds, crépuscule ou nuit, sans pluie.', en: 'By boat, the great deep, dusk or night, no rain.' }, sprite: 'veilleur-abysse',
    },
    sprite: { colors: ['#4a5aa8', '#c8d8ff', '#7ad0e0'], rx: 12, ry: 7, pat: 'dots', dotColor: '#e8f4ff', antenna: true, dorsal: 'veil', ventral: 'none', glow: true, notes: true, tail: 7 },
    needs: { family: 'glow', where: { deep: 2 }, spots: ['depths'], requires: 'couplet.5.found' },
  },
  {
    couplet: 7,
    species: {
      id: 'reflet-ilot', name: { fr: 'Reflet de l’îlot', en: 'Islet Reflection' }, rarity: 3,
      phases: ['dawn', 'dusk'], seasons: SEASONS, weather: { clear: 10, cloudy: 10, rain: 10, mist: 10 },
      sizeCm: { min: 18, mode: 26, max: 38 },
      desc: { fr: 'On dirait l’îlot vu à l’envers, avec une étoile à la place de l’arbre.', en: 'It looks like the islet upside down, with a star where the tree should be.' },
      hint: { fr: 'Rive de l’îlot, à l’aube ou au crépuscule.', en: 'From the islet shore, at dawn or at dusk.' }, sprite: 'reflet-ilot',
    },
    sprite: { colors: ['#d8c8f0', '#ffffff', '#a8b8f0'], rx: 10, ry: 6, pat: 'stripe', tailStyle: 'veil', dorsal: 'veil', notes: true, sheen: true, glow: true, tail: 7 },
    needs: { family: 'silver', where: { deep: 2 }, spots: ['islet'], requires: 'couplet.6.found' },
  },
  {
    couplet: 8,
    species: {
      id: 'dernier-songe', name: { fr: 'Le Dernier Songe', en: 'The Last Dream' }, rarity: 4,
      phases: ['night'], seasons: SEASONS, weather: { clear: 12, cloudy: 8, mist: 0, rain: 0 },
      sizeCm: { min: 40, mode: 58, max: 90 },
      desc: { fr: 'Le plus doux des rêves du Dormeur. Il garde le dernier couplet sous sa nageoire.', en: 'The gentlest of the Sleeper’s dreams. It keeps the last couplet under its fin.' },
      hint: { fr: 'Cœur du lac, nuit sans pluie ni brume. Roseau argenté ou mieux.', en: 'Heart of the lake, night, no rain or mist. Silver reed rod or better.' }, sprite: 'dernier-songe',
    },
    sprite: { colors: ['#f4d27a', '#fff6d8', '#e08ac8'], rx: 15, ry: 8, pat: 'dots', dotColor: '#fffbe8', tailStyle: 'veil', dorsal: 'veil', notes: true, sheen: true, glow: true, tail: 9 },
    needs: { family: 'glow', where: { deep: 3 }, spots: ['heart'], requires: 'couplet.7.found' },
  },
]);

/** Species of the dream fish, in the format of src/data/species.js, marked `dream: true` and with their couplet. */
export const DREAM_SPECIES = Object.freeze(DREAM_FISH.map((d) => Object.freeze({ ...d.species, dream: true, couplet: d.couplet })));
/** Sprite specs by sprite name (merged with src/data/fishSprites.js by data/allSpecies.js). */
export const DREAM_SPRITES = Object.freeze(Object.fromEntries(DREAM_FISH.map((d) => [d.species.sprite, d.sprite])));
/** Requirements by species id (merged with data/economy.js NEEDS by data/allSpecies.js). */
export const DREAM_NEEDS = Object.freeze(Object.fromEntries(DREAM_FISH.map((d) => [d.species.id, { ...d.needs, story: true }])));
