// Data validation: returns a list of readable errors (empty list = valid). Pure.

export const PHASES = ['dawn', 'day', 'dusk', 'night'];
export const LANGS = ['fr', 'en'];
export const DEFAULT_WEATHER_IDS = ['clear', 'cloudy', 'rain', 'mist'];

function checkText(errors, where, obj, max) {
  for (const l of LANGS) {
    const v = obj && obj[l];
    if (typeof v !== 'string' || v.trim() === '') errors.push(`${where}: texte "${l}" manquant ou vide`);
    else if (max && v.length > max) errors.push(`${where}: texte "${l}" trop long (${v.length} > ${max})`);
  }
}

/**
 * @param {object[]} list species
 * @param {object} [sprites] data/fishSprites.js (sprite existence is checked when given)
 * @param {{weatherIds?:string[], rarityWeights?:object}} [opt] weatherIds = known weathers (default clear, cloudy, rain, mist);
 *   rarityWeights = weights of the active pace (a rarity with weight 0 makes a species unreachable)
 */
export function validateSpecies(list, sprites, opt = {}) {
  const errors = [];
  const weatherIds = opt.weatherIds || DEFAULT_WEATHER_IDS;
  const seen = new Set();
  for (const s of list) {
    const id = s && s.id;
    const w = `espèce ${id}`;
    if (typeof id !== 'string' || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) errors.push(`${w}: id invalide`);
    if (seen.has(id)) errors.push(`${w}: id en double`);
    seen.add(id);
    checkText(errors, `${w} name`, s.name, 24);
    checkText(errors, `${w} desc`, s.desc, 140);
    checkText(errors, `${w} hint`, s.hint, 70);
    if (![1, 2, 3, 4].includes(s.rarity)) errors.push(`${w}: rareté ${s.rarity} invalide`);
    const phasesOk = Array.isArray(s.phases) && s.phases.length > 0 && s.phases.every((p) => PHASES.includes(p));
    if (!phasesOk) errors.push(`${w}: phases invalides`);
    const z = s.sizeCm;
    if (!z || !(z.min <= z.mode && z.mode <= z.max) || !(z.min > 0)) errors.push(`${w}: tailles invalides (min <= mode <= max)`);
    if (sprites && !sprites[s.sprite]) errors.push(`${w}: sprite "${s.sprite}" manquant`);
    let weatherOk = true;
    for (const [k, v] of Object.entries(s.weather || {})) {
      if (!weatherIds.includes(k)) {
        errors.push(`${w}: météo "${k}" inconnue`);
        weatherOk = false;
      }
      if (typeof v !== 'number' || !(v >= 0)) {
        errors.push(`${w}: multiplicateur de météo "${k}" invalide`);
        weatherOk = false;
      }
    }
    if (phasesOk && weatherOk && [1, 2, 3, 4].includes(s.rarity)) {
      const reachableWeather = weatherIds.some((k) => (s.weather && s.weather[k] !== undefined ? s.weather[k] : 1) > 0);
      const rw = opt.rarityWeights ? opt.rarityWeights[s.rarity] : 1;
      if (!reachableWeather || !(rw > 0)) errors.push(`${w}: espèce jamais atteignable (aucune météo ou rareté de poids > 0)`);
    }
  }
  return errors;
}

export function validateWeather(list) {
  const errors = [];
  const ids = new Set(list.map((w) => w && w.id));
  const seen = new Set();
  for (const w of list) {
    const where = `météo ${w && w.id}`;
    if (typeof w.id !== 'string' || w.id === '') errors.push(`${where}: id invalide`);
    if (seen.has(w.id)) errors.push(`${where}: id en double`);
    seen.add(w.id);
    checkText(errors, `${where} name`, w.name, 24);
    const d = w.durationS;
    if (!Array.isArray(d) || !(d[0] > 0) || !(d[0] <= d[1])) errors.push(`${where}: durationS invalide`);
    let total = 0;
    for (const [k, v] of Object.entries(w.next || {})) {
      if (!ids.has(k)) errors.push(`${where}: next "${k}" inconnue`);
      if (typeof v !== 'number' || !(v >= 0)) errors.push(`${where}: poids next "${k}" invalide`);
      else if (k !== w.id) total += v;
    }
    if (!(total > 0)) errors.push(`${where}: aucune météo suivante possible`);
    for (const p of PHASES) {
      const b = w.phaseBias && w.phaseBias[p];
      if (typeof b !== 'number' || !(b >= 0)) errors.push(`${where}: phaseBias "${p}" invalide`);
    }
  }
  return errors;
}

export function validateConfig(config) {
  const errors = [];
  if (!config.bite || !(config.bite.holdS > 0)) errors.push('config: bite.holdS doit être > 0');
  if (!config.paceSets || !config.paceSets[config.pace]) errors.push('config: pace absent de paceSets');
  else {
    for (const [name, set] of Object.entries(config.paceSets)) {
      for (const r of [1, 2, 3, 4]) if (!(set.rarityWeights && set.rarityWeights[r] > 0)) errors.push(`config: paceSets.${name}.rarityWeights[${r}] doit être > 0`);
      const p = set.pity;
      if (!p || !(p.step >= 0) || !(p.cap >= 1) || !(p.guarantee >= 1)) errors.push(`config: paceSets.${name}.pity invalide`);
    }
  }
  if (!(config.dayLengthS > 0)) errors.push('config: dayLengthS doit être > 0');
  const ph = config.phases;
  if (!Array.isArray(ph) || ph.length === 0 || ph[0].from !== 0 || ph[ph.length - 1].to !== 1 || ph.some((p, i) => !(p.from < p.to) || (i > 0 && p.from !== ph[i - 1].to))) {
    errors.push('config: phases doit couvrir 0 à 1 sans trou');
  }
  const c = config.cast;
  if (!c || !(c.powerRate > 0) || !(c.minDistPx < c.maxDistPx)) errors.push('config: cast invalide');
  else if (!(c.releaseAtS > 0) || !(c.flightS > 0) || Math.abs(c.releaseAtS + c.flightS - c.landS) > 1e-9) errors.push('config: cast.landS doit valoir releaseAtS + flightS');
  for (const k of ['firstWaitS', 'waitS', 'returnWaitS']) {
    const r = config.bite && config.bite[k];
    if (!Array.isArray(r) || !(r[0] > 0) || !(r[0] <= r[1])) errors.push(`config: bite.${k} invalide`);
  }
  return errors;
}
