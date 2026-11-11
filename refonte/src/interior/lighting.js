// Look of an interior room for a phase of the day and a weather (pure data, no three.js): the light that comes through the windows, the lamps that glow,
// the post-processing grade. Same recipe as the world (warm light on cool shadows, a soft bloom), simpler: no sky dome, no ground field.

export const PHASES = Object.freeze(['aube', 'jour', 'crepuscule', 'nuit']);
export const WEATHERS = Object.freeze(['soleil', 'nuages', 'pluie', 'brume']);

const BASE = {
  aube: { sky: '#f6c9a8', sun: '#ffc79a', sunI: 1.5, hemiSky: '#ffe2cf', hemiGround: '#7a6a7a', hemiI: 1.6, lamp: 0.7, bloom: 0.42, grade: [1.02, 0.99, 0.96] },
  jour: { sky: '#bfe0f4', sun: '#fff1d0', sunI: 2.6, hemiSky: '#e8f2ff', hemiGround: '#a08c70', hemiI: 2.0, lamp: 0.12, bloom: 0.34, grade: [1.01, 1.0, 0.98] },
  crepuscule: { sky: '#f2a070', sun: '#ff9a60', sunI: 1.2, hemiSky: '#ffc8a0', hemiGround: '#5a4a6a', hemiI: 1.2, lamp: 0.85, bloom: 0.5, grade: [1.04, 0.97, 0.93] },
  nuit: { sky: '#1c2448', sun: '#7f9cff', sunI: 0.35, hemiSky: '#7080c0', hemiGround: '#30304a', hemiI: 0.85, lamp: 1.0, bloom: 0.6, grade: [0.92, 0.96, 1.08] },
};
const GREY = { soleil: 0, nuages: 0.35, pluie: 0.6, brume: 0.45 };

/** @returns {{ sky, sun, sunI, hemiSky, hemiGround, hemiI, lamp, bloom, grade, sat, grey }} */
export function interiorLook(phase = 'jour', weather = 'soleil') {
  const b = BASE[phase] || BASE.jour;
  const g = GREY[weather] ?? 0;
  const wet = weather === 'pluie' ? 1 : 0;
  return {
    ...b,
    sunI: b.sunI * (1 - 0.7 * g),
    hemiI: b.hemiI * (1 - 0.15 * g),
    lamp: Math.min(1, b.lamp + 0.25 * g),
    sky: g ? mix(b.sky, phase === 'nuit' ? '#2a3250' : '#8a98a8', g) : b.sky,
    sat: 1 - 0.18 * g,
    bloom: b.bloom,
    grey: g,
    wet,
  };
}

function mix(a, b, t) {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return '#' + pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, '0')).join('');
}
