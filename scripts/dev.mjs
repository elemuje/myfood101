import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, extname } from 'node:path';
import { createHash, scryptSync } from 'node:crypto';
import session from '../api/session.js';
import products from '../api/products.js';
import feedback from '../api/feedback.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const demo = process.argv.includes('--demo');
if (demo) {
  const seed = JSON.parse(await readFile(resolve(root, 'data/products.json'), 'utf8'));
  let current = seed;
  const revision = value => createHash('sha1').update(JSON.stringify(value)).digest('hex');
  process.env.SITE_ORIGIN = 'http://localhost:3000'; process.env.ADMIN_USERNAME = 'food101';
  const salt = '0123456789abcdef0123456789abcdef';
  process.env.ADMIN_PASSWORD_HASH = salt + ':' + scryptSync('Local-demo-101!', salt, 64).toString('hex');
  process.env.ADMIN_SESSION_SECRET = 'food101-local-demo-secret-do-not-deploy';
  process.env.FEEDBACK_BRIDGE_URL = 'https://script.google.com/macros/s/local-demo/exec';
  process.env.FEEDBACK_BRIDGE_SECRET = 'food101-local-demo-feedback-secret';
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    if (String(url) === process.env.FEEDBACK_BRIDGE_URL) {
      const value = JSON.parse(options.body);
      if (value.action === 'catalog.get') return Response.json({ ok: true, products: current.products, revision: revision(current.products) });
      if (value.action === 'catalog.save') {
        if (value.revision !== revision(current.products)) return Response.json({ ok: false, code: 'conflict' });
        current.products = value.products;
        return Response.json({ ok: true, products: current.products, revision: revision(current.products) });
      }
      return Response.json({ ok: true, id: value.id });
    }
    return originalFetch(url, options);
  };
}
const routes = { '/api/session': session, '/api/products': products, '/api/feedback': feedback };
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost:3000');
    if (routes[url.pathname]) {
      const chunks = []; let size = 0;
      for await (const chunk of req) { size += chunk.length; if (size > 4_200_000) { res.writeHead(413); res.end('Too large'); return; } chunks.push(chunk); }
      req.body = Buffer.concat(chunks).toString('utf8');
      await routes[url.pathname](req, res); return;
    }
    let path = decodeURIComponent(url.pathname);
    if (path === '/') path = '/index.html'; if (path === '/admin') path = '/admin.html';
    if (!/^\/(index\.html|admin\.html|assets\/[^.][^\\]*|images\/[^.][^\\]*|data\/products\.json)$/.test(path) || path.includes('..')) { res.writeHead(404); res.end('Not found'); return; }
    const file = resolve(root, '.' + path);
    if (!(await stat(file)).isFile()) throw new Error('Not found');
    res.setHeader('Content-Type', (types[extname(file)] || 'application/octet-stream') + (['.html','.js','.css','.json'].includes(extname(file)) ? '; charset=utf-8' : ''));
    res.setHeader('Cache-Control', 'no-store');
    res.end(await readFile(file));
  } catch (error) { res.writeHead(404); res.end('Not found'); }
}).listen(3000, '127.0.0.1', () => console.log(`Food 101: http://localhost:3000${demo ? ' (local demo; no live Google or GitHub writes)' : ''}`));
