// Mood presets (J1b). Data only: colours of the sky, the water, the clouds, the grade applied to the decor, and a few flags.
// The five moods come from the approved mock-up (maquette/v2/scene.js). There is NO automatic day/night cycle or weather
// logic yet (milestone J3): a preset is chosen by ?preset=<name> or by the debug hook.
//
// Fields
//   labelKey / icon : badge text (strings.*.js) and icon name (data/icons.js)
//   body            : 'moon' | 'sun' | null (celestial body with a stepped halo; also drives the water glitter)
//   stars           : number of stars     rain : boolean     fog : veil strength 0..1     fogColor : veil colour
//   cabinLight / lamp : cabin window glow and lantern glow strength (0 = off)     flies : fireflies shown     birds : boolean
//   smoke           : chimney smoke opacity
//   sky             : 7-8 stops, top to horizon        water : 7 stops, horizon to bottom
//   clouds          : 5 colours (light to dark)        cl : [centreX, centreY, width, height] per cloud
//   mt / pn         : optional ridge colours [lit, shade, haze] x4 and pine colours [light, dark, highlight] x4
//   grade           : { mul:[r,g,b], add:[r,g,b], sat } applied to decor colours (not to sky, nor to lights)

const DUSK_MT = [['#d78aaa', '#a4659a', '#f4a890'], ['#b96fa0', '#80528f', '#f0a090'], ['#8f5c98', '#5a417f', '#e49390'], ['#6c4f8f', '#463a72', '#d58490']];
const DUSK_PN = [['#4b4278', '#3a3468', '#6a5a96'], ['#35396a', '#262b57', '#4c4a86'], ['#2e3d68', '#202a52', '#46568a'], ['#2e3f6a', '#1c2650', '#4b5c92']];

const presets = {
  dusk: {
    labelKey: 'preset.dusk', icon: 'moon', body: 'moon', stars: 70, rain: false, fog: 0.18, fogColor: '#f0cdb8', cabinLight: 1, lamp: 1, flies: 12, birds: true, smoke: 0.45,
    sky: ['#1a1745', '#2c2766', '#573a86', '#8f4f8f', '#c9638f', '#ee8a7c', '#ffb47c', '#ffd8a0'],
    clouds: ['#ffd0a8', '#ec92a0', '#e2849d', '#b9689a', '#a35f95'],
    cl: [[110, 44, 170, 18], [262, 24, 130, 12], [420, 92, 140, 16], [62, 100, 100, 10], [214, 74, 90, 8], [450, 40, 60, 7]],
    mt: DUSK_MT, pn: DUSK_PN,
    grade: { mul: [1, 1, 1], add: [0, 0, 0], sat: 1 },
    water: ['#f6ac8c', '#d58098', '#9a5fa0', '#5f4a9c', '#3d3784', '#272461', '#1b1949'],
  },
  day: {
    labelKey: 'preset.day', icon: 'sun', body: 'sun', stars: 0, rain: false, fog: 0, fogColor: '#f0cdb8', cabinLight: 0, lamp: 0.25, flies: 0, birds: true, smoke: 0.45,
    sky: ['#4f9fe6', '#6cb4ee', '#8fcaf2', '#b4dcf2', '#d8ecf0', '#f4f0d4', '#fcebc0'],
    clouds: ['#ffffff', '#eef5fb', '#d4e2f0', '#b4c6dc', '#9fb2cc'],
    cl: [[130, 40, 150, 14], [330, 28, 110, 10], [410, 78, 120, 12], [60, 86, 90, 9]],
    mt: [['#a8d0dc', '#7fa8c8', '#e8f4f4'], ['#86b8b8', '#5f90a8', '#d8ecec'], ['#5f9a8c', '#44708a', '#c4dcd8'], ['#3f7a70', '#2f5a74', '#a8c8c8']],
    pn: [['#4f8a7a', '#3c6e6a', '#6aa890'], ['#2f6a5a', '#22505a', '#46887a'], ['#2a6252', '#1e4850', '#42806e'], ['#2a6252', '#1a4448', '#3f7a68']],
    grade: { mul: [1, 1, 1], add: [6, 8, 4], sat: 1.1 },
    water: ['#bfe0ee', '#8cc4e2', '#6aa8d4', '#548cc0', '#4476aa', '#376294', '#2c507c'],
  },
  night: {
    labelKey: 'preset.night', icon: 'moon', body: 'moon', stars: 170, rain: false, fog: 0, fogColor: '#f0cdb8', cabinLight: 1.2, lamp: 1.1, flies: 14, birds: false, smoke: 0.45,
    sky: ['#080826', '#0e0f36', '#151649', '#1d1f59', '#292b6a', '#373a7c', '#474a8c'],
    clouds: ['#7a7ab8', '#5a5a98', '#444482', '#34346c', '#282858'],
    cl: [[150, 50, 120, 9], [390, 72, 110, 8]],
    mt: DUSK_MT, pn: DUSK_PN,
    grade: { mul: [0.42, 0.52, 0.95], add: [0, 2, 16], sat: 0.9 },
    water: ['#4a4e8c', '#363a78', '#282a64', '#1d1f52', '#161744', '#10113a', '#0b0c2e'],
  },
  rain: {
    labelKey: 'preset.rain', icon: 'cloud', body: null, stars: 0, rain: true, fog: 0.1, fogColor: '#f0cdb8', cabinLight: 0.9, lamp: 0.8, flies: 0, birds: false, smoke: 0.45,
    sky: ['#5e6a7e', '#6f7b8e', '#808c9e', '#919cac', '#a1abb9', '#b0b9c5', '#bcc4ce'],
    clouds: ['#aeb8c6', '#939eae', '#7b879a', '#677386', '#566074'],
    cl: [[100, 26, 280, 24], [320, 34, 300, 22], [200, 64, 260, 18], [430, 70, 170, 16], [50, 86, 150, 14], [260, 92, 200, 12]],
    mt: DUSK_MT, pn: DUSK_PN,
    grade: { mul: [0.8, 0.86, 0.95], add: [8, 12, 20], sat: 0.4 },
    water: ['#a8b3c2', '#8f9cae', '#788699', '#647285', '#525f72', '#434e60', '#353f50'],
  },
  fog: {
    labelKey: 'preset.fog', icon: 'sun', body: null, stars: 0, rain: false, fog: 0.55, fogColor: '#f4e4dc', cabinLight: 0.6, lamp: 0.6, flies: 6, birds: true, smoke: 0.3,
    sky: ['#c6b4c6', '#d6c0c6', '#e4ccc6', '#eed8c6', '#f4e2ca', '#f8e8d0', '#faeed8'],
    clouds: ['#fff0e0', '#f4dcd4', '#e6c6c8', '#d4b4bc', '#c0a2b0'],
    cl: [[200, 60, 260, 10], [400, 80, 160, 8]],
    mt: DUSK_MT, pn: DUSK_PN,
    grade: { mul: [1, 0.96, 0.97], add: [34, 28, 36], sat: 0.55 },
    water: ['#ecd2c8', '#d6bcc0', '#bca4b4', '#9e8ca6', '#837796', '#6c6584', '#585372'],
  },
};

export const PRESET_NAMES = Object.freeze(['dusk', 'day', 'night', 'rain', 'fog']);
export const DEFAULT_PRESET = 'dusk';
/** Name -> preset; unknown or missing name -> the default (dusk). */
export function getPreset(name) {
  return presets[name] || presets[DEFAULT_PRESET];
}
export function isPresetName(name) {
  return Object.prototype.hasOwnProperty.call(presets, name);
}
export default Object.freeze(presets);
