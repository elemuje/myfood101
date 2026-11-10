import { HttpError, textField, validateImage } from './common.js';

export const feedbackTypes = ['Give feedback', 'Make a complaint', 'Request support or assistance', 'Make a suggestion', 'Appreciate our service'];
export function validateFeedback(value) {
  if (!/^[a-f0-9-]{36}$/i.test(value.id || '')) throw new HttpError(400, 'Invalid submission ID.');
  if (!feedbackTypes.includes(value.type)) throw new HttpError(400, 'Choose the type of feedback.');
  if (!['Yes', 'No'].includes(value.customer)) throw new HttpError(400, 'Tell us whether you have ordered before.');
  const topic = textField(value.topic, 200, 'Enquiry topic');
  const message = textField(value.message, 5000, 'Message', true);
  const phone = textField(value.phone, 40, 'WhatsApp contact');
  if (phone && !/^[+\d\s()-]{5,40}$/.test(phone)) throw new HttpError(400, 'Please check your WhatsApp number.');
  if (!Array.isArray(value.pictures) || value.pictures.length > 5) throw new HttpError(400, 'You can attach up to five pictures.');
  const pictures = value.pictures.map(p => validateImage(p, 600_000));
  if (pictures.reduce((n, p) => n + p.size, 0) > 3_000_000) throw new HttpError(413, 'Your pictures are too large. Please choose fewer pictures.');
  return { id: value.id, type: value.type, customer: value.customer, topic, message, phone, pictures };
}
export async function callBridge(value) {
  const url = process.env.FEEDBACK_BRIDGE_URL;
  const secret = process.env.FEEDBACK_BRIDGE_SECRET;
  if (!url || !/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url) || !secret || secret.length < 32) throw new HttpError(503, 'The Food 101 data service is being connected. Please contact us on WhatsApp for now.');
  let response;
  try {
    response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...value, secret }), redirect: 'follow', signal: AbortSignal.timeout(50_000) });
  } catch (error) {
    console.error('Food101 feedback bridge:', error.message);
    throw new HttpError(502, 'We could not confirm your feedback was saved. Try again; your submission reference will stay the same.');
  }
  let result;
  try { result = await response.json(); } catch { throw new HttpError(502, 'We could not confirm your feedback was saved. Please try again.'); }
  if (result.code === 'conflict') throw new HttpError(409, 'The menu changed while you were editing. Reload the products before saving again.');
  if (!response.ok || !result.ok || (value.id && result.id !== value.id)) {
    console.error('Food101 feedback bridge rejected submission:', result.code || response.status);
    throw new HttpError(502, 'We could not save your feedback. Please try again or contact us on WhatsApp.');
  }
  return result;
}
export async function sendFeedback(value) {
  await callBridge({ ...value, action: 'feedback.submit' });
  return { ok: true, id: value.id };
}
