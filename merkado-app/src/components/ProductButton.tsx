import { useRef } from 'react';
import type { Product } from '../lib/db';
import { formatPeso } from './format';
import styles from './ProductGrid.module.css';

const LONG_PRESS_MS = 500;
const MOVE_TOLERANCE_PX = 10;

interface ProductButtonProps {
  product: Product;
  qty: number;
  onTap: (product: Product) => void;
  onLongPress: (product: Product) => void;
}

export function ProductButton({ product, qty, onTap, onLongPress }: ProductButtonProps) {
  const timer = useRef<number | undefined>(undefined);
  const start = useRef<{ x: number; y: number } | null>(null);
  const longPressed = useRef(false);

  function cancel() {
    window.clearTimeout(timer.current);
    start.current = null;
  }

  return (
    <button
      type="button"
      className={styles.product}
      data-selected={qty > 0}
      aria-label={`${product.product}, ${product.unit}${qty > 0 ? `, ${qty} sa listahan` : ''}`}
      aria-describedby="grid-help"
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        longPressed.current = false;
        start.current = { x: e.clientX, y: e.clientY };
        timer.current = window.setTimeout(() => {
          longPressed.current = true;
          navigator.vibrate?.(15);
          onLongPress(product);
        }, LONG_PRESS_MS);
      }}
      onPointerMove={(e) => {
        const s = start.current;
        if (s && Math.hypot(e.clientX - s.x, e.clientY - s.y) > MOVE_TOLERANCE_PX) cancel();
      }}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onContextMenu={(e) => e.preventDefault()}
      onClick={() => {
        if (longPressed.current) {
          longPressed.current = false;
          return;
        }
        onTap(product);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && e.shiftKey) {
          e.preventDefault();
          onLongPress(product);
        }
      }}
    >
      <span className={styles.name}>{product.product}</span>
      <span className={styles.foot}>
        <span className={styles.meta}>
          <span className={styles.unit}>{product.unit}</span>
          <span className={`${styles.price} tabular`}>
            {product.price === null ? 'Walang presyo' : formatPeso(product.price)}
          </span>
        </span>
        {qty > 0 && (
          <span className={`${styles.badge} tabular`} aria-hidden>
            {qty}
          </span>
        )}
      </span>
    </button>
  );
}
