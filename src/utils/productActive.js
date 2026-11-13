import { conflict } from './HttpError.js';

/** Catalog edits and stock receipts are allowed only while the product is inactive. */
export function requireProductInactive(product, action) {
  if (product.isActive !== false) {
    throw conflict(`Mark “${product.name || 'this product'}” inactive before you ${action}`);
  }
}

/** `PUT /api/products/:id` with only `{ isActive }` — always allowed so staff can deactivate first. */
export function isActiveOnlyProductUpdate(body) {
  if (!body || typeof body !== 'object') return false;
  const keys = Object.keys(body).filter((k) => {
    if (body[k] === undefined) return false;
    if (k === 'warrantyYears' && (body.warrantyYears === '' || body.warrantyYears == null)) return false;
    return true;
  });
  return keys.length === 1 && keys[0] === 'isActive';
}
