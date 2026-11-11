// Hooks for the browser checks (window.__j7): read-only state and stats always; mutators (teleport, setWorld, setBurn, setTier, context
// loss...) only with ?debug=1. Includes the GPU memory ESTIMATE (WebGL does not expose the real figure).

import { TIERS } from '../data/params.js';
import { percentile } from '../logic/quality.js';
import { swayUniforms } from '../world/grass.js';
import { viewSize } from './viewport.js';

export function createHooks(ctx, { view, tiers, loop, hud, light, state, teleport, extra = {}, debugExtra = {} }) {
  const { renderer, scene, sun } = view;
  const { game } = ctx;
  const hooks = {
    ready: true,
    fallback: false,
    state: () => ({
      tier: tiers.name,
      qMode: tiers.qMode,
      quality: tiers.quality.state(),
      ...state(),
      fishing: game.getState().fishing.phase,
      book: Object.keys(game.getState().book).length,
      world: game.getState().world,
      reduced: ctx.reduced,
      lost: loop.lost,
      frames: loop.frameNo,
      firstFrameMs: loop.firstFrameMs,
      cardShown: hud.cardShown(),
      hint: hud.hint(),
      badge: hud.badge(),
    }),
    stats: (n = 600) => {
      const st = loop.stats;
      const iv = st.intervals.slice(-n);
      const wk = st.work.slice(-n);
      const info = renderer.info;
      return {
        n: iv.length,
        p50: percentile(iv, 0.5),
        p95: percentile(iv, 0.95),
        workP50: percentile(wk, 0.5),
        workP95: percentile(wk, 0.95),
        gpuN: st.gpu.slice(-n).length,
        gpuP50: percentile(st.gpu.slice(-n), 0.5),
        gpuP95: percentile(st.gpu.slice(-n), 0.95),
        calls: info.render.calls,
        triangles: info.render.triangles,
        geometries: info.memory.geometries,
        textures: info.memory.textures,
        programs: info.programs ? info.programs.length : null,
        heap: performance.memory ? performance.memory.usedJSHeapSize : null,
        tierLog: st.tierLog.slice(),
        longTasks: loop.longTasks.slice(),
      };
    },
    faded: () => view.occluders().filter((m) => m.material.transparent).map((m) => m.name),
    resetStats: () => loop.resetStats(),
    /**
     * GPU memory ESTIMATE in bytes (not a measurement: WebGL does not expose it). Buffers = every attribute / index / instance array of the
     * scene once; textures = width x height x 4 of each distinct texture image; shadow map = size^2 x 4; screen = drawing buffer colour + depth
     * (8 B/px); post = 2 half-float targets (8 B/px each) + MSAA buffer (samples x 8 B/px + depth) + bloom chain (~0.67 x 8 B/px x 2)
     * + the extra targets the tier declares (tiers.post.extraBytesPerPx).
     */
    gpuMem: () => {
      const seenB = new Set();
      const seenT = new Set();
      let buffers = 0;
      let textures = 0;
      scene.traverse((o) => {
        const g = o.geometry;
        if (g && !seenB.has(g)) {
          seenB.add(g);
          for (const a of Object.values(g.attributes)) buffers += a.array.byteLength;
          if (g.index) buffers += g.index.array.byteLength;
        }
        if (o.isInstancedMesh) buffers += o.instanceMatrix.array.byteLength + (o.instanceColor ? o.instanceColor.array.byteLength : 0);
        const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
        for (const m of mats) {
          const tex = m.map;
          if (tex && tex.image && !seenT.has(tex.source)) {
            seenT.add(tex.source);
            textures += (tex.image.width || 0) * (tex.image.height || 0) * 4;
          }
        }
      });
      const pr = renderer.getPixelRatio();
      const vs = viewSize();
      const px = vs.w * vs.h * pr * pr;
      const shadow = sun.shadow.mapSize.x * sun.shadow.mapSize.y * 4;
      const screen = px * 8;
      const tier = TIERS[tiers.name];
      const extra = tiers.post && tiers.post.extraBytesPerPx ? tiers.post.extraBytesPerPx * px : 0;
      const postB = tier.post ? px * 16 + (tier.msaa ? px * (tier.msaa * 8 + 4) : 0) + px * 8 * 0.67 * 2 + extra : 0;
      return { buffers, textures, shadow, screen, post: Math.round(postB), total: Math.round(buffers + textures + shadow + screen + postB) };
    },
    gpuInfo: () => {
      const gl = renderer.getContext();
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const g = tiers.grass;
      return { renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), shadowSize: sun.shadow.mapSize.x, pixelRatio: renderer.getPixelRatio(), grass: g.grass.count, flowers: g.flowers.count, rain: tiers.rain.count };
    },
    ...extra,
  };
  if (ctx.debug) {
    const loseExt = renderer.getContext().getExtension('WEBGL_lose_context');
    Object.assign(hooks, {
      teleport,
      setWorld: (o) => game.setWorld(o),
      setBurn: (ms) => {
        loop.burnMs = Math.max(0, Number(ms) || 0);
      },
      setTier: (name) => tiers.force(name),
      setReduced: (v) => {
        ctx.reduced = !!v;
        ctx.$('chkRm').checked = ctx.reduced;
        document.body.classList.toggle('rm', ctx.reduced);
      },
      loseContext: () => loseExt.loseContext(),
      restoreContext: () => loseExt.restoreContext(),
      uniforms: () => ({ wind: swayUniforms.uWind.value, wave: view.water.uniforms.uWave.value }),
      light: () => light.last,
      renderer,
      scene,
      ...debugExtra,
    });
  }
  window.__j7 = hooks;
  return hooks;
}
