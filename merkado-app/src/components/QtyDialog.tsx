import { useEffect, useRef, useState } from 'react';
import ui from '../styles/ui.module.css';
import styles from './Dialog.module.css';

interface QtyDialogProps {
  /** Product being edited; null closes the dialog. */
  product: { name: string; unit: string; qty: number } | null;
  onSubmit: (qty: number) => void;
  onCancel: () => void;
}

const MAX_QTY = 999;

export function QtyDialog({ product, onSubmit, onCancel }: QtyDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const open = product !== null;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-labelledby="qty-title"
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
    >
      {product && <QtyForm product={product} onSubmit={onSubmit} onCancel={onCancel} />}
    </dialog>
  );
}

function QtyForm({
  product,
  onSubmit,
  onCancel,
}: {
  product: NonNullable<QtyDialogProps['product']>;
  onSubmit: (qty: number) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(product.qty > 0 ? String(product.qty) : '');
  const qty = Number(value);
  const valid = value !== '' && Number.isInteger(qty) && qty >= 0 && qty <= MAX_QTY;

  return (
    <form
      className={styles.body}
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) onSubmit(qty);
      }}
    >
      <h2 id="qty-title" className={styles.title}>
        {product.name}
      </h2>
      <label className={ui.field}>
        <span className={ui.label}>Ilan? ({product.unit})</span>
        <input
          className={`${ui.input} ${styles.qtyInput} tabular`}
          inputMode="numeric"
          pattern="[0-9]*"
          enterKeyHint="done"
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value.replace(/\D/g, '').slice(0, 3))}
          aria-describedby="qty-help"
        />
        <span id="qty-help" className={ui.muted}>
          0 para alisin sa listahan.
        </span>
      </label>
      <div className={styles.actions}>
        <button type="button" className={`${ui.btn} ${ui.secondary}`} onClick={onCancel}>
          Huwag na
        </button>
        <button type="submit" className={`${ui.btn} ${ui.primary}`} disabled={!valid}>
          Itakda
        </button>
      </div>
    </form>
  );
}
