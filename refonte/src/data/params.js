// Parameters as data: one place to tune the camera, the walk, the quality tiers, the light of each phase and the layout of the J7 zone
// "Cabane et ponton" (the rest of the J8 world is in data/map.js). No logic here (pure data, importable from node tests).
// World units = metres, y up, the lake is to the north (-z); the camera looks north from the south (+z) at yaw 0 and turns by quarters.

/**
 * Pixel-perfect texel scale: ONE sprite pixel = TEXEL metres in the world (and the code-made textures use the same density: 16 px per metre).
 * The angler sprite is 32 px tall = 2.0 m (straw hat included).
 */
export const TEXEL = 1 / 16;

/** Walking speed of the angler, metres per second (keyboard, stick at full tilt). */
export const WALK_SPEED = 3.2;
/** Collision radius of the angler (metres). */
export const PLAYER_RADIUS = 0.28;

/** Camera: perspective, tilted (pitch below the horizon), fixed yaw, small field of view for the tilt-shift look. */
export const CAMERA = Object.freeze({
  pitchDeg: 45, // tilt of the view below the horizon
  yawDeg: 0, // fixed heading (0 = looking north, at the lake)
  fovDeg: 30, // vertical field of view: small = flatter, "miniature" look
  distance: 20, // metres from the target (zoom)
  minDistance: 13,
  maxDistance: 30,
  followRate: 5, // 1/s: exponential damping of the follow (higher = tighter)
  zoomRate: 8, // 1/s: damping of the zoom
  aimHeight: 0.9, // the camera aims this high above the player's feet
  occluderFade: 0.3, // opacity of a pine or of the cabin roof when it hides the player (J7; J8 dithers, see logic/occlusion.js)
  yawStepDeg: 90, // Q / E turn the view by a quarter
  yawRate: 6, // 1/s: damping of the turn
  edgeMargin: 6, // the aimed point stays this far inside the world bounds
});

/** Sprites stand upright and lean back toward the camera by this angle (radians) so their pixels stay close to square on screen. */
export const SPRITE_LEAN = 0.35;

/**
 * Quality tiers. low = no post-processing, 1024 shadow map, fewer blades, blob shadows under the sprites, pixel ratio 1.
 * mid = bloom only, 2048 shadows. high = bloom + tilt-shift + grade + MSAA, 2048 shadows: the top tier.
 * (2026-11-10, owner: the hand-picked "ultra" tier of J8 is removed - "élevé est meilleur"; a saved or asked 'ultra' becomes 'high', logic/quality.js parseTier.) J8 fields: grass = tufts in the grass window of side grassWin metres around the view (it follows the camera),
 * flowers likewise; viewDist = static chunks drawn up to this distance; detailDist = small props (ferns, mushrooms, crates...) up to this;
 * shadowHalf = half size of the sun's shadow box (metres, follows the angler); fireflies / motes = particle counts.
 */
export const TIERS = Object.freeze({
  low: { post: false, bloom: false, tilt: false, msaa: 0, foliageShadows: false, shadowSize: 1024, shadowRadius: 1, grass: 12000, grassWin: 26, flowers: 900, rain: 500, maxPixelRatio: 1, spriteShadows: false, viewDist: 46, detailDist: 22, shadowHalf: 13, fireflies: 30, motes: 30 },
  mid: { post: true, bloom: true, tilt: false, msaa: 0, shadowSize: 2048, shadowRadius: 3, grass: 30000, grassWin: 32, flowers: 2000, rain: 1000, maxPixelRatio: 1.5, spriteShadows: true, viewDist: 56, detailDist: 30, shadowHalf: 16, fireflies: 70, motes: 60 },
  high: { post: true, bloom: true, tilt: true, msaa: 4, shadowSize: 2048, shadowRadius: 4, grass: 56000, grassWin: 38, flowers: 3600, rain: 1600, maxPixelRatio: 2, spriteShadows: true, viewDist: 68, detailDist: 38, shadowHalf: 18, fireflies: 120, motes: 100 },
});
/** Tiers the automatic quality may use (low..high). */
export const TIER_ORDER = Object.freeze(['low', 'mid', 'high']);
/** Every tier, from the lightest to the heaviest (the same as the automatic ones since 'ultra' was removed, 2026-11-10). */
export const TIER_ALL = Object.freeze(['low', 'mid', 'high']);

/**
 * Automatic quality: a probe of the first frames picks a tier, then the tier only ever goes DOWN (one step at a time) when the frame
 * interval stays high; it never goes back up by itself (no flapping). Values in milliseconds / seconds of real time.
 */
export const AUTO_QUALITY = Object.freeze({
  warmupS: 0.6, // frames ignored at the start (shader compilation)
  probeS: 1.5, // then this long is measured to choose
  pickHighMs: 19, // probe median <= this -> high
  pickMidMs: 24, // <= this -> mid, else low (never above downMs: a fresh pick must not be downgraded at once)
  windowS: 2, // rolling window watched after the choice
  downMs: 24, // p75 of the window above this ...
  holdS: 2, // ... for this long (checked every 0.25 s) -> one step down
  cooldownS: 3, // after a change, wait before judging again
});

/** Light and atmosphere of each phase of the clock (src/core/clock.js phases: dawn, day, dusk, night). Colours are sRGB hex. */
export const PHASE_LIGHT = Object.freeze({
  dawn: { skyTop: '#8a9ad8', skyHor: '#f6c8b8', rainFog: '#b0a0b0', rainSky: '#9c94b0', mistFog: '#f0dcd8', stars: 0.25, cloud: '#f8d8d0', sun: '#ffc6a0', sunI: 2.4, sky: '#e4c4d0', ground: '#6c6584', hemiI: 1.5, fog: '#e8cfc8', fogD: 0.012, bloom: 0.35, lamp: 0.6, window: 0.6, exposure: 1.0, waterSky: '#f4d8cc', waterDeep: '#6c6584', grade: [1.02, 0.98, 1.0], sat: 0.95 },
  day: { skyTop: '#5aa0e8', skyHor: '#cfe8f4', rainFog: '#94a2b4', rainSky: '#8e9cb2', mistFog: '#dfe6ea', stars: 0, cloud: '#ffffff', sun: '#fff1d6', sunI: 2.8, sky: '#a8d4f2', ground: '#56704a', hemiI: 1.35, fog: '#bfe0ee', fogD: 0.006, bloom: 0.18, lamp: 0.0, window: 0.0, exposure: 1.0, waterSky: '#bfe0ee', waterDeep: '#2c6a8c', grade: [1.0, 1.0, 0.98], sat: 1.08 },
  dusk: { skyTop: '#5a4a9a', skyHor: '#ffa888', rainFog: '#b08494', rainSky: '#a0809e', mistFog: '#e8bcbc', stars: 0.12, cloud: '#ffc0a8', sun: '#ffb070', sunI: 3.6, sky: '#c890c0', ground: '#5a4070', hemiI: 1.85, fog: '#d88a98', fogD: 0.011, bloom: 0.55, lamp: 1.0, window: 1.0, exposure: 1.18, waterSky: '#f6ac8c', waterDeep: '#3d3784', grade: [1.05, 0.97, 0.98], sat: 1.05 },
  night: { skyTop: '#141a44', skyHor: '#3a4288', rainFog: '#3a4282', rainSky: '#474e8e', mistFog: '#5a6098', stars: 1, cloud: '#565c98', sun: '#aebcff', sunI: 1.55, sky: '#7a86d0', ground: '#3c4280', hemiI: 2.2, fog: '#2a316e', fogD: 0.012, bloom: 0.8, lamp: 1.4, window: 1.35, exposure: 1.45, waterSky: '#5c64ae', waterDeep: '#18204e', grade: [0.96, 0.99, 1.06], sat: 0.95 },
});
/**
 * What rain does to that light (scaled by the rain share of the weather mix). J8: the rain fog and sky keep the hue of the phase
 * (PHASE_LIGHT rainFog / rainSky) so the dusk rain stays pink-violet instead of the grey of J7; saturation drops less (0.8, was 0.55).
 */
export const RAIN_LIGHT = Object.freeze({ sunMul: 0.18, sky: '#8a96ac', ground: '#3a4050', hemiMul: 1.2, fog: '#7f8a9c', fogD: 0.012, wet: 1, sat: 0.8, lampMul: 1.1, skyMix: 0.6, fogMix: 0.55, expMul: 1.2 });
/** Mist: denser fog in the phase's mist colour, softer and weaker sun, a little more fill. */
export const MIST_LIGHT = Object.freeze({ fog: '#e6dcdc', fogD: 0.011, sunMul: 0.5, hemiMul: 1.1, sat: 0.85, fogMix: 0.6 });
/** Cloudy: weaker, softer sun, cloud shadows on the ground, slightly cooler and less saturated. */
export const CLOUD_LIGHT = Object.freeze({ sunMul: 0.55, hemiMul: 1.08, sat: 0.92, fogD: 0.003, cool: [0.97, 0.99, 1.04] });

/**
 * Sun and moon as a light direction. Arc from east (az +100 deg) through north to west (az -100 deg), so the light comes from over the lake
 * and the shadows fall toward the shore and sideways. rise / set are day fractions (the sun stays up through most of dusk for long warm shadows;
 * the moon takes over at night). maxElevDeg = height at the top of the arc; minElevDeg clamps the lowest light (shadows never infinite).
 */
export const SUN_PATH = Object.freeze({
  sun: { rise: -0.03, set: 0.6, maxElevDeg: 58, minElevDeg: 9, fade: 0.06, az0: 100, az1: -100 },
  moon: { rise: 0.6, set: 0.97, maxElevDeg: 50, minElevDeg: 14, fade: 0.08, az0: 80, az1: -80 },
});

/**
 * J9-B: luminance floor of a frame (tools/check-j10.mjs measures the screen without the HUD bands; logic/look.js lumaStats). Luma of the
 * sRGB pixels, 0..255 (Rec. 709). mean = average light of the picture; p5 = the darkest 5 % of the pixels. Reasons for the numbers:
 *   - p5 >= 14 at night: below ~12 the darkest 5 % of an 8-bit sRGB frame fall into the "crushed black" range where a dark sprite outline,
 *     a tree trunk and the ground under it become one blot on a typical laptop or phone screen (and the CSS vignette darkens the corners
 *     more); 14 keeps them a step above.
 *   - mean >= 50 at night (about 20 % grey): the ground, the path and the sprites stay readable while the picture stays clearly darker
 *     than dusk (mean ~95-120); rain / mist may lower nothing below the phase floor (the weather rows only ever ADD).
 *   - day / dawn / dusk: mean >= 70 and p5 >= 22: those states are meant to be bright; the floor only catches a regression.
 */
export const LOOK_FLOOR = Object.freeze({
  dawn: { mean: 70, p5: 22 },
  day: { mean: 80, p5: 22 },
  dusk: { mean: 66, p5: 20 },
  night: { mean: 50, p5: 14 },
  weather: { clear: { mean: 0, p5: 0 }, cloudy: { mean: 0, p5: 0 }, rain: { mean: 0, p5: 0 }, mist: { mean: 0, p5: 0 } },
});

/**
 * J9-B: cheap light shafts (additive slanted planes, world/life.js), only on these tiers. lowSun = strength at dawn / dusk, mist = extra
 * strength in mist (day included), moon = faint moon shafts in night mist. count planes spread over `spread` metres around the view.
 */
export const SHAFTS = Object.freeze({ tiers: Object.freeze(['high']), lowSun: 0.85, mist: 0.6, moon: 0.35, count: 7, spread: 11 });

/** Water level (y). */
export const WATER_Y = 0;
/** Height of the pier deck (y). */
export const DECK_Y = 0.45;

/** The zone "Cabane et ponton". Everything is placed here; the world builders and the collisions read this. */
export const LAYOUT = Object.freeze({
  bounds: { x0: -21, x1: 21, z0: -12, z1: 15 }, // where the angler may walk (on land or on the pier)
  terrain: { x0: -34, x1: 34, z0: -40, z1: 24, segX: 136, segZ: 128 },
  playerStart: [-3.6, 10.2],
  pier: {
    walk: [
      { x0: 2.2, x1: 3.8, z0: -9.2, z1: 2.2 }, // the walkway
      { x0: 1.2, x1: 4.8, z0: -11.6, z1: -9.0 }, // the platform at the end
    ],
    piles: [[2.25, -1.5], [3.75, -1.5], [2.25, -4.5], [3.75, -4.5], [2.25, -7.5], [3.75, -7.5], [1.25, -9.1], [4.75, -9.1], [1.25, -11.55], [4.75, -11.55], [3.0, -11.55]],
  },
  fishSpot: { x0: 1.4, x1: 4.6, z0: -11.6, z1: -9.6 }, // standing here, Space casts
  lamp: { x: 4.4, z: -9.45, h: 2.6 },
  cat: { x: 1.75, z: -9.6 },
  cabin: { x: -6, z: 6.5, w: 5.2, d: 4.2, wallH: 2.4, roofH: 1.7 },
  // dirt path from the cabin door to the pier
  path: [[-5.0, 9.4], [-3.2, 8.4], [-1.0, 6.2], [1.0, 3.8], [2.6, 2.4], [3.0, 1.6]],
  pathWidth: 0.85,
  pines: [[-12, 4.5, 1.15], [-10.4, 10.2, 1.0], [-14.2, 9.5, 1.3], [9.2, 6.2, 1.2], [11.6, 2.6, 0.95], [13.4, 8.4, 1.25], [-8.6, 13.8, 0.9], [6.8, 12.6, 1.05], [-15.6, 2.0, 1.1], [15.2, 1.2, 1.0]],
  // far shore (only seen when zoomed out): cheap pines in a row
  farPines: 26,
  rocks: [[0.6, 0.6, 0.55], [5.6, 0.4, 0.45], [-2.6, 0.1, 0.4], [9.4, -0.2, 0.6], [-9.2, 0.6, 0.5], [6.6, -1.6, 0.35], [-0.6, -1.9, 0.3], [-12.5, 0.4, 0.45]],
  reeds: [[-1.6, -2.3, 9], [6.6, -2.8, 8], [-6.2, -1.8, 10], [9.6, -2.2, 7], [-3.6, -2.6, 6], [12.4, -1.6, 7]],
  lilies: [[0.0, -5.2, 0.55], [-1.3, -6.6, 0.45], [6.2, -6.1, 0.5], [7.6, -4.6, 0.4], [-3.0, -4.2, 0.5], [5.8, -9.8, 0.42]],
  fence: [[-12.0, 3.4], [-7.6, 3.0]],
  flowerPatches: [[-2.0, 11.0, 2.4], [5.6, 4.8, 2.0], [-9.6, 7.0, 1.6], [8.2, 10.6, 2.2]],
});
