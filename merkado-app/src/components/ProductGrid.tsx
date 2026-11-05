import type { Cart } from '../lib/cart';
import type { Product } from '../lib/db';
import { ProductButton } from './ProductButton';
import styles from './ProductGrid.module.css';

interface ProductGridProps {
  products: Product[];
  cart: Cart;
  onTap: (product: Product) => void;
  onLongPress: (product: Product) => void;
}

export function ProductGrid({ products, cart, onTap, onLongPress }: ProductGridProps) {
  return (
    <>
      <p id="grid-help" className="visually-hidden">
        Pindutin para magdagdag ng isa. Pindutin nang matagal para mag-type ng dami.
      </p>
      <ul className={styles.grid} aria-label="Mga produkto">
        {products.map((p) => (
          <li key={p.product_id}>
            <ProductButton product={p} qty={cart[p.product_id] ?? 0} onTap={onTap} onLongPress={onLongPress} />
          </li>
        ))}
      </ul>
    </>
  );
}
