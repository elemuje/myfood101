import { createHmac, randomBytes, scryptSync } from 'node:crypto';
import { equalSecret, HttpError } from './common.js';

const COOKIE = 'food101_admin';
const MAX_AGE = 8 * 60 * 60;
const attempts = new Map();
export function configured() {
  return Boolean(process.env.ADMIN_PASSWORD_HASH && process.env.ADMIN_SESSION_SECRET?.length >= 32);
}
export function checkLogin(req, username, password) {
  if (!configured()) throw new HttpError(503, 'Admin sign-in has not been configured yet.');
  const ip = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
  const now = Date.now();
  for (const [key, item] of attempts) if (item.until < now) attempts.delete(key);
  const item = attempts.get(ip) || { count: 0, until: now + 600_000 };
  if (item.count >= 10) throw new HttpError(429, 'Too many attempts. Please try again in 10 minutes.');
  const [salt, expected] = process.env.ADMIN_PASSWORD_HASH.split(':');
  if (!/^[a-f0-9]{32}$/.test(salt || '') || !/^[a-f0-9]{128}$/.test(expected || '')) throw new HttpError(503, 'Admin sign-in needs configuration.');
  const actual = scryptSync(password, salt, 64).toString('hex');
  if (!equalSecret(actual, expected) || !equalSecret(username, process.env.ADMIN_USERNAME || 'food101')) {
    item.count += 1; attempts.set(ip, item);
    throw new HttpError(401, 'The username or password is incorrect.');
  }
  attempts.delete(ip);
}
function sign(value) { return createHmac('sha256', process.env.ADMIN_SESSION_SECRET).update(value).digest('base64url'); }
export function sessionCookie() {
  const payload = Buffer.from(JSON.stringify({ expires: Date.now() + MAX_AGE * 1000, nonce: randomBytes(16).toString('hex') })).toString('base64url');
  return `${COOKIE}=${payload}.${sign(payload)}; HttpOnly; SameSite=Strict; Path=/api; Max-Age=${MAX_AGE}${process.env.VERCEL || process.env.SITE_ORIGIN?.startsWith('https:') ? '; Secure' : ''}`;
}
export function clearCookie() { return `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/api; Max-Age=0${process.env.VERCEL || process.env.SITE_ORIGIN?.startsWith('https:') ? '; Secure' : ''}`; }
export function authenticated(req) {
  if (!configured()) return false;
  const cookie = (req.headers.cookie || '').split(';').map(c => c.trim()).find(c => c.startsWith(`${COOKIE}=`));
  if (!cookie) return false;
  try {
    const [payload, signature, extra] = cookie.substring(COOKIE.length + 1).split('.');
    if (extra || !equalSecret(signature, sign(payload))) return false;
    const value = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return Number.isFinite(value.expires) && value.expires > Date.now();
  } catch { return false; }
}
export function requireAdmin(req) {
  if (!authenticated(req)) throw new HttpError(401, 'Please sign in again.');
  if (req.headers['x-food101-admin'] !== '1') throw new HttpError(403, 'This request is not allowed.');
}
