// Fade of the occluders (houses, trees) that hide the angler from the camera. Pure maths: which occluders are between the camera and the
// angler's head, and a frame-rate independent fade toward the target (the renderer dithers the occluder by that amount).

import { segmentHitsSphere, dampFactor } from './camera.js';

/** Maximum fade (share of the pixels dropped by the dither) of a hiding occluder: it never disappears completely. */
export const FADE_MAX = 0.72;
/** Fade speed (1/s). */
export const FADE_RATE = 7;

/**
 * Does the occluder (sphere c, r) hide the head from the camera? It must cut the camera -> head segment (the last `skip` metres near
 * the head ignored) AND stand on the camera side of the head (an occluder behind the angler never fades, whatever the camera heading).
 */
export function hides(cam, head, occ, skip = 0.4) {
  if (!segmentHitsSphere(cam, head, occ.c, occ.r, skip)) return false;
  const vx = cam[0] - head[0];
  const vz = cam[2] - head[2];
  const l = Math.hypot(vx, vz) || 1;
  return ((occ.c[0] - head[0]) * vx + (occ.c[2] - head[2]) * vz) / l > -0.5;
}

/** One step of the fade toward `target` (0 or FADE_MAX); snaps when close so it settles exactly. */
export function fadeStep(cur, target, dt, rate = FADE_RATE) {
  const n = cur + (target - cur) * dampFactor(rate, dt);
  return Math.abs(n - target) < 0.004 ? target : n;
}
