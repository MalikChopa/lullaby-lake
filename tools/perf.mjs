// Frame-time measurement (480x270 picture, J1b) in a VISIBLE Chrome window (temporary profile). Usage: node tools/perf.mjs [seconds=20] [--headless]
// Reports work time p50/p95/max (duration of the animation-frame callback), frame rate, long tasks, and the same under CPU x4.
// What it proves: this PC's capacity. Nothing about a phone.
import { mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createServer, listen } from './serve.mjs';
import { launch } from './cdp.mjs';

const secs = Number(process.argv.find((a) => /^\d+$/.test(a))) || 20;
const headless = process.argv.includes('--headless');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const { server, port } = await listen(createServer(), 4183);
const b = await launch({ headless: !headless ? false : true, width: 1280, height: 800 });
const out = { date: new Date().toISOString(), headless, seconds: secs };
try {
  out.browser = await b.version();
  const p = await b.newPage();
  await p.setViewport(1280, 720, {});
  await p.goto(`http://127.0.0.1:${port}/${process.env.PERF_QUERY || "?perf=1"}`);
  await p.until('window.__lullaby && __lullaby.perf', 15000);
  await p.eval('document.getElementById("btnStart").click()');
  // cast and keep the line in the water (waiting: ripples, fireflies, float bob) with the delay-free setting not needed
  const r = await p.rect('#stage');
  await p.mouse('mousePressed', r.x + r.w * 0.4, r.y + r.h * 0.62);
  await sleep(300);
  await p.mouse('mouseReleased', r.x + r.w * 0.4, r.y + r.h * 0.62);
  await sleep(1500);
  const measure = async (label, ms) => {
    await p.eval('__lullaby.perf.reset()');
    const m0 = await p.metrics();
    const chunks = [];
    const t0 = Date.now();
    for (let i = 0; i < Math.ceil(ms / 2000); i++) {
      await sleep(2000);
      chunks.push(await p.eval('JSON.stringify(__lullaby.perf.stats())').then(JSON.parse)); // the ring keeps 600 frames, so sample every 2 s
    }
    const elapsed = (Date.now() - t0) / 1000;
    const m1 = await p.metrics();
    const last = chunks[chunks.length - 1];
    const st = await p.eval('JSON.stringify({phase:__lullaby.state().phase,dpr:devicePixelRatio,renderer:__lullaby.state().renderer})').then(JSON.parse);
    out[label] = {
      seconds: Math.round(elapsed * 10) / 10,
      frames: last.total,
      fpsMean: last.total / elapsed,
      workP95Worst: Math.max(...chunks.map((c) => c.workP95)),
      workP50Mean: chunks.reduce((x, c) => x + c.workP50, 0) / chunks.length,
      workMax: Math.max(...chunks.map((c) => c.workMax)),
      longTasks: chunks.reduce((x, c) => x + c.longTasks, 0),
      taskMsPerFrame: ((m1.TaskDuration - m0.TaskDuration) * 1000) / Math.max(1, last.total),
      scriptMsPerFrame: ((m1.ScriptDuration - m0.ScriptDuration) * 1000) / Math.max(1, last.total),
      ...st,
    };
    console.log(label, JSON.stringify(out[label], (k, v) => (typeof v === 'number' ? Math.round(v * 100) / 100 : v)));
  };
  await measure('normal', secs * 1000);
  await p.send('HeapProfiler.enable');
  await p.send('HeapProfiler.collectGarbage');
  const heap = await p.send('Runtime.getHeapUsage');
  out.jsHeapUsedMiB = Math.round((heap.usedSize / 1048576) * 10) / 10; // JS heap after a forced garbage collection (page memory, textures not included)
  console.log('JS heap after GC (MiB):', out.jsHeapUsedMiB);
  await p.cpuThrottle(4);
  await sleep(500);
  await measure('cpu_x4', 10000);
  await p.cpuThrottle(1);
  await p.cpuThrottle(6);
  await sleep(500);
  await measure('cpu_x6', 10000);
  await p.cpuThrottle(1);
  const gpu = spawnSync('powershell', ['-NoProfile', '-Command', "Get-CimInstance Win32_VideoController | Where-Object {$_.CurrentRefreshRate} | ForEach-Object { $_.CurrentRefreshRate }"], { encoding: 'utf8' });
  out.displayRefreshHz = gpu.stdout.trim().split(/\s+/).filter(Boolean);
} finally {
  await b.close();
  server.close();
}
mkdirSync(new URL('../test-results/', import.meta.url), { recursive: true });
writeFileSync(new URL('../test-results/perf.json', import.meta.url), JSON.stringify(out, null, 1));
console.log('display refresh (Hz, as reported by Windows):', out.displayRefreshHz);
