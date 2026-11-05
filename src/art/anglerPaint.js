// Geometry of the angler's rod and of the cast (pixels on the 480x270 picture). The angler himself is baked in the
// foreground (sceneBake.js); the rod, line and float are drawn every frame (overlayPaint.js). Pure.

export const HAND = [248, 186]; // where the angler holds the rod
export const IDLE_TIP = [284, 148]; // rod tip at rest
export const BACK_TIP = [262, 147]; // rod tip leaned back (small lean while charging, and start of the swing)
export const FWD_TIP = [312, 156]; // rod tip after the swing
export const LANDING_Y = 216; // the float always lands on this row (the distance is horizontal only)
export const RING_DY = 6; // ripples sit this far under the float
export const LAND_X_MIN = 310; // landing column for the shortest cast
export const LAND_X_SPAN = 66; // added for the longest cast
export const ARC_MIN = 12; // arc height of the shortest cast
export const ARC_SPAN = 22; // added for the longest cast

/** Where a cast of `distPx` lands: farther = more to the right. height = peak of the flight arc (visual). */
export function landingPoint(distPx, cast) {
  const u = Math.min(1, Math.max(0, (distPx - cast.minDistPx) / (cast.maxDistPx - cast.minDistPx)));
  return { x: Math.round(LAND_X_MIN + u * LAND_X_SPAN), y: LANDING_Y, height: ARC_MIN + u * ARC_SPAN };
}
