// Camera maths of the slice. Pure: no DOM, no three.js. Vectors are plain [x, y, z] arrays.

const DEG = Math.PI / 180;

/** Offset from the aimed point to the camera: tilted `pitchDeg` below the horizon, looking toward -z rotated by `yawDeg`. */
export function cameraOffset(pitchDeg, yawDeg, distance) {
  const p = pitchDeg * DEG;
  const y = yawDeg * DEG;
  const h = Math.cos(p) * distance;
  return [Math.sin(y) * h, Math.sin(p) * distance, Math.cos(y) * h];
}

/** Share of the remaining gap closed in dt seconds by an exponential follow of `rate` (1/s). Frame-rate independent. */
export function dampFactor(rate, dt) {
  return 1 - Math.exp(-rate * Math.max(0, dt));
}

/** One step of the damped follow: moves `cur` toward `goal`. Returns a new array. */
export function followStep(cur, goal, dt, rate) {
  const k = dampFactor(rate, dt);
  return cur.map((v, i) => v + (goal[i] - v) * k);
}

/** Zoom: a wheel / pinch delta (positive = farther) applied multiplicatively, clamped to [min, max]. */
export function zoomBy(distance, delta, min, max) {
  const d = distance * Math.exp(delta);
  return Math.min(max, Math.max(min, d));
}

/**
 * Does the segment a -> b pass through the sphere (centre c, radius r)? Used to fade a pine or the cabin that hides the angler.
 * Ignores the last `skipEnd` metres near b (the angler's own spot).
 */
export function segmentHitsSphere(a, b, c, r, skipEnd = 0) {
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const len = Math.hypot(d[0], d[1], d[2]);
  if (len === 0) return false;
  const u = d.map((v) => v / len);
  const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  let t = ac[0] * u[0] + ac[1] * u[1] + ac[2] * u[2];
  t = Math.max(0, Math.min(len - skipEnd, t));
  const p = [a[0] + u[0] * t - c[0], a[1] + u[1] * t - c[1], a[2] + u[2] * t - c[2]];
  return p[0] * p[0] + p[1] * p[1] + p[2] * p[2] < r * r;
}
