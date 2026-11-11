// Loop and timing: requestAnimationFrame, frame intervals fed to the auto quality, JS work per frame, GPU time (debug only, with
// EXT_disjoint_timer_query_webgl2 when exposed), long tasks, the debug overlay, pause on hidden tab, context loss / restore, resize.

import { percentile } from '../logic/quality.js';
import { viewSize } from './viewport.js';

export function createLoop(ctx, view, tiers, { step, debugLines, beforeRender, drawRoom, onResize }) {
  const { renderer, scene, camera, canvas } = view;
  const { $ } = ctx;
  const L = {
    frameNo: 0,
    firstFrameMs: null,
    lost: false,
    elapsed: 0,
    burnMs: 0, // debug only (setBurn): busy-waits this long each frame to test the auto quality
    stats: { intervals: [], work: [], gpu: [], tierLog: [] },
    longTasks: [],
  };
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) L.longTasks.push({ start: +e.startTime.toFixed(1), dur: +e.duration.toFixed(1) });
    }).observe({ type: 'longtask', buffered: true });
  } catch {
    /* longtask not supported */
  }
  const stats = L.stats;
  const gl = renderer.getContext();
  const tq = ctx.debug ? gl.getExtension('EXT_disjoint_timer_query_webgl2') : null;
  const queries = [];

  function render() {
    let q = null;
    if (tq && queries.length < 4) {
      q = gl.createQuery();
      gl.beginQuery(tq.TIME_ELAPSED_EXT, q);
    }
    // brief 29: while a room is open it is drawn instead of the world (the world costs nothing then)
    if (!drawRoom || !drawRoom()) {
      if (beforeRender) beforeRender();
      if (tiers.post) tiers.post.render();
      else renderer.render(scene, camera);
    }
    if (q) {
      gl.endQuery(tq.TIME_ELAPSED_EXT);
      queries.push(q);
    }
    while (queries.length && gl.getQueryParameter(queries[0], gl.QUERY_RESULT_AVAILABLE)) {
      const qq = queries.shift();
      const ns = gl.getQueryParameter(qq, gl.QUERY_RESULT);
      if (!gl.getParameter(tq.GPU_DISJOINT_EXT)) {
        stats.gpu.push(ns / 1e6);
        if (stats.gpu.length > 1200) stats.gpu.shift();
      }
      gl.deleteQuery(qq);
    }
    if (ctx.debug && L.frameNo % 15 === 0) {
      const iv = stats.intervals.slice(-120);
      const info = renderer.info;
      $('debug').textContent = [
        `tier ${tiers.name} (${tiers.qMode})  fps ${(1000 / (percentile(iv, 0.5) || 16.7)).toFixed(0)}`,
        `frame p50 ${percentile(iv, 0.5).toFixed(1)} p95 ${percentile(iv, 0.95).toFixed(1)} ms  work p95 ${percentile(stats.work.slice(-120), 0.95).toFixed(1)} ms`,
        `calls ${info.render.calls}  tris ${info.render.triangles}  geo ${info.memory.geometries}  tex ${info.memory.textures}`,
        ...debugLines(),
      ].join('\n');
    }
  }

  let last = performance.now();
  function frame(now) {
    if (L.lost) return;
    requestAnimationFrame(frame);
    const w0 = performance.now();
    const dtMs = Math.min(250, now - last);
    last = now;
    if (L.frameNo > 0) {
      stats.intervals.push(dtMs);
      if (stats.intervals.length > 1200) stats.intervals.shift();
      const r = tiers.quality.feed(dtMs);
      if (r.changed) {
        stats.tierLog.push({ at: +(performance.now() - ctx.t0).toFixed(0), to: r.tier, reason: r.reason });
        tiers.apply(r.tier);
      }
    }
    // photo mode freezes the world: the animation clock stops, so every frame is the same picture
    const dt = ctx.frozen ? 0 : Math.min(0.1, dtMs / 1000);
    L.elapsed += dt;
    if (L.burnMs > 0) for (const e = performance.now() + L.burnMs; performance.now() < e; ); // debug only: simulated slow device
    step(dt, L.elapsed);
    renderer.info.reset();
    render(dt);
    L.frameNo++;
    if (L.firstFrameMs === null) {
      L.firstFrameMs = performance.now() - ctx.t0;
      performance.mark('j7-first-frame');
    }
    stats.work.push(performance.now() - w0);
    if (stats.work.length > 1200) stats.work.shift();
  }

  function resize() {
    const { w, h } = viewSize();
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    if (tiers.post) tiers.post.setSize(w, h, renderer.getPixelRatio());
    if (onResize) onResize();
  }
  addEventListener('resize', resize);
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    L.lost = true;
    $('lost').textContent = ctx.tx['r.lost'];
    $('lost').hidden = false;
  });
  canvas.addEventListener('webglcontextrestored', () => {
    L.lost = false;
    $('lost').hidden = true;
    tiers.apply(tiers.name); // render targets and instanced buffers are rebuilt; three.js re-uploads the rest
    last = performance.now();
    requestAnimationFrame(frame);
  });
  document.addEventListener('visibilitychange', () => {
    if (ctx.onHidden) ctx.onHidden(document.hidden); // the shell pauses the game clock and the sound (a hidden tab never catches up)
    last = performance.now();
  });
  L.start = () => {
    resize();
    requestAnimationFrame(frame);
  };
  L.renderNow = () => render(0);
  L.resize = resize;
  L.resetStats = () => {
    stats.intervals.length = 0;
    stats.work.length = 0;
    stats.gpu.length = 0;
    L.longTasks.length = 0;
  };
  return L;
}
