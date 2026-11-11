// Size of the picture box, and "Play anyway" (portrait phone that cannot turn): the 2D game turns the page a quarter turn by CSS (html[data-rot="1"]),
// so the 3D view lives in the turned box. Everything that reads the window size or a touch position goes through here: the canvas is sized from the
// turned box, and a touch on the portrait screen is mapped back into the box (the box is rotated 90 degrees clockwise, its corner at the top right).

export const PORTRAIT_QUERY = '(orientation: portrait) and (pointer: coarse) and (max-width: 600px)';

export const turned = () => document.documentElement.dataset.rot === '1' && window.matchMedia(PORTRAIT_QUERY).matches;

/** Width and height (CSS px) of the box the picture and the interface live in. */
export const viewSize = () => (turned() ? { w: window.innerHeight, h: window.innerWidth } : { w: window.innerWidth, h: window.innerHeight });

/** A client position (clientX, clientY) -> the position in the box: [x, y]. */
export const toLocal = (cx, cy) => (turned() ? [cy, window.innerWidth - cx] : [cx, cy]);
