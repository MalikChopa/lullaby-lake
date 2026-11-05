// Minimal Chrome DevTools Protocol driver. No dependency: uses Node 22's global WebSocket and fetch.
// Launches an installed Chrome/Edge with a temporary profile and a debugging port on 127.0.0.1 only.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { createServer as netServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';

const BAD_PORTS = new Set([4190, 5060, 5061, 6000, 6566, 6665, 6666, 6667, 6668, 6669, 6697]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Edge ignores Home / End / ArrowRight sent as `rawKeyDown` (seen in J5: ArrowDown worked, the others did nothing); `keyDown` works in both. Chrome keeps the old form (checks J1 to J4 were measured with it).
const KEYDOWN_ALWAYS = /msedge/i.test(process.env.CHROME_PATH || '') || process.env.LL_KEYDOWN === '1';

/** CHROME_PATH first, then the usual Windows / macOS / Linux locations (Chrome, then Edge). */
export function findBrowser() {
  const e = process.env;
  const list = [
    e.CHROME_PATH,
    e.PROGRAMFILES && join(e.PROGRAMFILES, 'Google/Chrome/Application/chrome.exe'),
    e['PROGRAMFILES(X86)'] && join(e['PROGRAMFILES(X86)'], 'Google/Chrome/Application/chrome.exe'),
    e.LOCALAPPDATA && join(e.LOCALAPPDATA, 'Google/Chrome/Application/chrome.exe'),
    e['PROGRAMFILES(X86)'] && join(e['PROGRAMFILES(X86)'], 'Microsoft/Edge/Application/msedge.exe'),
    e.PROGRAMFILES && join(e.PROGRAMFILES, 'Microsoft/Edge/Application/msedge.exe'),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ].filter(Boolean);
  const found = list.find((p) => existsSync(p));
  if (!found) throw new Error('No Chrome/Edge found: set the CHROME_PATH environment variable');
  return found;
}

async function freePort(start) {
  for (let p = start; p < start + 80; p++) {
    if (BAD_PORTS.has(p)) continue;
    const ok = await new Promise((res) => {
      const s = netServer();
      s.once('error', () => res(false));
      s.listen(p, '127.0.0.1', () => s.close(() => res(true)));
    });
    if (ok) return p;
  }
  throw new Error('no free port');
}

export class Page {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.handlers = new Map();
    this.consoleErrors = [];
    this.consoleWarnings = [];
    this.requests = []; // { url, origin, status, encoded, mime }
    this._byId = new Map();
    ws.addEventListener('message', (m) => this._onMessage(JSON.parse(m.data)));
  }
  _onMessage(msg) {
    if (msg.id && this.pending.has(msg.id)) {
      const { res, rej } = this.pending.get(msg.id);
      this.pending.delete(msg.id);
      if (msg.error) rej(new Error(msg.error.message));
      else res(msg.result);
      return;
    }
    for (const h of this.handlers.get(msg.method) || []) h(msg.params);
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((res, rej) => {
      this.pending.set(id, { res, rej });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  on(method, cb) {
    if (!this.handlers.has(method)) this.handlers.set(method, []);
    this.handlers.get(method).push(cb);
  }
  once(method) {
    return new Promise((res) => {
      const list = this.handlers.get(method) || [];
      const h = (p) => {
        list.splice(list.indexOf(h), 1);
        res(p);
      };
      list.push(h);
      this.handlers.set(method, list);
    });
  }
  /**
   * @param {{keepStorage?: boolean}} [o] Since J4 the game keeps its settings in localStorage: unless `keepStorage`, every new document
   * starts with an empty localStorage (as before J4, each load = a fresh game), so one check cannot leak a language or a size into the next.
   */
  async init(o = {}) {
    for (const d of ['Page', 'Runtime', 'Network', 'Log', 'Performance']) await this.send(d + '.enable');
    if (!o.keepStorage) await this.send('Page.addScriptToEvaluateOnNewDocument', { source: 'try{localStorage.clear()}catch(e){}' });
    await this.send('Emulation.setFocusEmulationEnabled', { enabled: true });
    this.on('Runtime.exceptionThrown', (p) => this.consoleErrors.push('exception: ' + (p.exceptionDetails.exception?.description || p.exceptionDetails.text)));
    this.on('Runtime.consoleAPICalled', (p) => {
      const text = p.args.map((a) => a.value ?? a.description ?? '').join(' ');
      if (p.type === 'error') this.consoleErrors.push('console.error: ' + text);
      if (p.type === 'warning') this.consoleWarnings.push(text);
    });
    this.on('Log.entryAdded', (p) => {
      if (p.entry.level === 'error') this.consoleErrors.push(`log: ${p.entry.text} ${p.entry.url || ''}`);
      if (p.entry.level === 'warning') this.consoleWarnings.push(p.entry.text);
    });
    this.on('Network.requestWillBeSent', (p) => {
      const r = { url: p.request.url, origin: p.request.url.startsWith('data:') ? 'data:' : new URL(p.request.url).origin, status: null, encoded: 0, mime: null };
      this._byId.set(p.requestId, r);
      this.requests.push(r);
    });
    this.on('Network.responseReceived', (p) => {
      const r = this._byId.get(p.requestId);
      if (r) {
        r.status = p.response.status;
        r.mime = p.response.mimeType;
      }
    });
    this.on('Network.loadingFinished', (p) => {
      const r = this._byId.get(p.requestId);
      if (r) r.encoded = p.encodedDataLength;
    });
    this.on('Network.loadingFailed', (p) => {
      const r = this._byId.get(p.requestId);
      if (r) r.failed = p.errorText;
    });
  }
  async goto(url) {
    const loaded = this.once('Page.loadEventFired');
    await this.send('Page.navigate', { url });
    await loaded;
  }
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error('eval failed: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text) + ' in ' + expression.slice(0, 80));
    return r.result.value;
  }
  async until(expression, timeoutMs = 10000, pollMs = 20) {
    const t0 = Date.now();
    for (;;) {
      const v = await this.eval(expression).catch(() => undefined);
      if (v) return v;
      if (Date.now() - t0 > timeoutMs) throw new Error('timeout waiting for: ' + expression.slice(0, 100));
      await sleep(pollMs);
    }
  }
  sleep(ms) {
    return sleep(ms);
  }
  // ----- input
  mouse(type, x, y) {
    return this.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1 });
  }
  touch(type, x, y) {
    return this.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
  }
  key(type, k, repeat = false) {
    const K = {
      ' ': { key: ' ', code: 'Space', vk: 32, text: ' ' },
      Enter: { key: 'Enter', code: 'Enter', vk: 13, text: '\r' },
      Escape: { key: 'Escape', code: 'Escape', vk: 27 },
      Tab: { key: 'Tab', code: 'Tab', vk: 9 },
      ArrowRight: { key: 'ArrowRight', code: 'ArrowRight', vk: 39 },
      ArrowDown: { key: 'ArrowDown', code: 'ArrowDown', vk: 40 },
      ArrowLeft: { key: 'ArrowLeft', code: 'ArrowLeft', vk: 37 },
      ArrowUp: { key: 'ArrowUp', code: 'ArrowUp', vk: 38 },
      Home: { key: 'Home', code: 'Home', vk: 36 },
      End: { key: 'End', code: 'End', vk: 35 },
    }[k] || { key: k, code: 'Key' + k.toUpperCase(), vk: k.toUpperCase().charCodeAt(0), text: k };
    return this.send('Input.dispatchKeyEvent', {
      type: type === 'down' ? (K.text || KEYDOWN_ALWAYS ? 'keyDown' : 'rawKeyDown') : 'keyUp',
      key: K.key, code: K.code, windowsVirtualKeyCode: K.vk, nativeVirtualKeyCode: K.vk,
      text: type === 'down' ? K.text : undefined, autoRepeat: repeat,
    });
  }
  async press(k, holdMs = 30) {
    await this.key('down', k);
    await sleep(holdMs);
    await this.key('up', k);
  }
  /** Center of the first element matching the selector, in CSS pixels, plus its size. */
  rect(selector) {
    return this.eval(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)return null;const r=e.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height,cx:r.x+r.width/2,cy:r.y+r.height/2}})()`);
  }
  async clickEl(selector) {
    const r = await this.rect(selector);
    if (!r) throw new Error('no element ' + selector);
    await this.mouse('mousePressed', r.cx, r.cy);
    await sleep(40);
    await this.mouse('mouseReleased', r.cx, r.cy);
  }
  // ----- emulation
  async setViewport(width, height, { mobile = false, touch = false, dpr = 1 } = {}) {
    await this.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: dpr, mobile });
    await this.send('Emulation.setTouchEmulationEnabled', touch ? { enabled: true, maxTouchPoints: 1 } : { enabled: false });
  }
  cpuThrottle(rate) {
    return this.send('Emulation.setCPUThrottlingRate', { rate });
  }
  async screenshot(file, { scale = 1, clip } = {}) {
    const r = await this.send('Page.captureScreenshot', { format: 'png', clip: clip && { ...clip, scale }, captureBeyondViewport: false });
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, Buffer.from(r.data, 'base64'));
    return file;
  }
  async metrics() {
    const r = await this.send('Performance.getMetrics');
    return Object.fromEntries(r.metrics.map((m) => [m.name, m.value]));
  }
  clearLogs() {
    this.consoleErrors.length = 0;
    this.consoleWarnings.length = 0;
    this.requests.length = 0;
  }
}

export class Browser {
  constructor(proc, port, profile, ownProfile, keepStorage = false) {
    this.keepStorage = keepStorage;
    this.proc = proc;
    this.port = port;
    this.profile = profile;
    this.ownProfile = ownProfile;
  }
  async newPage() {
    const list = await (await fetch(`http://127.0.0.1:${this.port}/json/list`)).json();
    const t = list.find((x) => x.type === 'page' && !/^(edge|chrome|devtools|chrome-untrusted|chrome-extension):/.test(x.url)) || list.find((x) => x.type === 'page');
    const ws = new WebSocket(t.webSocketDebuggerUrl);
    await new Promise((res, rej) => {
      ws.addEventListener('open', res);
      ws.addEventListener('error', () => rej(new Error('websocket failed')));
    });
    const page = new Page(ws);
    await page.init({ keepStorage: this.keepStorage });
    return page;
  }
  async version() {
    return (await (await fetch(`http://127.0.0.1:${this.port}/json/version`)).json()).Browser;
  }
  async close() {
    const exited = new Promise((r) => this.proc.once('exit', r));
    try {
      const v = await (await fetch(`http://127.0.0.1:${this.port}/json/version`)).json();
      const ws = new WebSocket(v.webSocketDebuggerUrl);
      await new Promise((res) => ws.addEventListener('open', res));
      ws.send(JSON.stringify({ id: 1, method: 'Browser.close' }));
    } catch {
      /* already gone */
    }
    const done = await Promise.race([exited.then(() => true), sleep(5000).then(() => false)]);
    if (!done && this.proc.pid) spawnSync('taskkill', ['/PID', String(this.proc.pid), '/T', '/F'], { stdio: 'ignore' });
    await sleep(300);
    if (this.ownProfile) rmSync(this.profile, { recursive: true, force: true, maxRetries: 5 });
  }
}

/**
 * @param {{headless?:boolean, args?:string[], profile?:string, width?:number, height?:number, lang?:string, keepStorage?:boolean}} o
 * With `profile` given, the same profile directory is reused (and kept) so the browser can be closed and relaunched on it.
 */
export async function launch(o = {}) {
  const exe = findBrowser();
  const port = await freePort(Number(process.env.LL_CDP_PORT) || 4184); // LL_CDP_PORT: where to start looking for a free debugging port (two runs in parallel)
  const ownProfile = !o.profile;
  const profile = o.profile || mkdtempSync(join(process.env.LL_TMP || tmpdir(), 'lullaby-chrome-'));
  const args = [
    `--remote-debugging-port=${port}`, '--remote-debugging-address=127.0.0.1', '--remote-allow-origins=*', `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-background-networking', '--mute-audio',
    `--window-size=${o.width || 1280},${o.height || 720}`,
    ...(o.headless === false ? [] : ['--headless=new']),
    ...(o.lang ? [`--lang=${o.lang}`] : []),
    ...(o.args || []),
    'about:blank',
  ];
  const proc = spawn(exe, args, { stdio: 'ignore', windowsHide: false });
  const b = new Browser(proc, port, profile, ownProfile, !!o.keepStorage);
  for (let i = 0; i < 100; i++) {
    try {
      await fetch(`http://127.0.0.1:${port}/json/version`);
      return b;
    } catch {
      await sleep(100);
    }
  }
  await b.close();
  throw new Error('browser did not start');
}
