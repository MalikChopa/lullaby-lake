// Static dev server: node:http, 127.0.0.1 only, gzip like GitHub Pages. No dependency.
// Usage: node tools/serve.mjs [port]      (default 4183, or the next free one)
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT_DEFAULT = resolve(fileURLToPath(new URL('..', import.meta.url)));
// ports that browsers or Node's fetch refuse
const BAD_PORTS = new Set([4190, 5060, 5061, 6000, 6566, 6665, 6666, 6667, 6668, 6669, 6697]);
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
};
const COMPRESSIBLE = new Set(['.html', '.js', '.mjs', '.css', '.json', '.svg', '.txt']);

export function createServer(root = ROOT_DEFAULT) {
  const gzCache = new Map(); // path -> { mtimeMs, buf }
  return http.createServer(async (req, res) => {
    try {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405).end();
        return;
      }
      const url = new URL(req.url, 'http://127.0.0.1');
      let rel = decodeURIComponent(url.pathname);
      if (rel.endsWith('/')) rel += 'index.html';
      const file = normalize(join(root, rel));
      if (file !== root && !file.startsWith(root + sep)) {
        res.writeHead(403).end('forbidden');
        return;
      }
      // only the site: never the repository internals
      const top = file.slice(root.length + 1).split(sep)[0];
      if (['.git', 'node_modules', 'test-results', 'docs', 'maquette'].includes(top)) {
        res.writeHead(404).end('not found');
        return;
      }
      const st = await stat(file).catch(() => null);
      if (!st || !st.isFile()) {
        res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
        return;
      }
      const ext = extname(file).toLowerCase();
      const headers = { 'content-type': TYPES[ext] || 'application/octet-stream', 'cache-control': 'no-cache', vary: 'accept-encoding' };
      const wantsGzip = /\bgzip\b/.test(req.headers['accept-encoding'] || '') && COMPRESSIBLE.has(ext);
      if (wantsGzip) {
        let c = gzCache.get(file);
        if (!c || c.mtimeMs !== st.mtimeMs) {
          c = { mtimeMs: st.mtimeMs, buf: gzipSync(await readFile(file), { level: 9 }) };
          gzCache.set(file, c);
        }
        headers['content-encoding'] = 'gzip';
        headers['content-length'] = c.buf.length;
        res.writeHead(200, headers);
        res.end(req.method === 'HEAD' ? undefined : c.buf);
      } else {
        headers['content-length'] = st.size;
        res.writeHead(200, headers);
        if (req.method === 'HEAD') res.end();
        else createReadStream(file).pipe(res);
      }
    } catch (e) {
      res.writeHead(500).end('error');
    }
  });
}

/** Listens on 127.0.0.1 on the first free port >= start (skipping refused ports). Resolves { server, port }. */
export async function listen(server, start = 4183) {
  for (let port = start; port < start + 60; port++) {
    if (BAD_PORTS.has(port)) continue;
    const ok = await new Promise((resolveOk) => {
      const onErr = () => resolveOk(false);
      server.once('error', onErr);
      server.listen(port, '127.0.0.1', () => {
        server.off('error', onErr);
        resolveOk(true);
      });
    });
    if (ok) return { server, port };
  }
  throw new Error('no free port found');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const start = Number(process.argv[2]) || 4183;
  const { server, port } = await listen(createServer(), start);
  console.log(`Lullaby Lake: http://127.0.0.1:${port}/   (Ctrl+C to stop)`);
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => server.close(() => process.exit(0)));
}
