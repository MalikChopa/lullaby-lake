// Photo mode (J9-A): a PNG of the 3D view, 1920 x 1080, named lullaby-lake-YYYYMMDD-HHMMSS.png (file name logic reused from the 2D game).
// The picture is rendered ONCE at the target size with the quality of the current tier (never scaled down to a lower tier): the drawing buffer is
// set to 1920 x 1080 at pixel ratio 1, the scene (and the post-processing chain when the tier has one) is drawn, the canvas is read at once (a WebGL
// canvas without preserveDrawingBuffer is only readable in the task that drew it), then the window size comes back. The page interface is HTML over
// the canvas, so it is never in the file. The photo is always 16:9 with the same vertical field of view as the game.

import { photoFileName } from '../../../src/render/photo.js';

export const PHOTO_W = 1920;
export const PHOTO_H = 1080;
export { photoFileName };

/** Size and aspect of the shot (a constant here; a function so that the unit test states the contract). */
export function photoSize() {
  return { width: PHOTO_W, height: PHOTO_H, aspect: PHOTO_W / PHOTO_H };
}

/**
 * Renders and saves. `view` = { renderer, camera, canvas }, `tiers` (post chain), `draw()` = what the loop draws (reflection pass + post.render or renderer.render),
 * `viewSize()` = { w, h } of the window box (to restore). Resolves { name, width, height }. Rejects when the PNG could not be made.
 */
export function savePhoto3d({ view, tiers, draw, viewSize, date = new Date(), doc = document }) {
  const { renderer, camera, canvas } = view;
  const { width, height, aspect } = photoSize();
  const pr = renderer.getPixelRatio();
  const vs = viewSize();
  const oldAspect = camera.aspect;
  return new Promise((resolve, reject) => {
    let blobPromise;
    try {
      renderer.setPixelRatio(1);
      renderer.setSize(width, height, false);
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
      if (tiers.post) tiers.post.setSize(width, height, 1);
      draw();
      blobPromise = new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('no PNG'))), 'image/png'));
    } catch (e) {
      blobPromise = Promise.reject(e);
    }
    // the window size comes back at once (the PNG is already captured by toBlob)
    try {
      renderer.setPixelRatio(pr);
      renderer.setSize(vs.w, vs.h, false);
      camera.aspect = oldAspect;
      camera.updateProjectionMatrix();
      if (tiers.post) tiers.post.setSize(vs.w, vs.h, pr);
    } catch (e) {
      /* the loop's resize puts it right at the next frame */
    }
    blobPromise.then((blob) => {
      const name = photoFileName(date);
      const url = URL.createObjectURL(blob);
      const a = doc.createElement('a');
      a.href = url;
      a.download = name;
      a.rel = 'noopener';
      a.style.display = 'none';
      doc.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      resolve({ name, width, height });
    }, reject);
  });
}
