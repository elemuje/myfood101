import { body, fail, HttpError, json, requireOrigin } from '../server/common.js';
import { requireAdmin } from '../server/auth.js';
import { readCatalog, saveCatalog } from '../server/catalog.js';

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const catalog = await readCatalog();
      json(res, 200, catalog);
      return;
    }
    if (req.method !== 'PUT') { res.setHeader('Allow', 'GET, PUT'); throw new HttpError(405, 'Method not allowed.'); }
    requireOrigin(req); requireAdmin(req);
    json(res, 200, await saveCatalog(body(req)));
  } catch (error) { fail(res, error); }
}
