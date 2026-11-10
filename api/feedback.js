import { body, fail, HttpError, json, requireOrigin } from '../server/common.js';
import { sendFeedback, validateFeedback } from '../server/feedback.js';

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); throw new HttpError(405, 'Method not allowed.'); }
    requireOrigin(req);
    const value = body(req);
    if (value.website) throw new HttpError(400, 'We could not accept this submission.');
    json(res, 200, await sendFeedback(validateFeedback(value)));
  } catch (error) { fail(res, error); }
}
