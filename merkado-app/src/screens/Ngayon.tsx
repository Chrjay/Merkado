import { useState } from 'react';
import { Clock, CloudCheck, CloudOff, RefreshCw, Trash2, TriangleAlert, Undo2 } from 'lucide-react';
import { useClockCheck } from '../hooks/useClockCheck';
import { useOutbox } from '../hooks/useOutbox';
import { useProducts } from '../hooks/useProducts';
import { useSync } from '../hooks/useSync';
import { useTodaySales } from '../hooks/useTodaySales';
import { deleteOutboxRow, voidSale } from '../lib/events';
import type { AppEvent, OutboxRow } from '../types/events';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { formatClock, formatPeso, formatTimestamp } from '../components/format';
import { SyncBadge } from '../components/SyncBadge';
import { useToast } from '../components/toastContext';
import ui from '../styles/ui.module.css';
import styles from './Ngayon.module.css';

type Sale = ReturnType<typeof useTodaySales>['sales'][number];

const EVENT_LABEL: Record<AppEvent['type'], string> = {
  sale: 'Benta',
  stockout: 'Ubos na',
  rainy: 'Umuulan',
  closed: 'Sarado',
  stock_count: 'Bilang ng stock',
  void: 'Bawiin',
};

function isNetworkError(message: string | null): boolean {
  return message !== null && /fetch|network|offline|load failed|timed? ?out/i.test(message);
}

export function Ngayon() {
  const { sales, totalPeso, totalUnits } = useTodaySales();
  const { pending, rejected, unsentCount } = useOutbox();
  const { status, lastSyncAt, lastError, trigger } = useSync();
  const { warning } = useClockCheck();
  const { products } = useProducts();
  const toast = useToast();

  const [voiding, setVoiding] = useState<Sale | null>(null);
  const [removing, setRemoving] = useState<OutboxRow | null>(null);

  const names = new Map(products.map((p) => [p.product_id, p.product]));
  const prices = new Map(products.map((p) => [p.product_id, p.price]));
  const productName = (id: number) => names.get(id) ?? `Produkto #${id}`;
  const voidQueued = new Set(
    pending.flatMap((r) => (r.event.type === 'void' ? [r.event.trans_id] : [])),
  );

  function describe(event: AppEvent): string {
    switch (event.type) {
      case 'sale':
        return event.items.map((i) => `${i.qty}× ${productName(i.product_id)}`).join(', ');
      case 'stockout':
        return productName(event.product_id);
      case 'stock_count':
        return `${productName(event.product_id)}: ${event.count}`;
      case 'void':
        return event.trans_id;
      default:
        return event.date;
    }
  }

  return (
    <div className={ui.screen}>
      <header className={ui.header}>
        <h1 className={ui.title}>Ngayon</h1>
        <SyncBadge status={status} unsentCount={unsentCount} />
      </header>

      {warning && (
        <p className={ui.notice} role="alert">
          <Clock size={20} aria-hidden />
          <span>{warning}</span>
        </p>
      )}

      <section className={styles.summary} aria-label="Kabuuan ngayong araw">
        <div>
          <span className={ui.muted}>Kabuuan ngayon</span>
          <span className={`${styles.bigNumber} tabular`} data-testid="today-total">
            {formatPeso(totalPeso)}
          </span>
        </div>
        <div className={styles.units}>
          <span className={`${styles.unitsNumber} tabular`}>{totalUnits}</span>
          <span className={ui.muted}>piraso</span>
        </div>
      </section>

      <div className={styles.syncRow}>
        <button
          type="button"
          className={`${ui.btn} ${ui.secondary} ${styles.sendBtn}`}
          onClick={trigger}
          disabled={status === 'syncing'}
        >
          <RefreshCw size={20} aria-hidden className={status === 'syncing' ? styles.spin : undefined} />
          Ipadala
        </button>
        <p className={ui.muted} data-testid="unsent-count">
          {unsentCount === 0 ? 'Walang naiwan.' : `${unsentCount} hindi pa naipadala.`}
          {lastSyncAt !== null && <> Huling padala: {formatTimestamp(lastSyncAt)}.</>}
        </p>
      </div>
      {(status === 'offline' || (status === 'error' && isNetworkError(lastError))) && unsentCount > 0 && (
        <p className={ui.notice}>
          <CloudOff size={20} aria-hidden />
          <span>Walang signal. Ipapadala ito kapag may internet na.</span>
        </p>
      )}
      {status === 'error' && lastError && !isNetworkError(lastError) && (
        <p className={`${ui.notice} ${ui.noticeDanger}`}>
          <TriangleAlert size={20} aria-hidden />
          <span>Hindi naipadala: {lastError}</span>
        </p>
      )}

      {rejected.length > 0 && (
        <section className={ui.section} aria-labelledby="rejected-title">
          <h2 id="rejected-title" className={ui.sectionTitle}>
            Hindi tinanggap ng server ({rejected.length})
          </h2>
          <ul className={styles.list}>
            {rejected.map((row) => (
              <li key={row.seq ?? row.event.id} className={styles.rejected}>
                <div className={styles.saleMain}>
                  <span className={styles.saleTitle}>
                    {EVENT_LABEL[row.event.type]} · {formatClock(row.event.time)}
                  </span>
                  <span className={styles.items}>{describe(row.event)}</span>
                  <span className={styles.reason}>Dahilan: {row.reason ?? 'walang dahilan'}</span>
                </div>
                <button
                  type="button"
                  className={`${ui.btn} ${ui.dangerGhost}`}
                  onClick={() => setRemoving(row)}
                  disabled={row.seq === undefined}
                >
                  <Trash2 size={20} aria-hidden />
                  Burahin
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className={ui.section} aria-labelledby="sales-title">
        <h2 id="sales-title" className={ui.sectionTitle}>
          Mga benta ngayon
        </h2>
        {sales.length === 0 ? (
          <p className={ui.empty}>Wala pang benta ngayong araw.</p>
        ) : (
          <ul className={styles.list}>
            {[...sales]
              .sort((a, b) => b.sale_time.localeCompare(a.sale_time))
              .map((sale) => {
                const queued = voidQueued.has(sale.trans_id);
                const total = sale.items.reduce(
                  (sum, i) => sum + (i.unit_price ?? prices.get(i.product_id) ?? 0) * i.qty,
                  0,
                );
                return (
                  <li key={sale.trans_id} className={styles.sale} data-voided={sale.voided || queued}>
                    <div className={styles.saleMain}>
                      <span className={styles.saleTitle}>
                        <span className="tabular">{formatClock(sale.sale_time)}</span>
                        <span className={styles.payment} data-payment={sale.payment}>
                          {sale.payment}
                        </span>
                      </span>
                      <span className={styles.items}>
                        {sale.items.map((i) => `${i.qty}× ${productName(i.product_id)}`).join(', ')}
                      </span>
                      <span className={styles.status}>
                        {sale.voided ? (
                          <>Binawi na</>
                        ) : queued ? (
                          <>Babawiin pagka-padala</>
                        ) : sale.synced ? (
                          <>
                            <CloudCheck size={16} aria-hidden /> Naipadala
                          </>
                        ) : (
                          <span className={styles.unsent}>
                            <CloudOff size={16} aria-hidden /> Hindi pa naipadala
                          </span>
                        )}
                      </span>
                    </div>
                    <div className={styles.saleSide}>
                      <span className={`${styles.saleTotal} tabular`}>{formatPeso(total)}</span>
                      {!sale.voided && !queued && (
                        <button
                          type="button"
                          className={`${ui.btn} ${ui.secondary}`}
                          onClick={() => setVoiding(sale)}
                          aria-label={`Bawiin ang benta ng ${formatClock(sale.sale_time)}`}
                        >
                          <Undo2 size={20} aria-hidden />
                          Bawiin
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
          </ul>
        )}
      </section>

      <ConfirmDialog
        open={voiding !== null}
        title="Bawiin ang benta?"
        message={
          voiding && (
            <>
              {formatClock(voiding.sale_time)} · {voiding.payment}
              <br />
              {voiding.items.map((i) => `${i.qty}× ${productName(i.product_id)}`).join(', ')}
            </>
          )
        }
        confirmLabel="Oo, bawiin"
        danger
        onCancel={() => setVoiding(null)}
        onConfirm={async () => {
          if (!voiding) return;
          try {
            const result = await voidSale(voiding.trans_id);
            toast(result === 'removed-from-outbox' ? 'Binawi na ang benta.' : 'Babawiin pagka-padala.');
          } catch (err) {
            toast(`Hindi nabawi: ${err instanceof Error ? err.message : String(err)}`, 'error');
          }
          setVoiding(null);
        }}
      />

      <ConfirmDialog
        open={removing !== null}
        title="Burahin ito?"
        message="Hindi na ito ipapadala. Gawin ulit kung kailangan pa."
        confirmLabel="Oo, burahin"
        danger
        onCancel={() => setRemoving(null)}
        onConfirm={async () => {
          if (removing?.seq !== undefined) await deleteOutboxRow(removing.seq);
          setRemoving(null);
        }}
      />
    </div>
  );
}
