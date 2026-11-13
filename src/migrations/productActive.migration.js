import { Product } from '../models/index.js';

/** Existing products had no isActive field — treat them as active. */
export async function backfillProductActive() {
  const r = await Product.collection.updateMany({ isActive: { $exists: false } }, { $set: { isActive: true } });
  if (r.modifiedCount) console.log(`Product active flag: ${r.modifiedCount} products set to active`);
}
