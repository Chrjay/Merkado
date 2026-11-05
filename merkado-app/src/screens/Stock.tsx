import { useState } from 'react';
import { Check } from 'lucide-react';
import { useProducts } from '../hooks/useProducts';
import { saveStockCounts } from '../lib/events';
import { useToast } from '../components/toastContext';
import ui from '../styles/ui.module.css';
import styles from './Stock.module.css';

export function Stock() {
  const { products } = useProducts();
  const toast = useToast();
  const [values, setValues] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState(false);

  const filled = Object.entries(values).filter(([, v]) => v !== '');

  async function save() {
    const counts: Record<number, number> = {};
    for (const [id, v] of filled) counts[Number(id)] = Number(v);
    setSaving(true);
    try {
      await saveStockCounts(counts);
      setValues({});
      navigator.vibrate?.(30);
      toast('Naitala na ang bilang!');
    } catch (err) {
      toast(`Hindi na-save: ${err instanceof Error ? err.message : String(err)}`, 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={ui.screen}>
      <header className={ui.header}>
        <h1 className={ui.title}>Stock</h1>
      </header>
      <p className={ui.muted}>
        Ilagay kung ilan pa ang natitira sa bawat produkto. Puwedeng iwanang blangko ang hindi binilang.
      </p>

      {products.length === 0 ? (
        <p className={ui.empty}>Wala pang produkto.</p>
      ) : (
        <ul className={styles.list}>
          {products.map((p) => {
            const id = `count-${p.product_id}`;
            return (
              <li key={p.product_id} className={styles.row}>
                <label htmlFor={id} className={styles.name}>
                  {p.product}
                  <span className={ui.muted}>{p.unit}</span>
                </label>
                <input
                  id={id}
                  className={`${ui.input} ${styles.count} tabular`}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  enterKeyHint="next"
                  autoComplete="off"
                  placeholder="0"
                  value={values[p.product_id] ?? ''}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, '').slice(0, 5);
                    setValues((prev) => ({ ...prev, [p.product_id]: v }));
                  }}
                />
              </li>
            );
          })}
        </ul>
      )}

      <button
        type="button"
        className={`${ui.btn} ${ui.primary} ${ui.large} ${ui.block}`}
        disabled={filled.length === 0 || saving}
        onClick={save}
      >
        <Check size={24} strokeWidth={2.5} aria-hidden />
        I-save ang bilang
      </button>
    </div>
  );
}
