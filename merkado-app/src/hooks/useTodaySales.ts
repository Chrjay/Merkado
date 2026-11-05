import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Product, type ServerSale } from '../lib/db';
import type { OutboxRow } from '../types/events';

export interface TodaySale extends ServerSale {
  synced: boolean;
}

export interface TodaySalesState {
  sales: TodaySale[];
  totalPeso: number;
  totalUnits: number;
}

/** Peso value of a sale's lines, falling back to the product price when the
 * line has no snapshot price. */
function salePeso(sale: ServerSale, priceOf: Map<number, number | null>): number {
  let total = 0;
  for (const item of sale.items) {
    const price = item.unit_price ?? priceOf.get(item.product_id) ?? null;
    if (price != null) total += price * item.qty;
  }
  return total;
}

function saleUnits(sale: ServerSale): number {
  return sale.items.reduce((n, i) => n + i.qty, 0);
}

export function useTodaySales(): TodaySalesState {
  const serverSales =
    useLiveQuery(() => db.todaySales.toArray(), [], [] as ServerSale[]) ?? [];
  const outbox =
    useLiveQuery(() => db.outbox.toArray(), [], [] as OutboxRow[]) ?? [];
  const products =
    useLiveQuery(() => db.products.toArray(), [], [] as Product[]) ?? [];

  const priceOf = new Map<number, number | null>(products.map((p) => [p.product_id, p.price]));
  const serverIds = new Set(serverSales.map((s) => s.trans_id));

  // Pending outbox sales not yet reflected on the server.
  const pendingSales: TodaySale[] = outbox
    .filter((r) => r.event.type === 'sale' && !serverIds.has(r.event.id))
    .map((r) => {
      const ev = r.event as Extract<OutboxRow['event'], { type: 'sale' }>;
      return {
        trans_id: ev.id,
        sale_date: ev.date,
        sale_time: ev.time,
        payment: ev.payment,
        voided: false,
        items: ev.items,
        synced: false,
      };
    });

  // Voids queued locally should hide the matching pending/server sale from totals.
  const voidedLocally = new Set(
    outbox.filter((r) => r.event.type === 'void').map((r) => (r.event as Extract<OutboxRow['event'], { type: 'void' }>).trans_id),
  );

  const syncedSales: TodaySale[] = serverSales.map((s) => ({
    ...s,
    voided: s.voided || voidedLocally.has(s.trans_id),
    synced: true,
  }));

  const sales = [...pendingSales, ...syncedSales].sort((a, b) =>
    `${b.sale_date} ${b.sale_time}`.localeCompare(`${a.sale_date} ${a.sale_time}`),
  );

  let totalPeso = 0;
  let totalUnits = 0;
  for (const s of sales) {
    if (s.voided || voidedLocally.has(s.trans_id)) continue;
    totalPeso += salePeso(s, priceOf);
    totalUnits += saleUnits(s);
  }

  return { sales, totalPeso, totalUnits };
}
