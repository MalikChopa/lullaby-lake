// Sound of the shell (J9-A): builds the audio engine of the 2D game (src/audio/engine.js, read-only import) for a page that lives in refonte/, and holds
// the rules of the 2D game's main.js about the gesture and the mute:
//   - NO AudioContext before the player clicks "Commencer"; none at all with "Sans le son" (until the player unmutes by hand);
//   - NO music request before the click, none with "Sans le son", none while muted: the engine asks for a track only once its context is running;
//   - the recorded tracks are fetched from ../assets/music/<name> (the page is refonte/index.html), same origin, only paths isTrackUrl() accepts;
//   - "Sans le son" mutes this visit only: it is not written to the save (persistedMuted).
// Every browser object is injected (makeContext, fetchImpl), so the whole thing runs in Node with the fake context of tests/audio-fake.js.

import { createAudioEngine } from '../../../src/audio/engine.js';
import { isTrackUrl, decodeBytes } from '../../../src/audio/trackLoader.js';
import { createAudioHooks } from '../../../src/audio/hooks.js';
import { audioLevels } from '../../../src/core/audioMix.js';
import { lookParams } from '../../../src/core/sky.js';

/** Where the page asks for a track: the page is refonte/index.html, the tracks live in assets/music/ at the site root. */
export const MUSIC_BASE = '../';

/** loadBytes for the engine: refuses anything but 'assets/music/<name>.mp3|ogg', then fetches '../' + url. */
export function makeLoadBytes(fetchImpl, base = MUSIC_BASE) {
  return (url) => {
    if (!isTrackUrl(url)) return Promise.reject(new Error('not a music track path'));
    return fetchImpl(base + url, { credentials: 'same-origin', cache: 'default' }).then((res) => {
      if (!res.ok) throw new Error('track ' + res.status);
      return res.arrayBuffer();
    });
  };
}

/** The engine + the sound hooks (cast, splash, bite, catch, click). */
export function createShellAudio({ makeContext, fetchImpl, rng, analyser = false, timers, decode = decodeBytes }) {
  const opts = { makeContext, rng, analyser, loadBytes: makeLoadBytes(fetchImpl), decode };
  if (timers) opts.timers = timers;
  const engine = createAudioEngine(opts);
  return { engine, hooks: createAudioHooks({ engine }) };
}

/** The sound levels of the moment from the game's world (the same function as the 2D game: clock + weather mix -> look -> levels). */
export function levelsFor(world, data) {
  return audioLevels(lookParams(world.dayFrac, world.mix, data.weatherList, data.config, data.skyData));
}

/**
 * The outdoor ambience heard from inside a building (brief 29): the voices are turned down, the rain stays as rain on the roof, the music is not touched.
 * (A low-pass cannot be added on the ambience alone without editing src/audio/engine.js, which is out of bounds; a filter on the whole output would also dull the music.)
 */
export const INDOOR = Object.freeze({ water: 0.25, wind: 0.3, birds: 0.3, crickets: 0.4, rain: 0.75, music: 1 });
export function indoorLevels(l) {
  const o = { ...l };
  for (const k of Object.keys(INDOOR)) if (o[k] !== undefined) o[k] = o[k] * INDOOR[k];
  return o;
}

/**
 * Start / mute logic. `settings` is the live settings object; `say(key)` announces a text; `reflect()` redraws the settings controls.
 * Returns { begin(withSound), setMuted(m, say), applyVolumes(), persistedMuted() }.
 */
export function createSound({ engine, settings, say = () => {}, reflect = () => {} }) {
  let persistedMuted = settings.muted; // what the save keeps ("Sans le son" is not kept)
  function applyVolumes() {
    for (const k of ['ambience', 'fx', 'music']) engine.setVolume(k, settings[k]);
    engine.setStyle(settings.musicStyle);
  }
  /** Mute / unmute. Unmuting for the first time creates the AudioContext, so it must come from a click or a key press. */
  function setMuted(m, announce = true) {
    const before = persistedMuted;
    persistedMuted = m;
    settings.muted = m;
    if (!m && !engine.started && !engine.unavailable) {
      engine.start();
      applyVolumes();
    }
    engine.setMuted(m);
    if (!m && engine.unavailable) {
      settings.muted = true;
      persistedMuted = before;
      say('audio.unavailable');
    } else if (announce) say(m ? 'announce.muted' : 'announce.unmuted');
    reflect();
  }
  function begin(withSound) {
    if (withSound) {
      engine.setMuted(settings.muted);
      if (engine.start()) applyVolumes();
      else if (engine.unavailable) {
        settings.muted = true;
        say('audio.unavailable');
      }
    } else {
      settings.muted = true;
    }
    reflect();
  }
  return { begin, setMuted, applyVolumes, persistedMuted: () => persistedMuted };
}
