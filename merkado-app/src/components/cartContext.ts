import { createContext, useContext, type Dispatch, type SetStateAction } from 'react';
import type { Cart } from '../lib/cart';

export interface CartState {
  cart: Cart;
  setCart: Dispatch<SetStateAction<Cart>>;
  isEmpty: boolean;
}

export const CartContext = createContext<CartState | null>(null);

export function useCart(): CartState {
  const value = useContext(CartContext);
  if (!value) throw new Error('useCart must be used inside <CartProvider>');
  return value;
}
