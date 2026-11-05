import { Minus, Plus, Trash2 } from 'lucide-react';
import type { Cart } from '../lib/cart';
import type { Product } from '../lib/db';
import ui from '../styles/ui.module.css';
import { formatPeso } from './format';
import styles from './CartList.module.css';

interface CartListProps {
  cart: Cart;
  products: Product[];
  onChange: (productId: number, qty: number) => void;
  onEditQty: (product: Product) => void;
}

export function CartList({ cart, products, onChange, onEditQty }: CartListProps) {
  const lines = products.filter((p) => (cart[p.product_id] ?? 0) > 0);

  if (lines.length === 0) {
    return <p className={ui.empty}>Pindutin ang produkto para idagdag.</p>;
  }

  return (
    <ul className={styles.list} aria-label="Listahan ng benta">
      {lines.map((p) => {
        const qty = cart[p.product_id];
        const lineTotal = p.price === null ? null : p.price * qty;
        return (
          <li key={p.product_id} className={styles.line}>
            <div className={styles.info}>
              <span className={styles.name}>{p.product}</span>
              <span className={`${ui.muted} tabular`}>
                {p.price === null ? 'Walang presyo' : `${formatPeso(p.price)} × ${qty}`}
              </span>
            </div>
            <div className={styles.stepper}>
              <button
                type="button"
                className={`${ui.btn} ${ui.secondary} ${ui.iconBtn}`}
                aria-label={qty === 1 ? `Alisin ang ${p.product}` : `Bawasan ang ${p.product}`}
                onClick={() => onChange(p.product_id, qty - 1)}
              >
                {qty === 1 ? <Trash2 size={20} aria-hidden /> : <Minus size={20} aria-hidden />}
              </button>
              <button
                type="button"
                className={`${styles.qty} tabular`}
                aria-label={`Dami ng ${p.product}: ${qty}. Pindutin para palitan.`}
                onClick={() => onEditQty(p)}
              >
                {qty}
              </button>
              <button
                type="button"
                className={`${ui.btn} ${ui.secondary} ${ui.iconBtn}`}
                aria-label={`Dagdagan ang ${p.product}`}
                onClick={() => onChange(p.product_id, qty + 1)}
              >
                <Plus size={20} aria-hidden />
              </button>
            </div>
            <span className={`${styles.total} tabular`}>{lineTotal === null ? '' : formatPeso(lineTotal)}</span>
          </li>
        );
      })}
    </ul>
  );
}
