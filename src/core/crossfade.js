// Gain curves of the recorded tracks (J6 part D). Pure. A cross-fade between two things A and B uses A = fadeCurve('out'),
// B = fadeCurve('in') over the same time: cos and sin of a quarter turn, so that A^2 + B^2 = 1 at every moment (equal power): the
// loudness stays level in the middle instead of dipping by 3 dB as it does with two straight lines.

/**
 * @param {'in'|'out'} kind
 * @param {number} n number of points (>= 2)
 * @param {number} peak gain at the loud end
 * @returns {Float32Array} n values from 0 to peak (in) or from peak to 0 (out)
 */
export function fadeCurve(kind, n = 128, peak = 1) {
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = i / (n - 1);
    c[i] = peak * (kind === 'in' ? Math.sin((x * Math.PI) / 2) : Math.cos((x * Math.PI) / 2));
  }
  c[kind === 'in' ? 0 : n - 1] = 0; // exactly silent at the silent end (no rounding left over)
  return c;
}

/**
 * Where a track starts and when it fades, given its length. The next track starts `crossS` before the end of this one.
 * A track shorter than 3 cross-fades gets a shorter cross-fade (never an overlap of in and out curves on one track).
 * @returns {{fadeInS:number, fadeOutS:number, nextAtS:number}} seconds from the track start
 */
export function trackTimes(durationS, crossS) {
  const x = Math.max(0.5, Math.min(crossS, durationS / 3));
  return { fadeInS: x, fadeOutS: x, nextAtS: durationS - x };
}
