import { db } from './db';
import type { Product } from './db';
import type { Cart } from './cart';
import { makeId } from './ids';
import { manilaDate, manilaTime } from './time';
import { appEventSchema, type AppEvent, type Payment, type SaleLine } from '../types/events';

// ---------------------------------------------------------------------------
// Sync trigger wiring. SyncProvider registers its trigger here so that every
// save can kick a sync without events.ts importing React. Safe no-op if unset.
// ---------------------------------------------------------------------------
let syncTrigger: (() => void) | null = null;
export function registerSyncTrigger(fn: (() => void) | null): void {
  syncTrigger = fn;
}
function fireSync(): void {
  try {
    syncTrigger?.();
  } catch {
    // a save must never fail because the sync trigger threw
  }
}

// ---------------------------------------------------------------------------
// Device id (persisted in meta)
// ---------------------------------------------------------------------------
const DEVICE_KEY = 'device_id';

export async function getDeviceId(): Promise<string> {
  const row = await db.meta.get(DEVICE_KEY);
  if (row && typeof row.value === 'string' && row.value) return row.value;
  const id = `phone-${makeId('E').slice(2)}`;
  await db.meta.put({ key: DEVICE_KEY, value: id });
  return id;
}

export async function setDeviceId(id: string): Promise<void> {
  await db.meta.put({ key: DEVICE_KEY, value: id });
}

// ---------------------------------------------------------------------------
// Writes. events.ts is the ONLY way screens write data: build → validate → outbox → trigger.
// ---------------------------------------------------------------------------

async function enqueue(event: AppEvent): Promise<void> {
  const parsed = appEventSchema.safeParse(event);
  if (!parsed.success) {
    throw new Error(`invalid ${event.type} event: ${parsed.error.message}`);
  }
  await db.outbox.add({ event, status: 'pending', attempts: 0, created_at: Date.now() });
}

export async function saveSale(cart: Cart, payment: Payment, products: Product[]): Promise<AppEvent> {
  const priceOf = new Map(products.map((p) => [p.product_id, p.price]));
  const now = new Date();
  const items: SaleLine[] = Object.entries(cart)
    .filter(([, qty]) => qty > 0)
    .map(([id, qty]) => {
      const pid = Number(id);
      return { product_id: pid, qty, unit_price: priceOf.get(pid) ?? null };
    });

  const event: AppEvent = {
    id: makeId('S', now),
    type: 'sale',
    date: manilaDate(now),
    time: manilaTime(now),
    device_id: await getDeviceId(),
    payment,
    items,
  };
  await enqueue(event);
  fireSync();
  return event;
}

export async function saveDayEvent(
  type: 'stockout' | 'rainy' | 'closed',
  product_id?: number,
): Promise<AppEvent> {
  const now = new Date();
  const base = {
    id: makeId('E', now),
    date: manilaDate(now),
    time: manilaTime(now),
    device_id: await getDeviceId(),
  };
  const event: AppEvent =
    type === 'stockout'
      ? { ...base, type, product_id: product_id as number }
      : { ...base, type };
  await enqueue(event);
  fireSync();
  return event;
}

export async function saveStockCounts(counts: Record<number, number>): Promise<AppEvent[]> {
  const device_id = await getDeviceId();
  const events: AppEvent[] = [];
  for (const [id, count] of Object.entries(counts)) {
    const now = new Date();
    const event: AppEvent = {
      id: makeId('E', now),
      type: 'stock_count',
      date: manilaDate(now),
      time: manilaTime(now),
      device_id,
      product_id: Number(id),
      count,
    };
    await enqueue(event);
    events.push(event);
  }
  if (events.length) fireSync();
  return events;
}

export async function voidSale(trans_id: string): Promise<'removed-from-outbox' | 'queued'> {
  // Unsent sale still pending in the outbox → just delete it.
  const pending = await db.outbox
    .where('status')
    .equals('pending')
    .filter((r) => r.event.type === 'sale' && r.event.id === trans_id)
    .first();

  if (pending?.seq != null) {
    await db.outbox.delete(pending.seq);
    return 'removed-from-outbox';
  }

  // Otherwise enqueue a void event for the server.
  const now = new Date();
  const event: AppEvent = {
    id: makeId('E', now),
    type: 'void',
    date: manilaDate(now),
    time: manilaTime(now),
    device_id: await getDeviceId(),
    trans_id,
  };
  await enqueue(event);
  fireSync();
  return 'queued';
}

export async function deleteOutboxRow(seq: number): Promise<void> {
  await db.outbox.delete(seq);
}
