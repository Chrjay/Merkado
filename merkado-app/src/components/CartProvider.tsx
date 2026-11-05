import { useMemo, useState, type ReactNode } from 'react';
import type { Cart } from '../lib/cart';
import { CartContext } from './cartContext';

/** The cart lives above the screens so the update banner can wait until it is empty. */
export function CartProvider({ children }: { children: ReactNode }) {
  const [cart, setCart] = useState<Cart>({});
  const value = useMemo(() => ({ cart, setCart, isEmpty: Object.keys(cart).length === 0 }), [cart]);
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}
