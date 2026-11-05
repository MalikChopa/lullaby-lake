// The 480x270 picture. PixiJS WebGL when available; otherwise a still 2D picture (the caller shows a sentence).
// Interface: { kind, draw(frame), extractPixels(), textureCount(), loseContext(), restoreContext(), onContext(lostCb, restoredCb) }
// `layer` = render/layers.js createFrameLayer(); draw() takes the finished frame (Uint32Array) from art/compose.js.

import { Application, Sprite, Texture } from './pixi.js';
import { W, H } from '../art/sceneBake.js';

export async function createStage({ canvas, layer }) {
  const app = new Application();
  await app.init({
    canvas,
    width: W,
    height: H,
    resolution: 1,
    autoDensity: false,
    antialias: false,
    backgroundColor: 0x1b1840,
    preference: ['webgl'], // an array = WebGL only (a plain string would still fall back on WebGPU)
    autoStart: false,
  });
  app.ticker.stop();

  const tex = Texture.from(layer.canvas);
  tex.source.scaleMode = 'nearest';
  app.stage.addChild(new Sprite(tex));

  let lost = false;
  const gl = app.renderer.gl || null;
  const loseExt = gl ? gl.getExtension('WEBGL_lose_context') : null;
  return {
    kind: 'webgl',
    renderer: app.renderer.name,
    isLost: () => lost,
    draw(frame) {
      if (lost) return;
      layer.put(frame);
      tex.source.update();
      app.renderer.render(app.stage);
    },
    /** Debug / leak check: textures PixiJS manages (the one picture texture; it must stay constant over a long session). */
    textureCount() {
      const t = app.renderer.texture;
      return t && t.managedTextures ? t.managedTextures.length : null;
    },
    /** Reads back the 480x270 canvas pixels (RGBA) through PixiJS' extraction. */
    extractPixels() {
      const r = app.renderer.extract.pixels(app.stage);
      return r.pixels ? r.pixels : r;
    },
    loseContext() {
      if (loseExt) loseExt.loseContext();
      return !!loseExt;
    },
    restoreContext() {
      if (loseExt) loseExt.restoreContext();
      return !!loseExt;
    },
    onContext(lostCb, restoredCb) {
      canvas.addEventListener('webglcontextlost', () => {
        lost = true;
        lostCb();
      });
      canvas.addEventListener('webglcontextrestored', () => {
        tex.source.update();
        lost = false;
        restoredCb();
      });
    },
  };
}

/** Still picture without WebGL: the frame on a 2D canvas. */
export function createStillStage({ canvas, layer }) {
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  return {
    kind: '2d',
    isLost: () => false,
    textureCount: () => 0,
    draw(frame) {
      layer.put(frame);
      ctx.drawImage(layer.canvas, 0, 0);
    },
    extractPixels() {
      return ctx.getImageData(0, 0, W, H).data;
    },
    loseContext: () => false,
    restoreContext: () => false,
    onContext() {},
  };
}
