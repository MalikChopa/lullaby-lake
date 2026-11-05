// The ONLY place of the game that asks the network for something (J6 part D): the recorded music tracks, same origin, relative path.
// - `isTrackUrl` accepts only 'assets/music/<name>.mp3|ogg' (no scheme, no host, no '..', no query): anything else is refused before
//   the request is made, so no other address can ever be fetched from here. tests/no-network.test.js checks that this stays the only
//   fetch( in src/ and that the data holds nothing else.
// - The service worker (sw.js) answers from its cache when the track was heard before; otherwise the request goes to the server.
// - A failure (offline, 404, blocked) is a rejected promise: the engine drops the track and falls back, silently.

const TRACK_URL = /^assets\/music\/[a-z0-9][a-z0-9-]*\.(mp3|ogg)$/;

export function isTrackUrl(url) {
  return typeof url === 'string' && TRACK_URL.test(url);
}

/** @param {string} url relative path of a track @returns {Promise<ArrayBuffer>} */
export function loadTrackBytes(url) {
  if (!isTrackUrl(url)) return Promise.reject(new Error('not a music track path'));
  return fetch(url, { credentials: 'same-origin', cache: 'default' }).then((res) => {
    if (!res.ok) throw new Error('track ' + res.status);
    return res.arrayBuffer();
  });
}

/**
 * decodeAudioData in its promise form, with the older callback form as a fallback (Safari before 14). Resolves an AudioBuffer.
 * With `rate` (the native rate of the file) the file is decoded by a throw-away OfflineAudioContext of that rate instead of the real
 * context: decodeAudioData resamples to the rate of the context that decodes, and the real context often runs at 96 kHz (measured here:
 * a 123 s stereo mp3 = 90 MiB of PCM at 96 kHz, 43 MiB at its own 44.1 kHz). The buffer is played by an AudioBufferSourceNode, which
 * resamples when the rates differ. Without OfflineAudioContext the real context decodes.
 */
export function decodeBytes(ctx, bytes, rate = 0) {
  let dctx = ctx;
  const Off = typeof globalThis !== 'undefined' ? globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext : null;
  if (rate && Off) {
    try {
      dctx = new Off(1, 1, rate);
    } catch (e) {
      dctx = ctx;
    }
  }
  return new Promise((resolve, reject) => {
    let r;
    try {
      r = dctx.decodeAudioData(bytes, resolve, reject);
    } catch (e) {
      reject(e);
      return;
    }
    if (r && typeof r.then === 'function') r.then(resolve, reject);
  });
}
