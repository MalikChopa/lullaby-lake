// Which picture (mood preset of data/palettes.js) shows a given phase and weather. Pure, data-like.
// Since J3 the picture is a smooth blend (core/sky.js); this hard-cut rule stays as the NOMINAL mood of a phase and weather: the badge,
// the debug state and the tests use it.
//   dawn -> fog, day -> day, dusk -> dusk, night -> night ;  rain -> rain, mist -> fog ;  clear and cloudy keep the phase preset.

const BY_PHASE = Object.freeze({ dawn: 'fog', day: 'day', dusk: 'dusk', night: 'night' });
const BY_WEATHER = Object.freeze({ rain: 'rain', mist: 'fog' });

/** @returns {'dusk'|'day'|'night'|'rain'|'fog'} */
export function lookFor(phase, weather) {
  return BY_WEATHER[weather] || BY_PHASE[phase] || 'dusk';
}

/** Icon of the badge for a phase: sun by dawn and day, moon at dusk and by night (a shape, never colour alone). */
export function phaseIcon(phase) {
  return phase === 'dawn' || phase === 'day' ? 'sun' : 'moon';
}
