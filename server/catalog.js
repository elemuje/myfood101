import { readFileSync } from 'node:fs';
import { HttpError, textField, validateImage } from './common.js';
import { callBridge } from './feedback.js';

const seed = JSON.parse(readFileSync(new URL('../data/products.json', import.meta.url), 'utf8'));
export const categories = seed.categories;
export function validateProducts(products) {
  if (!Array.isArray(products) || products.length > 300) throw new HttpError(400, 'The product list is invalid.');
  const ids = new Set();
  return products.map(p => {
    if (!p || !Number.isSafeInteger(p.id) || p.id < 1 || ids.has(p.id)) throw new HttpError(400, 'Each product must have a unique ID.');
    ids.add(p.id);
    if (typeof p.price !== 'number' || !Number.isFinite(p.price) || p.price <= 0 || p.price > 10_000_000 || Math.abs(p.price * 100 - Math.round(p.price * 100)) > 0.000001) throw new HttpError(400, 'Use a valid price greater than zero.');
    if (!categories.some(c => c.id !== 'all' && c.id === p.cat)) throw new HttpError(400, 'Choose a valid category.');
    const img = textField(p.img, 2000, 'Picture', true);
    if (!/^images\/[A-Za-z0-9_./ -]+$/.test(img) && !/^https:\/\/[^\s<>"']+$/.test(img)) throw new HttpError(400, 'Use an HTTPS picture URL or a local images path.');
    if (img.includes('..') || img.includes('\\')) throw new HttpError(400, 'Invalid picture path.');
    return { id: p.id, name: textField(p.name, 160, 'Product name', true), price: p.price, cat: p.cat, img, desc: textField(p.desc, 500, 'Description') };
  });
}
export async function readCatalog() {
  const result = await callBridge({ action: 'catalog.get', seed: seed.products });
  return { categories, products: validateProducts(result.products), revision: result.revision };
}
export async function saveCatalog(value) {
  const products = validateProducts(value.products);
  const revision = textField(value.revision, 64, 'Menu revision', true);
  let picture;
  if (value.picture) {
    if (!products.some(p => p.id === value.picture.productId)) throw new HttpError(400, 'The picture does not belong to a product.');
    picture = { ...validateImage(value.picture, 600_000), productId: value.picture.productId };
  }
  const result = await callBridge({ action: 'catalog.save', products, revision, ...(picture ? { picture } : {}) });
  return { categories, products: validateProducts(result.products), revision: result.revision };
}
