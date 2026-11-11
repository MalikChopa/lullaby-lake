// Small corrections of the fish sprites for the refonte (brief 29, from the asset audit): two tails were clipped by the edge of the 40 x 24 canvas. The sprite table of the published 2D game
// (src/data/fishSprites.js) stays as it is: these values are merged over it when the refonte draws a fish (data/allSpecies.js). Measured in tests/refonte-room-fish.test.js.
export const FISH_OVERRIDES = Object.freeze({
  'carpe-lune': Object.freeze({ tail: 6 }), // the tail reached x = 0 (rx 15, cx 22, tail 7)
  'dernier-songe': Object.freeze({ rx: 14, tail: 7 }), // its veil tail reached x = 0 and the head x = 39 (rx 15, tail 9)
});

// Texts of the 2D species rewritten for the refonte only (src/data/species.js stays as published). Decision of the owner, 2026-11-10: the legendary fish
// "La Berceuse" and the song of the lake are linked in words. Limit 140 characters (src/core/validate.js).
export const SPECIES_TEXT_OVERRIDES = Object.freeze({
  berceuse: Object.freeze({
    desc: Object.freeze({
      fr: 'On dit que la berceuse du lac porte son nom : elle fut la première à la fredonner, pour endormir l’eau.',
      en: 'They say the lake’s lullaby is named after her: she was the first to hum it, to lull the water to sleep.',
    }),
  }),
});
