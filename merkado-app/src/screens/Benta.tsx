import { useState } from 'react';
import { Check } from 'lucide-react';
import { useProducts } from '../hooks/useProducts';
import { addOne, cartTotal, cartUnits, setQty } from '../lib/cart';
import type { Product } from '../lib/db';
import { saveSale } from '../lib/events';
import type { Payment } from '../types/events';
import { CartList } from '../components/CartList';
import { useCart } from '../components/cartContext';
import { formatPeso } from '../components/format';
import { PaymentButtons } from '../components/PaymentButtons';
import { ProductGrid } from '../components/ProductGrid';
import { QtyDialog } from '../components/QtyDialog';
import { useToast } from '../components/toastContext';
import ui from '../styles/ui.module.css';
import styles from './Benta.module.css';

export function Benta() {
  const { products } = useProducts();
  const { cart, setCart, isEmpty } = useCart();
  const toast = useToast();
  const [payment, setPayment] = useState<Payment | null>(null);
  const [editing, setEditing] = useState<Product | null>(null);
  const [saving, setSaving] = useState(false);

  const total = cartTotal(cart, products);
  const units = cartUnits(cart);
  const canSave = !isEmpty && payment !== null && !saving;

  async function save() {
    if (!canSave || payment === null) return;
    setSaving(true);
    try {
      await saveSale(cart, payment, products);
      setCart({});
      setPayment(null);
      navigator.vibrate?.(30);
      toast('Naitala na!');
    } catch (err) {
      toast(`Hindi na-save: ${err instanceof Error ? err.message : String(err)}`, 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={`${ui.screen} ${styles.screen}`}>
      <header className={ui.header}>
        <h1 className={ui.title}>Benta</h1>
        {!isEmpty && (
          <button type="button" className={`${ui.btn} ${ui.ghost}`} onClick={() => setCart({})}>
            Burahin lahat
          </button>
        )}
      </header>

      {products.length === 0 ? (
        <p className={ui.empty}>
          Wala pang produkto. Buksan ang <strong>Settings</strong> at pindutin ang{' '}
          <strong>I-refresh ang produkto</strong>.
        </p>
      ) : (
        <ProductGrid
          products={products}
          cart={cart}
          onTap={(p) => setCart((c) => addOne(c, p.product_id))}
          onLongPress={setEditing}
        />
      )}

      <section className={ui.section} aria-labelledby="cart-title">
        <h2 id="cart-title" className={ui.sectionTitle}>
          Listahan
        </h2>
        <CartList
          cart={cart}
          products={products}
          onChange={(id, qty) => setCart((c) => setQty(c, id, qty))}
          onEditQty={setEditing}
        />
      </section>

      <section className={styles.checkout} aria-label="Bayad">
        <div className={styles.totalRow}>
          <span className={`${ui.muted} tabular`}>{units} piraso</span>
          <span className={`${styles.total} tabular`} data-testid="cart-total">
            {formatPeso(total)}
          </span>
        </div>
        <PaymentButtons value={payment} onChange={setPayment} />
        <button
          type="button"
          className={`${ui.btn} ${ui.primary} ${ui.large} ${ui.block}`}
          disabled={!canSave}
          onClick={save}
        >
          <Check size={24} strokeWidth={2.5} aria-hidden />
          I-save
        </button>
        {!isEmpty && payment === null && <p className={`${ui.muted} ${styles.hint}`}>Piliin muna ang bayad.</p>}
      </section>

      <QtyDialog
        product={
          editing ? { name: editing.product, unit: editing.unit, qty: cart[editing.product_id] ?? 0 } : null
        }
        onCancel={() => setEditing(null)}
        onSubmit={(qty) => {
          if (editing) setCart((c) => setQty(c, editing.product_id, qty));
          setEditing(null);
        }}
      />
    </div>
  );
}
