import { createHash, timingSafeEqual } from 'node:crypto';

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export function json(res, status, value) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.statusCode = status;
  res.end(JSON.stringify(value));
}
export function fail(res, error) {
  if (!(error instanceof HttpError)) console.error('Food101 API error:', error.message);
  json(res, error.status || 500, { error: error instanceof HttpError ? error.message : 'Something went wrong. Please try again.' });
}
export function equalSecret(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const hash = value => createHash('sha256').update(value).digest();
  return timingSafeEqual(hash(a), hash(b));
}
export function body(req, maxBytes = 4_200_000) {
  if (!req.headers['content-type']?.startsWith('application/json')) throw new HttpError(415, 'Please send JSON.');
  let value = req.body;
  if (Buffer.isBuffer(value)) value = value.toString('utf8');
  if (typeof value === 'string') {
    if (Buffer.byteLength(value) > maxBytes) throw new HttpError(413, 'The upload is too large.');
    try { value = JSON.parse(value); } catch { throw new HttpError(400, 'Invalid request.'); }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new HttpError(400, 'Invalid request.');
  if (Buffer.byteLength(JSON.stringify(value)) > maxBytes) throw new HttpError(413, 'The upload is too large.');
  return value;
}
export function requireOrigin(req) {
  const allowed = [process.env.SITE_ORIGIN, process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}`,
    process.env.VERCEL_BRANCH_URL && `https://${process.env.VERCEL_BRANCH_URL}`].filter(Boolean);
  if (!process.env.VERCEL) allowed.push('http://localhost:3000', 'http://127.0.0.1:3000');
  if (!allowed.includes(req.headers.origin)) throw new HttpError(403, 'This request is not allowed.');
}
export function textField(value, max, label, required = false) {
  if (typeof value !== 'string') throw new HttpError(400, `${label} is invalid.`);
  const cleaned = value.trim();
  if (cleaned.length > max || (required && !cleaned)) throw new HttpError(400, `Please check ${label.toLowerCase()}.`);
  return cleaned;
}
export function validateImage(image, maxBytes = 1_000_000) {
  if (!image || typeof image.data !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(image.data)) throw new HttpError(400, 'Invalid picture.');
  const buffer = Buffer.from(image.data, 'base64');
  if (!buffer.length || buffer.length > maxBytes) throw new HttpError(413, 'The picture is too large.');
  let extension;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) extension = 'jpg';
  else if (buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) extension = 'png';
  else if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') extension = 'webp';
  else throw new HttpError(400, 'Use a JPEG, PNG or WebP picture.');
  const mime = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }[extension];
  if (image.mime !== mime) throw new HttpError(400, 'The picture type does not match its contents.');
  return { data: buffer.toString('base64'), mime, extension, size: buffer.length };
}
