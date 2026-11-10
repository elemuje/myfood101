import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { scryptSync } from 'node:crypto';
import session from '../api/session.js';
import products from '../api/products.js';
import feedback from '../api/feedback.js';
import { validateProducts } from '../server/catalog.js';
import { validateImage } from '../server/common.js';

const seed = JSON.parse(await readFile(new URL('../data/products.json', import.meta.url), 'utf8'));
process.env.SITE_ORIGIN = 'http://localhost:3000';
process.env.ADMIN_USERNAME = 'food101';
const salt = '0123456789abcdef0123456789abcdef';
process.env.ADMIN_PASSWORD_HASH = salt + ':' + scryptSync('test-password', salt, 64).toString('hex');
process.env.ADMIN_SESSION_SECRET = 'test-session-secret-with-at-least-32-characters';
process.env.FEEDBACK_BRIDGE_URL = 'https://script.google.com/macros/s/test/exec';
process.env.FEEDBACK_BRIDGE_SECRET = 'test-bridge-secret-with-at-least-32-characters';
function req(method, value, extra = {}) { return { method, body: value, headers: { origin: 'http://localhost:3000', 'content-type': 'application/json', ...extra } }; }
async function call(handler, request) {
  const res = { headers: {}, statusCode: 0, setHeader(key, value) { this.headers[key.toLowerCase()] = value; }, end(value) { this.value = JSON.parse(value); } };
  await handler(request, res); return res;
}
async function login() {
  const res = await call(session, req('POST', { username: 'food101', password: 'test-password' }));
  assert.equal(res.statusCode, 200); return res.headers['set-cookie'].split(';')[0];
}
test('sign-in rejects invalid credentials and foreign origins; session is signed and HttpOnly', async () => {
  assert.equal((await call(session, req('POST', { username: 'food101', password: 'wrong' }))).statusCode, 401);
  assert.equal((await call(session, req('POST', { username: 'food101', password: 'test-password' }, { origin: 'https://attacker.example' }))).statusCode, 403);
  const cookie = await login();
  assert.equal((await call(session, req('GET', null, { cookie }))).value.authenticated, true);
  assert.equal((await call(session, req('GET', null, { cookie: cookie + 'x' }))).value.authenticated, false);
  const res = await call(session, req('POST', { username: 'food101', password: 'test-password' }));
  assert.match(res.headers['set-cookie'], /HttpOnly; SameSite=Strict/);
});
test('catalog writes require authentication and prevent stale overwrites', async () => {
  const unauth = await call(products, req('PUT', { products: seed.products, revision: 'old' }));
  assert.equal(unauth.statusCode, 401);
  const cookie = await login(); const headers = { cookie, 'x-food101-admin': '1' };
  const original = globalThis.fetch; let saved;
  globalThis.fetch = async (_url, options) => {
    const value = JSON.parse(options.body);
    if (value.action === 'catalog.get') return Response.json({ ok: true, products: seed.products, revision: 'current' });
    if (value.revision !== 'current') return Response.json({ ok: false, code: 'conflict' });
    saved = value; return Response.json({ ok: true, products: value.products, revision: 'new' });
  };
  try {
    assert.equal((await call(products, req('PUT', { products: seed.products, revision: 'old' }, headers))).statusCode, 409);
    assert.equal(saved, undefined);
    const list = structuredClone(seed.products); list[0].price = 3456; list[0].name = '<img src=x onerror=alert(1)>';
    const res = await call(products, req('PUT', { products: list, revision: 'current' }, headers));
    assert.equal(res.statusCode, 200); assert.equal(res.value.products[0].price, 3456); assert.equal(saved.revision, 'current');
    assert.equal(saved.products[0].name, list[0].name);
  } finally { globalThis.fetch = original; }
});
test('product validation rejects unsafe prices, duplicate IDs and executable picture URLs', () => {
  for (const patch of [{price:-1},{price:'3000'},{price:Infinity},{img:'javascript:alert(1)'},{cat:'all'}]) {
    const list = structuredClone(seed.products); Object.assign(list[0], patch); assert.throws(() => validateProducts(list));
  }
  assert.throws(() => validateProducts([seed.products[0], seed.products[0]]));
  assert.throws(() => validateImage({ mime: 'image/jpeg', data: Buffer.from('<svg onload="alert(1)">').toString('base64') }));
  assert.deepEqual(validateProducts([]), []);
});
test('feedback only reports success after bridge confirmation; keeps retry reference and forwards photos', async () => {
  const value = { id: '12345678-1234-1234-1234-123456789abc', type: 'Make a complaint', customer: 'Yes', topic: 'Food quality', message: 'Website integration test', phone: '', pictures: [] };
  const original = globalThis.fetch; let received;
  globalThis.fetch = async (_url, options) => { received = JSON.parse(options.body); return Response.json({ ok: true, id: value.id }); };
  try {
    const res = await call(feedback, req('POST', value)); assert.equal(res.statusCode, 200); assert.equal(res.value.id, value.id);
    assert.equal(received.secret, process.env.FEEDBACK_BRIDGE_SECRET);
    const photo = { mime: 'image/jpeg', data: Buffer.from([255,216,255,224,1,2,3]).toString('base64') };
    assert.equal((await call(feedback, req('POST', {...value, pictures: [photo]}))).statusCode, 200);
    assert.equal(received.pictures[0].mime, 'image/jpeg');
    globalThis.fetch = async () => Response.json({ ok: false, code: 'save_failed' });
    const failed = await call(feedback, req('POST', value)); assert.equal(failed.statusCode, 502); assert.equal(failed.value.ok, undefined);
    assert.equal((await call(feedback, req('POST', {...value, message: ''}))).statusCode, 400);
    assert.equal((await call(feedback, req('POST', {...value, website: 'spam'}))).statusCode, 400);
  } finally { globalThis.fetch = original; }
});
