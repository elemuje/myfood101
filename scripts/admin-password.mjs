import { randomBytes, scryptSync } from 'node:crypto';
import { writeFileSync } from 'node:fs';

const password = randomBytes(18).toString('base64url');
const salt = randomBytes(16).toString('hex');
const settings = {
  username: 'food101', password,
  ADMIN_PASSWORD_HASH: salt + ':' + scryptSync(password, salt, 64).toString('hex'),
  ADMIN_SESSION_SECRET: randomBytes(48).toString('base64url'),
  FEEDBACK_BRIDGE_SECRET: randomBytes(48).toString('base64url')
};
const output = process.argv[2];
if (!output) { console.error('Pass a private output file path: node scripts/admin-password.mjs /path/to/credentials.json'); process.exit(1); }
writeFileSync(output, JSON.stringify(settings, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
console.log('Admin credentials saved to your private output file. Keep this file out of Git.');
