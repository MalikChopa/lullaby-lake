// Sound buffers made once by code (no audio file): noise, water, rain, crickets. Pure functions on Float32Array: testable without a browser.
// The seeded random function is always passed in, never Math.random.

/** Makes a buffer loop without a click: the first `f` samples are a crossfade of the start and of the spare tail. n = final length. */
function loopable(raw, n, f) {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = raw[i];
  for (let i = 0; i < f; i++) {
    const t = i / f;
    out[i] = raw[i] * t + raw[n + i] * (1 - t);
  }
  return out;
}

function normalise(a, peak) {
  let m = 1e-9;
  for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i]));
  const k = peak / m;
  for (let i = 0; i < a.length; i++) a[i] *= k;
  return a;
}

/** White noise, looping. */
export function whiteLoop(rng, n, peak = 0.9) {
  const f = Math.min(2048, n >> 2);
  const raw = new Float32Array(n + f);
  for (let i = 0; i < raw.length; i++) raw[i] = rng() * 2 - 1;
  return normalise(loopable(raw, n, f), peak);
}

/** Brown noise (soft rumble), looping: the base of the water. */
export function brownLoop(rng, n, peak = 0.9) {
  const f = Math.min(4096, n >> 2);
  const raw = new Float32Array(n + f);
  let b = 0;
  for (let i = 0; i < raw.length; i++) {
    b = (b + 0.04 * (rng() * 2 - 1)) / 1.04;
    raw[i] = b;
  }
  return normalise(loopable(raw, n, f), peak);
}

/** Rain: hiss with sparse short drops, looping. */
export function rainLoop(rng, sr, seconds, peak = 0.9) {
  const n = Math.floor(sr * seconds);
  const f = 2048;
  const raw = new Float32Array(n + f);
  for (let i = 0; i < raw.length; i++) raw[i] = (rng() * 2 - 1) * 0.5;
  const drops = Math.floor(seconds * 38);
  for (let d = 0; d < drops; d++) {
    const at = Math.floor(rng() * (raw.length - 400));
    const amp = 0.4 + rng() * 0.6;
    for (let i = 0; i < 380; i++) raw[at + i] += (rng() * 2 - 1) * amp * Math.exp(-i / 70);
  }
  return normalise(loopable(raw, n, f), peak);
}

/** Crickets: stereo, two detuned pulse trains (4.4 and 4.6 kHz), 3 chirps per group, groups every ~0.5 s. Returns [left, right]. */
export function cricketsLoop(rng, sr, seconds) {
  const n = Math.floor(sr * seconds);
  const out = [new Float32Array(n), new Float32Array(n)];
  const base = [4400, 4600];
  for (let c = 0; c < 2; c++) {
    const phaseOffset = c * 0.17 + rng() * 0.05;
    const groupEvery = 0.5 + c * 0.04;
    for (let g = 0; g * groupEvery < seconds; g++) {
      for (let k = 0; k < 3; k++) {
        const start = Math.floor((g * groupEvery + phaseOffset + k * 0.055) * sr);
        const len = Math.floor(0.03 * sr);
        for (let i = 0; i < len; i++) {
          const j = (start + i) % n;
          const env = Math.sin((Math.PI * i) / len);
          out[c][j] += Math.sin((2 * Math.PI * base[c] * i) / sr) * env * (0.5 + 0.25 * k);
        }
      }
    }
  }
  normalise(out[0], 0.9);
  normalise(out[1], 0.9);
  return out;
}
