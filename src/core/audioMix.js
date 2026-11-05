// How loud each voice of the soundscape should be, from the look of the sky (clock + weather). Pure: numbers in, numbers out.
// The look already fades (phases cross-fade, a weather change takes 10 s), so the sound follows without extra logic.

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/** Slider 0..100 -> linear gain (a square: the ear feels it as even steps). */
export function volumeGain(v) {
  const x = clamp(Number.isFinite(v) ? v : 0, 0, 100) / 100;
  return x * x;
}

/** Name of the music scale for a look: the strongest phase, or rain for rain and mist. */
export function scaleFor(look) {
  if (look.rain > 0.5 || look.veil > 0.45) return 'rain';
  if (look.tod) {
    let best = 'night';
    let w = -1;
    for (const k of Object.keys(look.tod)) {
      if (look.tod[k] > w) {
        w = look.tod[k];
        best = k;
      }
    }
    return best;
  }
  return { dusk: 'dusk', day: 'day', night: 'night', rain: 'rain', fog: 'dawn' }[look.dominant] || 'dusk';
}

/**
 * @param {object} look from core/sky.js
 * @returns {{water:number, wind:number, birds:number, crickets:number, rain:number, music:number, scale:string}} each 0..1 (relative: the data
 *   gives the real gain of each voice)
 */
export function audioLevels(look) {
  const tod = look.tod || { dawn: look.dominant === 'fog' ? 1 : 0, day: look.dominant === 'day' ? 1 : 0, dusk: look.dominant === 'dusk' ? 1 : 0, night: look.dominant === 'night' ? 1 : 0 };
  const rain = clamp(look.rain, 0, 1);
  const crickets = (0.2 * tod.dawn + 0.55 * tod.dusk + 1 * tod.night) * (1 - 0.95 * rain) * (1 - 0.3 * clamp(look.veil, 0, 1));
  return {
    water: clamp(0.65 + 0.25 * rain, 0, 1),
    wind: clamp(0.15 + look.wind * 1.6, 0, 1) * clamp(1 - (rain - 0.4) / 0.4, 0, 1), // heavy rain covers the wind: that voice stops (fewer nodes)
    birds: clamp(look.birds, 0, 1),
    crickets: clamp(crickets, 0, 1),
    rain,
    music: clamp(0.75 - 0.4 * rain, 0, 1),
    scale: scaleFor(look),
  };
}
