// The boat of Captain Roseau (J12-B) as DATA: the docks, the rowing numbers, the soft edge of the water it may cross, the named deep spots, and the small
// unlock request. No logic here. Every name, number and place was validated by the owner on 2026-11-10. x = east, z = south, heading as a unit vector.
//
// The boat can never sink, capsize, run out of anything or get lost: the area it rows in is bounded by the shores and the decks with a soft edge (it slows and
// turns), and the player can step back onto a shore at any dock.

/**
 * The docks. boat = where the moored boat lies and its heading [hx, hz]; stand = where the angler stands on the shore/deck to climb in, and steps off to;
 * r = how close the angler must be to `stand` to climb in; needs = a story flag the dock waits for (the islet).
 */
export const DOCKS = Object.freeze({
  landing: Object.freeze({ id: 'landing', boat: [26.4, -16.7], heading: [1, 0], stand: [26.4, -14.0], r: 2.3, name: { fr: 'l’embarcadère', en: 'the boat landing' } }),
  pier: Object.freeze({ id: 'pier', boat: [7.2, -10.2], heading: [0, -1], stand: [4.4, -10.4], r: 1.0, name: { fr: 'le ponton', en: 'the pier' } }),
  islet: Object.freeze({ id: 'islet', boat: [6.0, -20.8], heading: [1, 0], stand: [6.0, -23.1], r: 1.8, needs: 'islet.open', name: { fr: 'l’îlot', en: 'the islet' } }),
});
export const DOCK_IDS = Object.freeze(Object.keys(DOCKS));
/** How close (m) the rowing boat must be to a dock for "get off here". */
export const DOCK_REACH = 2.4;

/** Rowing: slow and smooth. Speeds in m/s, rates per second. */
export const ROW = Object.freeze({ maxSpeed: 2.3, accel: 1.5, drag: 1.1, turnRate: 1.9, softEdge: 3.0, shorePad: 1.3, deckPad: 1.2, push: 0.8, minSpeedK: 0.22 });

/** The size of the boat model (a later art pass swaps the model; these are what the rest of the game relies on). */
export const BOAT_SIZE = Object.freeze({ length: 3.2, beam: 1.24, seatY: 0.34 });

/** Named deep spots on the water (circles, the first containing the boat wins); the last one covers everything else. All are the water zone 'deep'. */
export const BOAT_SPOTS = Object.freeze([
  { id: 'depths', x: 0, z: -42, r: 9, name: { fr: 'Les grands fonds', en: 'The great deep' } },
  { id: 'heart', x: -9, z: -30, r: 7, name: { fr: 'Le cœur du lac', en: 'The heart of the lake' } },
  { id: 'bay', x: 20, z: -22, r: 8, name: { fr: 'La baie du capitaine', en: 'The captain’s bay' } },
  { id: 'open', x: 0, z: -24, r: 99, name: { fr: 'Le large', en: 'Open water' } },
].map((s) => Object.freeze({ ...s, water: 'deep', boat: true })));

/** The unlock request of the boat: Roseau wants a few fish from the bucket (any kind), or a modest price. Both are always within reach. */
export const BOAT_UNLOCK = Object.freeze({ fish: 3, pearls: 150 });

/** Lights of the lake: one soft glow on the water per found couplet (data/story.js COUPLETS[].light = [x, z]). Size in metres. */
export const LAKE_LIGHT = Object.freeze({ size: 1.8, bloomSize: 3.0, y: 0.16 });

/** The finale: seconds per phase (the camera drifts, the lights come on one by one). */
export const FINALE = Object.freeze({ lightEveryS: 3.2, driftS: 44, path: [[0, 1, 2], [-4, 0.4, -20], [6, 0.4, -27], [0, 0.4, -34]], stepScale: 1.7 });
