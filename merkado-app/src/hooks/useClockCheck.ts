import { useLiveQuery } from 'dexie-react-hooks';
import { db, type ServerSale } from '../lib/db';
import type { OutboxRow } from '../types/events';

export interface ClockCheckState {
  warning: string | null;
}

const TEN_MIN_MS = 10 * 60 * 1000;

export function useClockCheck(): ClockCheckState {
  const skew = useLiveQuery(() => db.meta.get('server_skew_ms'), [], undefined)?.value;
  const outbox =
    useLiveQuery(() => db.outbox.toArray(), [], [] as OutboxRow[]) ?? [];
  const serverSales =
    useLiveQuery(() => db.todaySales.toArray(), [], [] as ServerSale[]) ?? [];

  // 1) Phone clock more than 10 minutes off from the server.
  if (typeof skew === 'number' && Math.abs(skew) > TEN_MIN_MS) {
    const mins = Math.round(Math.abs(skew) / 60000);
    return {
      warning: `Mali ang oras ng telepono (${mins} min layo sa server). Ayusin ang oras.`,
    };
  }

  // 2) The newest sale is dated before an already-recorded sale — the clock
  //    may have gone backwards. Compare the newest local sale to the newest
  //    known sale timestamp.
  const saleStamps = [
    ...serverSales.map((s) => `${s.sale_date} ${s.sale_time}`),
    ...outbox
      .filter((r) => r.event.type === 'sale')
      .map((r) => `${r.event.date} ${r.event.time}`),
  ].sort();

  if (saleStamps.length >= 2) {
    const newestOutbox = outbox
      .filter((r) => r.event.type === 'sale')
      .map((r) => `${r.event.date} ${r.event.time}`)
      .sort()
      .at(-1);
    const newestOverall = saleStamps.at(-1);
    if (newestOutbox && newestOverall && newestOutbox < newestOverall) {
      return { warning: 'May bentang mas luma ang petsa kaysa sa nauna. Suriin ang oras.' };
    }
  }

  return { warning: null };
}
