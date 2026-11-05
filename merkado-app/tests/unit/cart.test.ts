import { describe, expect, it } from 'vitest';
import { addOne, setQty, cartTotal, cartUnits, type Cart } from '../../src/lib/cart';
import type { Product } from '../../src/lib/db';

const products: Product[] = [
  { product_id: 1, product: 'Kape', unit: 'pc', pack_multiplier: 1, price: 8, sort_order: 1, active: true },
  { product_id: 2, product: 'Tinapay', unit: 'pc', pack_multiplier: 1, price: 12.5, sort_order: 2, active: true },
  { product_id: 3, product: 'Walang presyo', unit: 'pc', pack_multiplier: 1, price: null, sort_order: 3, active: true },
];

describe('cart', () => {
  it('addOne increments quantity immutably', () => {
    const c0: Cart = {};
    const c1 = addOne(c0, 1);
    const c2 = addOne(c1, 1);
    expect(c2[1]).toBe(2);
    expect(c0).toEqual({}); // original untouched
  });

  it('setQty sets a quantity', () => {
    const c = setQty({}, 2, 5);
    expect(c[2]).toBe(5);
  });

  it('setQty with 0 removes the line', () => {
    const c = setQty({ 1: 3, 2: 1 }, 1, 0);
    expect(c).toEqual({ 2: 1 });
  });

  it('setQty with a negative quantity removes the line', () => {
    const c = setQty({ 1: 3 }, 1, -2);
    expect(c[1]).toBeUndefined();
  });

  it('cartTotal sums price * qty, treating null-priced items as 0', () => {
    const cart: Cart = { 1: 2, 2: 2, 3: 5 };
    // 8*2 + 12.5*2 = 41; product 3 has no price -> contributes 0
    expect(cartTotal(cart, products)).toBe(41);
  });

  it('cartUnits sums all quantities', () => {
    expect(cartUnits({ 1: 2, 2: 3 })).toBe(5);
    expect(cartUnits({})).toBe(0);
  });
});
