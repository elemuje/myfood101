import { body, fail, HttpError, json, requireOrigin, textField } from '../server/common.js';
import { authenticated, checkLogin, clearCookie, configured, sessionCookie } from '../server/auth.js';

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') return json(res, 200, { authenticated: authenticated(req), configured: configured() });
    if (req.method === 'DELETE') { requireOrigin(req); res.setHeader('Set-Cookie', clearCookie()); return json(res, 200, { ok: true }); }
    if (req.method !== 'POST') { res.setHeader('Allow', 'GET, POST, DELETE'); throw new HttpError(405, 'Method not allowed.'); }
    requireOrigin(req);
    const value = body(req, 2000);
    checkLogin(req, textField(value.username, 100, 'Username', true), textField(value.password, 256, 'Password', true));
    res.setHeader('Set-Cookie', sessionCookie());
    return json(res, 200, { authenticated: true });
  } catch (error) { fail(res, error); }
}
