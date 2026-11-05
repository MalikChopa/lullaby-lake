// Test parameters in the URL: ?debug=1&seed=N&speed=N&rm=1&state=bite and ?perf=1. Nothing happens without them.
// Work WITHOUT ?debug=1 (so the user can try them too):
//   ?preset=<dusk|day|night|rain|fog>   pins the mood of the picture (the badge shows that preset; the caller validates the name)
//   ?phase=aube|jour|crepuscule|nuit    starts the clock in that phase and FREEZES it (also: dawn|day|dusk|night)
//   ?weather=soleil|nuages|pluie|brume  starts with that weather and FREEZES it (also: clear|cloudy|rain|mist)
//   (with ?debug=1) ?book=none|half|all  starts with an empty, half-full or complete journal
//   ?nosw=1                             removes the service worker and its caches (it serves files from its cache first)
//   ?clock=run                          (default) the clock and the weather run; with ?phase / ?weather they only set the start

export const PHASE_ALIASES = Object.freeze({
  aube: 'dawn', dawn: 'dawn', jour: 'day', day: 'day', crepuscule: 'dusk', 'crépuscule': 'dusk', dusk: 'dusk', nuit: 'night', night: 'night',
});
export const WEATHER_ALIASES = Object.freeze({
  soleil: 'clear', clear: 'clear', nuages: 'cloudy', nuageux: 'cloudy', cloudy: 'cloudy', pluie: 'rain', rain: 'rain', brume: 'mist', mist: 'mist',
});

const alias = (table, v) => (v && Object.prototype.hasOwnProperty.call(table, v.toLowerCase()) ? table[v.toLowerCase()] : null);

/** @param {string} search e.g. "?debug=1&seed=7&speed=20" */
export function parseDebug(search) {
  const q = new URLSearchParams(search || '');
  const debug = q.get('debug') === '1';
  const num = (k) => {
    const v = q.get(k);
    return v !== null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null;
  };
  const speed = debug ? Math.min(60, Math.max(1, num('speed') ?? 1)) : 1;
  return {
    debug,
    perf: q.get('perf') === '1',
    seed: debug ? num('seed') : null,
    speed,
    rm: debug && q.get('rm') === '1',
    state: debug ? q.get('state') : null,
    book: debug && ['none', 'half', 'all'].includes(q.get('book')) ? q.get('book') : null,
    preset: q.get('preset'),
    phase: alias(PHASE_ALIASES, q.get('phase')),
    weather: alias(WEATHER_ALIASES, q.get('weather')),
    clock: q.get('clock') === 'run' ? 'run' : 'default',
    nosw: q.get('nosw') === '1',
  };
}
