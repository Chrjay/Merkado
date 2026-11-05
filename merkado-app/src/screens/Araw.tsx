import { useState } from 'react';
import { Check, CloudRain, DoorClosed, PackageX } from 'lucide-react';
import { useOutbox } from '../hooks/useOutbox';
import { useProducts } from '../hooks/useProducts';
import { saveDayEvent } from '../lib/events';
import { manilaDate } from '../lib/time';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { markLogged, useLoggedToday } from '../components/dayLog';
import { useToast } from '../components/toastContext';
import ui from '../styles/ui.module.css';
import styles from './Araw.module.css';

export function Araw() {
  const { products } = useProducts();
  const { pending, rejected } = useOutbox();
  const toast = useToast();
  const today = manilaDate();
  const local = useLoggedToday(today);

  const logged = new Set(local);
  for (const row of [...pending, ...rejected]) {
    const e = row.event;
    if (e.date !== today) continue;
    if (e.type === 'rainy' || e.type === 'closed') logged.add(e.type);
    if (e.type === 'stockout') logged.add(`stockout:${e.product_id}`);
  }

  const [ticked, setTicked] = useState<Set<number>>(new Set());
  const [confirmClosed, setConfirmClosed] = useState(false);
  const [busy, setBusy] = useState(false);

  function toggle(id: number) {
    setTicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function run(action: () => Promise<void>, success: string) {
    setBusy(true);
    try {
      await action();
      navigator.vibrate?.(30);
      toast(success);
    } catch (err) {
      toast(`Hindi na-save: ${err instanceof Error ? err.message : String(err)}`, 'error');
    } finally {
      setBusy(false);
    }
  }

  const saveStockouts = () =>
    run(async () => {
      for (const id of ticked) {
        await saveDayEvent('stockout', id);
        markLogged(today, `stockout:${id}`);
      }
      setTicked(new Set());
    }, 'Naitala na ang ubos!');

  const rainyLogged = logged.has('rainy');
  const closedLogged = logged.has('closed');

  return (
    <div className={ui.screen}>
      <header className={ui.header}>
        <h1 className={ui.title}>Araw</h1>
      </header>

      <div className={styles.dayActions}>
        <button
          type="button"
          className={styles.dayButton}
          data-done={rainyLogged}
          disabled={rainyLogged || busy}
          onClick={() =>
            run(async () => {
              await saveDayEvent('rainy');
              markLogged(today, 'rainy');
            }, 'Naitala na: umuulan ngayon.')
          }
        >
          {rainyLogged ? <Check size={28} strokeWidth={2.5} aria-hidden /> : <CloudRain size={28} aria-hidden />}
          <span className={styles.dayLabel}>Umuulan ngayon</span>
          {rainyLogged && <span className={styles.dayState}>Naitala na ngayong araw</span>}
        </button>

        <button
          type="button"
          className={`${styles.dayButton} ${styles.closed}`}
          data-done={closedLogged}
          disabled={closedLogged || busy}
          onClick={() => setConfirmClosed(true)}
        >
          {closedLogged ? <Check size={28} strokeWidth={2.5} aria-hidden /> : <DoorClosed size={28} aria-hidden />}
          <span className={styles.dayLabel}>Sarado ngayon</span>
          {closedLogged && <span className={styles.dayState}>Naitala na ngayong araw</span>}
        </button>
      </div>

      <section className={ui.section} aria-labelledby="ubos-title">
        <div className={styles.sectionHead}>
          <PackageX size={22} aria-hidden className={styles.sectionIcon} />
          <h2 id="ubos-title" className={ui.sectionTitle}>
            Ubos na
          </h2>
        </div>
        <p className={ui.muted}>Markahan ang mga produktong naubos ngayon.</p>

        {products.length === 0 ? (
          <p className={ui.empty}>Wala pang produkto.</p>
        ) : (
          <ul className={styles.checklist}>
            {products.map((p) => {
              const done = logged.has(`stockout:${p.product_id}`);
              return (
                <li key={p.product_id}>
                  <label className={styles.checkRow} data-done={done}>
                    <input
                      type="checkbox"
                      className={styles.checkbox}
                      checked={done || ticked.has(p.product_id)}
                      disabled={done}
                      onChange={() => toggle(p.product_id)}
                    />
                    <span className={styles.checkName}>
                      {p.product}
                      <span className={ui.muted}> · {p.unit}</span>
                    </span>
                    {done && <span className={styles.tag}>Naitala na</span>}
                  </label>
                </li>
              );
            })}
          </ul>
        )}

        <button
          type="button"
          className={`${ui.btn} ${ui.primary} ${ui.large} ${ui.block}`}
          disabled={ticked.size === 0 || busy}
          onClick={saveStockouts}
        >
          <Check size={24} strokeWidth={2.5} aria-hidden />
          {ticked.size > 0 ? `I-save ang ubos (${ticked.size})` : 'I-save ang ubos'}
        </button>
      </section>

      <ConfirmDialog
        open={confirmClosed}
        title="Sarado ang tindahan ngayon?"
        message="Itatala na hindi bukas ang tindahan ngayong araw."
        confirmLabel="Oo, sarado"
        onCancel={() => setConfirmClosed(false)}
        onConfirm={async () => {
          setConfirmClosed(false);
          await run(async () => {
            await saveDayEvent('closed');
            markLogged(today, 'closed');
          }, 'Naitala na: sarado ngayon.');
        }}
      />
    </div>
  );
}
