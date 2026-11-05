// The four weathers (ARCHITECTURE.md section 4). Data only. Ids are stable: clear, cloudy, rain, mist.
//   durationS  how long a weather lasts, uniform in [min, max] game seconds
//   next       weight of each weather as the NEXT one (the weather itself is 0: it always changes)
//   phaseBias  multiplies the chance of arriving, by the phase at the moment of the change (dawn, day, dusk, night)
//   start      weight for the weather at the very start of a game
//   tint / fx / audio : visual and sound of the weather, listed here so the data stays in one place (tint is not used: see look)
//   fx.clouds = cloud cover 0..1, fx.rain = rain density 0..1 (streaks and ripples)
//   look.wash = share of the rain / fog mood blended into the picture (scaled by the ambient light of the phase),
//   look.veil = strength of the moving mist veils, look.dim = how much the weather hides the sun, the moon and the stars (0..1)
// Simulated shares of time (3 000 days, seed 42): clear 40.6 %, cloudy 23.9 %, rain 15.5 %, mist 20.0 % (target 40/25/15/20).
export default Object.freeze([
  {
    id: 'clear', name: { fr: 'Ciel dégagé', en: 'Clear sky' }, durationS: [120, 280], start: 40,
    next: { clear: 0, cloudy: 2, rain: 1.2, mist: 1.5 }, phaseBias: { dawn: 1, day: 1.5, dusk: 1.2, night: 1 },
    tint: { color: '#ffffff', amount: 0 }, fx: { clouds: 0.1, rain: 0, mist: 0 }, audio: { wind: 0.1, rain: 0 },
    look: { wash: { rain: 0, fog: 0 }, veil: 0, dim: 0 },
  },
  {
    id: 'cloudy', name: { fr: 'Nuageux', en: 'Cloudy' }, durationS: [80, 200], start: 25,
    next: { clear: 3, cloudy: 0, rain: 2, mist: 1 }, phaseBias: { dawn: 1, day: 1, dusk: 1, night: 1 },
    tint: { color: '#9aa4b6', amount: 0.25 }, fx: { clouds: 0.7, rain: 0, mist: 0.1 }, audio: { wind: 0.4, rain: 0 },
    look: { wash: { rain: 0.3, fog: 0 }, veil: 0.03, dim: 0.45 },
  },
  {
    id: 'rain', name: { fr: 'Pluie', en: 'Rain' }, durationS: [90, 180], start: 15,
    next: { clear: 2, cloudy: 3, rain: 0, mist: 1 }, phaseBias: { dawn: 1, day: 1, dusk: 1, night: 1 },
    tint: { color: '#8a96ac', amount: 0.4 }, fx: { clouds: 1, rain: 1, mist: 0.2 }, audio: { wind: 0.3, rain: 1 },
    look: { wash: { rain: 1, fog: 0 }, veil: 0.1, dim: 1 },
  },
  {
    id: 'mist', name: { fr: 'Brume', en: 'Mist' }, durationS: [90, 210], start: 20,
    next: { clear: 3, cloudy: 2, rain: 1, mist: 0 }, phaseBias: { dawn: 3, day: 0.5, dusk: 1, night: 2 },
    tint: { color: '#c8c4d8', amount: 0.35 }, fx: { clouds: 0.3, rain: 0, mist: 0.8 }, audio: { wind: 0.2, rain: 0 },
    look: { wash: { rain: 0, fog: 0.6 }, veil: 0.58, dim: 0.6 },
  },
]);
