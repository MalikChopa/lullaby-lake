// The 24 species of the lake (ARCHITECTURE.md, annexes A and A2; the last 12 were added in J6, appended so saved books stay valid). Data only: adding a species = one entry here + one entry in
// fishSprites.js, nothing in core/. Texts exist in both languages (checked by core/validate.js and tests/data.test.js).
//   rarity   1 common, 2 uncommon, 3 rare, 4 legendary
//   phases   dawn | day | dusk | night       weather  multipliers by weather id (clear, cloudy, rain, mist); 0 = never, absent = 1
//   seasons  kept for later, unused and not shown in the MVP      sizeCm  triangular law (min, mode, max)
//   desc <= 140 characters, hint <= 70 characters (when and in which weather to look; never a number)
const ALL_SEASONS = ['spring', 'summer', 'autumn', 'winter'];

export default Object.freeze([
  {
    id: 'gardon-reveur', name: { fr: 'Gardon rêveur', en: 'Dreamy Roach' }, rarity: 1,
    phases: ['dawn', 'day'], seasons: ALL_SEASONS, weather: { clear: 1.5, rain: 0.5, mist: 0.5 },
    sizeCm: { min: 12, mode: 16, max: 22 },
    desc: { fr: "Il flotte à la surface, les yeux mi-clos, comme s'il écoutait le vent.", en: 'It floats at the surface, eyes half closed, as if listening to the wind.' },
    hint: { fr: "À l'aube et le jour, par temps clair.", en: 'At dawn and by day, in clear weather.' }, sprite: 'gardon-reveur',
  },
  {
    id: 'carpe-lune', name: { fr: 'Carpe lune', en: 'Moon Carp' }, rarity: 1,
    phases: ['dusk', 'night'], seasons: ALL_SEASONS, weather: { clear: 1.2, cloudy: 1, rain: 1, mist: 0.8 },
    sizeCm: { min: 20, mode: 30, max: 45 },
    desc: { fr: 'Ses écailles gardent la lueur du soir bien après le coucher du soleil.', en: 'Its scales keep the evening glow long after the sun has set.' },
    hint: { fr: 'Au crépuscule et la nuit.', en: 'At dusk and at night.' }, sprite: 'carpe-lune',
  },
  {
    id: 'perche-ambree', name: { fr: 'Perche ambrée', en: 'Amber Perch' }, rarity: 1,
    phases: ['day', 'dusk'], seasons: ['spring', 'summer'], weather: { clear: 1.5, rain: 0.6, mist: 0.6 },
    sizeCm: { min: 12, mode: 20, max: 30 },
    desc: { fr: "Rayée comme un vieux pull, elle aime l'ombre du ponton.", en: 'Striped like an old sweater, it loves the shade of the pier.' },
    hint: { fr: 'Le jour et au crépuscule, par temps clair.', en: 'By day and at dusk, in clear weather.' }, sprite: 'perche-ambree',
  },
  {
    id: 'tanche-mousse', name: { fr: 'Tanche mousse', en: 'Moss Tench' }, rarity: 1,
    phases: ['dawn', 'night'], seasons: ALL_SEASONS, weather: { rain: 1.5, clear: 0.7 },
    sizeCm: { min: 18, mode: 26, max: 40 },
    desc: { fr: 'Une petite forêt sur le dos ; elle dort presque tout le temps.', en: 'A tiny forest on its back; it sleeps almost all the time.' },
    hint: { fr: "À l'aube et la nuit, plutôt sous la pluie.", en: 'At dawn and at night, more often in the rain.' }, sprite: 'tanche-mousse',
  },
  {
    id: 'truite-brume', name: { fr: 'Truite brume', en: 'Mist Trout' }, rarity: 2,
    phases: ['dawn', 'day'], seasons: ['spring', 'autumn'], weather: { mist: 4, clear: 0.2, rain: 0.5 },
    sizeCm: { min: 22, mode: 30, max: 45 },
    desc: { fr: "On ne la voit que quand l'eau fume ; elle s'efface si on la regarde trop.", en: 'You only see it when the water steams; it fades if you stare too long.' },
    hint: { fr: "À l'aube et le jour, quand l'eau fume.", en: 'At dawn and by day, when the water steams.' }, sprite: 'truite-brume',
  },
  {
    id: 'anguille-argent', name: { fr: "Anguille d'argent", en: 'Silver Eel' }, rarity: 2,
    phases: ['night'], seasons: ['summer', 'autumn'], weather: { rain: 1.5 },
    sizeCm: { min: 35, mode: 50, max: 80 },
    desc: { fr: 'Un ruban de lune qui se glisse sous le ponton.', en: 'A ribbon of moonlight slipping under the pier.' },
    hint: { fr: 'La nuit, plutôt sous la pluie.', en: 'At night, more often in the rain.' }, sprite: 'anguille-argent',
  },
  {
    id: 'ablette-aurore', name: { fr: 'Ablette aurore', en: 'Dawn Bleak' }, rarity: 2,
    phases: ['dawn'], seasons: ALL_SEASONS, weather: { clear: 1.5, rain: 0.5 },
    sizeCm: { min: 8, mode: 11, max: 15 },
    desc: { fr: 'Elle rosit avec le ciel et file comme une étincelle.', en: 'It blushes with the sky and darts off like a spark.' },
    hint: { fr: "À l'aube, par temps clair.", en: 'At dawn, in clear weather.' }, sprite: 'ablette-aurore',
  },
  {
    id: 'epinoche-etoilee', name: { fr: 'Épinoche étoilée', en: 'Starry Stickleback' }, rarity: 2,
    phases: ['night'], seasons: ['winter'], weather: { clear: 3, cloudy: 0.3, rain: 0, mist: 0.3 },
    sizeCm: { min: 4, mode: 6, max: 9 },
    desc: { fr: 'Minuscule, pointillée de lumière comme un bout de ciel clair.', en: 'Tiny, dotted with light like a scrap of clear sky.' },
    hint: { fr: 'La nuit, quand le ciel est clair.', en: 'At night, under a clear sky.' }, sprite: 'epinoche-etoilee',
  },
  {
    id: 'brochet-ombre', name: { fr: "Brochet d'ombre", en: 'Shadow Pike' }, rarity: 3,
    phases: ['dusk', 'night'], seasons: ['autumn', 'winter'], weather: { cloudy: 1.5, mist: 2, clear: 0.7 },
    sizeCm: { min: 45, mode: 65, max: 95 },
    desc: { fr: "Ombre parmi les ombres ; on dit qu'il garde les rêves du lac.", en: "A shadow among shadows; they say it keeps the lake's dreams." },
    hint: { fr: 'Au crépuscule et la nuit, sous les nuages ou la brume.', en: 'At dusk and at night, under clouds or mist.' }, sprite: 'brochet-ombre',
  },
  {
    id: 'silure-sage', name: { fr: 'Silure sage', en: 'Wise Catfish' }, rarity: 3,
    phases: ['night'], seasons: ['summer'], weather: { rain: 4, clear: 0.3, mist: 0.5 },
    sizeCm: { min: 60, mode: 85, max: 140 },
    desc: { fr: 'Vieux, lent, patient ; il a vu passer bien des pêcheurs.', en: 'Old, slow, patient; it has seen many an angler go by.' },
    hint: { fr: 'La nuit, sous la pluie.', en: 'At night, in the rain.' }, sprite: 'silure-sage',
  },
  {
    id: 'veilleuse', name: { fr: 'Veilleuse', en: 'Nightlight' }, rarity: 3,
    phases: ['night'], seasons: ALL_SEASONS, weather: { mist: 2, rain: 0.7 },
    sizeCm: { min: 6, mode: 9, max: 14 },
    desc: { fr: "Une petite flamme sous l'eau qui raccompagne les autres jusqu'au fond.", en: 'A small flame under the water, seeing the others home to the depths.' },
    hint: { fr: 'La nuit, dans la brume.', en: 'At night, in the mist.' }, sprite: 'veilleuse',
  },
  {
    id: 'berceuse', name: { fr: 'La Berceuse', en: 'The Lullaby' }, rarity: 4,
    phases: ['dawn', 'dusk'], seasons: ALL_SEASONS, weather: { mist: 2 },
    sizeCm: { min: 70, mode: 100, max: 150 },
    desc: { fr: "On dit que c'est elle qui fredonne pour endormir le lac ; personne ne l'a entendue deux fois.", en: 'They say she hums to lull the lake to sleep; no one has heard her twice.' },
    hint: { fr: "À l'aube et au crépuscule, surtout dans la brume.", en: 'At dawn and at dusk, especially in the mist.' }, sprite: 'berceuse',
  },
  // ---- J6: slots 13 to 24 (appended after the first 12, never reordered) ----
  {
    id: 'vairon-miel', name: { fr: 'Vairon miel', en: 'Honey Minnow' }, rarity: 1,
    phases: ['day'], seasons: ['spring', 'summer'], weather: { clear: 1.6, rain: 0.4, mist: 0.5 },
    sizeCm: { min: 5, mode: 8, max: 12 },
    desc: { fr: 'Une goutte de miel qui tourne en rond dans les reflets du soleil.', en: 'A drop of honey circling in the sunlit ripples.' },
    hint: { fr: 'Le jour, quand le soleil brille.', en: 'By day, when the sun is shining.' }, sprite: 'vairon-miel',
  },
  {
    id: 'goujon-pluie', name: { fr: 'Goujon de pluie', en: 'Raindrop Gudgeon' }, rarity: 1,
    phases: ['day', 'dusk'], seasons: ALL_SEASONS, weather: { rain: 2.5, cloudy: 1.3, clear: 0.5, mist: 0.7 },
    sizeCm: { min: 8, mode: 12, max: 18 },
    desc: { fr: "Il saute pour boire les gouttes, comme si l'averse lui chantait une chanson.", en: 'It leaps to sip the drops, as if the shower were singing to it.' },
    hint: { fr: 'Le jour et au crépuscule, surtout quand il pleut.', en: 'By day and at dusk, mostly when it rains.' }, sprite: 'goujon-pluie',
  },
  {
    id: 'breme-nuage', name: { fr: 'Brème nuage', en: 'Cloud Bream' }, rarity: 1,
    phases: ['dawn', 'day'], seasons: ALL_SEASONS, weather: { cloudy: 2.2, clear: 0.6 },
    sizeCm: { min: 25, mode: 35, max: 55 },
    desc: { fr: "Large et douce comme un édredon, elle suit les nuages qui glissent sur l'eau.", en: 'Broad and soft as a quilt, it follows the clouds drifting over the water.' },
    hint: { fr: "À l'aube et le jour, sous un ciel couvert.", en: 'At dawn and by day, under an overcast sky.' }, sprite: 'breme-nuage',
  },
  {
    id: 'chevesne-roseau', name: { fr: 'Chevesne des roseaux', en: 'Reed Chub' }, rarity: 1,
    phases: ['dawn', 'dusk'], seasons: ALL_SEASONS, weather: { cloudy: 1.4, mist: 1.3, clear: 0.7, rain: 0.8 },
    sizeCm: { min: 20, mode: 30, max: 50 },
    desc: { fr: 'Rayé de vert comme les tiges, il écoute le vent dans les roseaux.', en: 'Striped green like the stalks, it listens to the wind in the reeds.' },
    hint: { fr: "À l'aube et au crépuscule, loin du plein soleil.", en: 'At dawn and at dusk, away from the bright sun.' }, sprite: 'chevesne-roseau',
  },
  {
    id: 'rotengle-braise', name: { fr: 'Rotengle braise', en: 'Ember Rudd' }, rarity: 1,
    phases: ['dusk'], seasons: ['summer', 'autumn'], weather: { clear: 1.8, cloudy: 0.9, rain: 0.4, mist: 0.5 },
    sizeCm: { min: 15, mode: 22, max: 35 },
    desc: { fr: "Rouge comme les dernières braises du couchant, elle s'éteint dans l'eau sombre.", en: 'Red as the last embers of sunset, it fades out in the dark water.' },
    hint: { fr: 'Au crépuscule, par ciel dégagé.', en: 'At dusk, under a clear sky.' }, sprite: 'rotengle-braise',
  },
  {
    id: 'sandre-fantome', name: { fr: 'Sandre fantôme', en: 'Ghost Zander' }, rarity: 2,
    phases: ['dusk', 'night'], seasons: ['autumn', 'winter'], weather: { mist: 3, cloudy: 1.2, rain: 0.6, clear: 0.3 },
    sizeCm: { min: 40, mode: 60, max: 90 },
    desc: { fr: "On le devine à peine ; il glisse entre deux brumes sans froisser l'eau.", en: 'You barely sense it; it slips between two mists without ruffling the water.' },
    hint: { fr: 'Au crépuscule et la nuit, dans la brume.', en: 'At dusk and at night, in the mist.' }, sprite: 'sandre-fantome',
  },
  {
    id: 'ide-orage', name: { fr: "Ide d'orage", en: 'Storm Ide' }, rarity: 2,
    phases: ['dawn', 'dusk'], seasons: ['spring', 'summer'], weather: { rain: 3, cloudy: 1.5, mist: 0.5, clear: 0.2 },
    sizeCm: { min: 25, mode: 40, max: 60 },
    desc: { fr: 'Un éclair jaune sur le flanc ; il remonte quand le ciel gronde au loin.', en: 'A yellow flash on its flank; it rises when the sky rumbles far away.' },
    hint: { fr: "À l'aube et au crépuscule, sous la pluie.", en: 'At dawn and at dusk, in the rain.' }, sprite: 'ide-orage',
  },
  {
    id: 'barbeau-fleuri', name: { fr: 'Barbeau fleuri', en: 'Blossom Barbel' }, rarity: 2,
    phases: ['day'], seasons: ['spring'], weather: { clear: 2, cloudy: 0.8, rain: 0.3, mist: 0.2 },
    sizeCm: { min: 25, mode: 40, max: 60 },
    desc: { fr: "Des pétales collés aux flancs ; il hume le printemps à fleur d'eau.", en: "Petals stuck to its sides; it sniffs the springtime at the water's edge." },
    hint: { fr: 'Le jour, sous un ciel bien dégagé.', en: 'By day, under a wide clear sky.' }, sprite: 'barbeau-fleuri',
  },
  {
    id: 'koi-paisible', name: { fr: 'Koï paisible', en: 'Quiet Koi' }, rarity: 2,
    phases: ['day', 'dusk'], seasons: ALL_SEASONS, weather: { clear: 1.5, cloudy: 1.2, rain: 0.3, mist: 0.3 },
    sizeCm: { min: 30, mode: 45, max: 70 },
    desc: { fr: "Il tourne lentement, taché d'orange comme une lanterne en papier.", en: 'It turns slowly, patched with orange like a paper lantern.' },
    hint: { fr: 'Le jour et au crépuscule, par ciel clair ou couvert.', en: 'By day and at dusk, under a clear or cloudy sky.' }, sprite: 'koi-paisible',
  },
  {
    id: 'esturgeon-ancien', name: { fr: 'Esturgeon ancien', en: 'Elder Sturgeon' }, rarity: 3,
    phases: ['dawn', 'dusk'], seasons: ['autumn', 'winter'], weather: { cloudy: 3, mist: 2.5, rain: 1.5, clear: 0.9 },
    sizeCm: { min: 80, mode: 130, max: 200 },
    desc: { fr: "Cuirassé de plaques, il date d'avant les ponts et d'avant les noms.", en: 'Plated like old armour, it is older than the bridges and the names.' },
    hint: { fr: "À l'aube et au crépuscule, sous un ciel couvert.", en: 'At dawn and at dusk, under an overcast sky.' }, sprite: 'esturgeon-ancien',
  },
  {
    id: 'soleil-midi', name: { fr: 'Soleil de midi', en: 'Noonday Sunfish' }, rarity: 3,
    phases: ['day'], seasons: ['summer'], weather: { clear: 3, cloudy: 0.3, rain: 0, mist: 0 },
    sizeCm: { min: 12, mode: 18, max: 28 },
    desc: { fr: "Rond comme un petit soleil posé sur l'eau ; il disparaît dès que le ciel se couvre.", en: 'Round as a little sun set on the water; it vanishes as soon as the sky clouds over.' },
    hint: { fr: 'Le jour, sous un grand ciel bleu.', en: 'By day, under a wide blue sky.' }, sprite: 'soleil-midi',
  },
  {
    id: 'comete', name: { fr: 'La Comète', en: 'The Comet' }, rarity: 4,
    phases: ['night'], seasons: ALL_SEASONS, weather: { clear: 1.5, cloudy: 0.2, mist: 0.1, rain: 0 },
    sizeCm: { min: 40, mode: 60, max: 100 },
    desc: { fr: "Elle file sous la surface en laissant derrière elle une traînée d'étoiles.", en: 'She streaks beneath the surface, leaving a trail of stars behind her.' },
    hint: { fr: 'La nuit, sous un ciel clair et profond.', en: 'At night, under a deep clear sky.' }, sprite: 'comete',
  },
]);
