import { createServer } from 'node:http';
import { readFileSync, statSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveMedia } from './media.mjs';

const PUBLIC_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'public');
const STATIC_TYPES = new Map([['.html', 'text/html; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'], ['.css', 'text/css; charset=utf-8']]);

function sendJson(res, status, body) {
  const bytes = Buffer.from(JSON.stringify(body));
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': bytes.length, 'Cache-Control': 'no-store' });
  res.end(bytes);
}

async function readJson(req, limit = 128 * 1024) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > limit) throw new Error('Request body is too large');
    chunks.push(chunk);
  }
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
}

function isAuthorized(req, url, token) {
  const header = req.headers.authorization;
  return header === `Bearer ${token}` || url.searchParams.get('token') === token;
}

export function createControlServer({ token, wallpapers, actions, host = '127.0.0.1', port = 34873 }) {
  const byId = new Map(wallpapers.map((item) => [item.id, item]));
  const server = createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://${host}:${port}`);
    try {
      if (req.method === 'GET' && url.pathname === '/health') { sendJson(res, 200, { ok: true }); return; }
      if (url.pathname === '/' || url.pathname === '/ui' || url.pathname === '/ui/') {
        res.writeHead(302, { Location: `/index.html?token=${encodeURIComponent(token)}` }).end();
        return;
      }
      if (['/index.html', '/app.js', '/styles.css'].includes(url.pathname)) {
        const file = join(PUBLIC_ROOT, url.pathname.slice(1));
        const bytes = readFileSync(file);
        res.writeHead(200, { 'Content-Type': STATIC_TYPES.get(extname(file)), 'Content-Length': bytes.length, 'Cache-Control': 'no-store' });
        res.end(bytes);
        return;
      }
      if (!isAuthorized(req, url, token)) { sendJson(res, 401, { error: 'Unauthorized' }); return; }
      if (url.pathname.startsWith('/media/')) {
        const id = decodeURIComponent(url.pathname.slice('/media/'.length));
        const project = byId.get(id);
        if (!project?.playablePath) { res.writeHead(404).end('Not found'); return; }
        serveMedia(req, res, project.playablePath);
        return;
      }
      if (req.method === 'GET' && url.pathname === '/api/status') { sendJson(res, 200, await actions.status()); return; }
      if (req.method === 'GET' && url.pathname === '/api/wallpapers') {
        sendJson(res, 200, wallpapers.map(({ projectRoot, filePath, previewPath, playablePath, ...safe }) => safe));
        return;
      }
      if (req.method === 'POST' && url.pathname === '/api/apply') {
        const body = await readJson(req);
        sendJson(res, 200, await actions.apply(String(body.id || ''), body.settings || {}));
        return;
      }
      if (req.method === 'POST' && url.pathname === '/api/settings') { sendJson(res, 200, await actions.settings(await readJson(req))); return; }
      if (req.method === 'POST' && url.pathname === '/api/pause') { sendJson(res, 200, await actions.pause()); return; }
      if (req.method === 'POST' && url.pathname === '/api/resume') { sendJson(res, 200, await actions.resume()); return; }
      if (req.method === 'POST' && url.pathname === '/api/remove') { sendJson(res, 200, await actions.remove()); return; }
      sendJson(res, 404, { error: 'Not found' });
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
    }
  });
  return {
    server,
    listen: () => new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, host, () => { server.off('error', reject); resolve(server.address()); });
    }),
    close: () => new Promise((resolve) => server.close(resolve)),
    mediaUrl(id, version = 0) {
      if (!byId.has(id)) throw new Error(`Unknown wallpaper: ${id}`);
      return `http://${host}:${port}/media/${encodeURIComponent(id)}?token=${encodeURIComponent(token)}&v=${version}`;
    },
  };
}
