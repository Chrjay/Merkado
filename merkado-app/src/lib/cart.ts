import type { Product } from './db';

/** Cart is a plain map of product_id -> quantity. Lives in React state. */
export type Cart = Record<number, number>;

/** Add one unit of a product, returning a new cart. */
export function addOne(cart: Cart, productId: number): Cart {
  return { ...cart, [productId]: (cart[productId] ?? 0) + 1 };
}

/** Set a product's quantity. A quantity of 0 (or less) removes the line. */
export function setQty(cart: Cart, productId: number, qty: number): Cart {
  const next = { ...cart };
  if (qty <= 0) {
    delete next[productId];
  } else {
    next[productId] = qty;
  }
  return next;
}

/** Total peso value. Products without a price contribute 0. */
export function cartTotal(cart: Cart, products: Product[]): number {
  const priceOf = new Map(products.map((p) => [p.product_id, p.price]));
  let total = 0;
  for (const [id, qty] of Object.entries(cart)) {
    const price = priceOf.get(Number(id));
    if (price != null) total += price * qty;
  }
  return total;
}

/** Total number of units across all lines. */
export function cartUnits(cart: Cart): number {
  let units = 0;
  for (const qty of Object.values(cart)) units += qty;
  return units;
}
