import { beforeEach, describe, expect, it } from 'vitest';
import {
  saveSale,
  saveDayEvent,
  saveStockCounts,
  voidSale,
  deleteOutboxRow,
  getDeviceId,
  setDeviceId,
} from '../../src/lib/events';
import { appEventSchema } from '../../src/types/events';
import { db } from '../../src/lib/db';
import type { Product } from '../../src/lib/db';
import type { Cart } from '../../src/lib/cart';

const products: Product[] = [
  { product_id: 1, product: 'Kape', unit: 'pc', pack_multiplier: 1, price: 8, sort_order: 1, active: true },
  { product_id: 2, product: 'Tinapay', unit: 'pc', pack_multiplier: 1, price: 12.5, sort_order: 2, active: true },
  { product_id: 3, product: 'Walang presyo', unit: 'pc', pack_multiplier: 1, price: null, sort_order: 3, active: true },
];

beforeEach(async () => {
  await db.outbox.clear();
  await db.products.clear();
  await db.todaySales.clear();
  await db.meta.clear();
});

describe('zod validation (mirrors the DB checks)', () => {
  it('rejects qty 0', () => {
    const ev = {
      id: 'S-1', type: 'sale', date: '2026-11-03', time: '06:08:12', device_id: 'p1',
      payment: 'Cash', items: [{ product_id: 1, qty: 0, unit_price: 8 }],
    };
    expect(appEventSchema.safeParse(ev).success).toBe(false);
  });

  it('rejects an empty sale', () => {
    const ev = {
      id: 'S-1', type: 'sale', date: '2026-11-03', time: '06:08:12', device_id: 'p1',
      payment: 'Cash', items: [],
    };
    expect(appEventSchema.safeParse(ev).success).toBe(false);
  });

  it('rejects a bad payment', () => {
    const ev = {
      id: 'S-1', type: 'sale', date: '2026-11-03', time: '06:08:12', device_id: 'p1',
      payment: 'Bitcoin', items: [{ product_id: 1, qty: 1, unit_price: 8 }],
    };
    expect(appEventSchema.safeParse(ev).success).toBe(false);
  });

  it('rejects duplicate product_id in one sale', () => {
    const ev = {
      id: 'S-1', type: 'sale', date: '2026-11-03', time: '06:08:12', device_id: 'p1',
      payment: 'Cash',
      items: [
        { product_id: 1, qty: 1, unit_price: 8 },
        { product_id: 1, qty: 2, unit_price: 8 },
      ],
    };
    expect(appEventSchema.safeParse(ev).success).toBe(false);
  });

  it('rejects a negative stock count', () => {
    const ev = {
      id: 'E-1', type: 'stock_count', date: '2026-11-03', time: '06:08:12', device_id: 'p1',
      product_id: 1, count: -1,
    };
    expect(appEventSchema.safeParse(ev).success).toBe(false);
  });

  it('accepts a valid sale', () => {
    const ev = {
      id: 'S-1', type: 'sale', date: '2026-11-03', time: '06:08:12', device_id: 'p1',
      payment: 'GCash', items: [{ product_id: 1, qty: 2, unit_price: null }],
    };
    expect(appEventSchema.safeParse(ev).success).toBe(true);
  });
});

describe('saveSale', () => {
  it('writes a pending sale row to the outbox', async () => {
    const cart: Cart = { 1: 2, 2: 1 };
    const ev = await saveSale(cart, 'Cash', products);
    expect(ev.type).toBe('sale');
    const rows = await db.outbox.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('pending');
    expect(rows[0].event.type).toBe('sale');
    if (rows[0].event.type === 'sale') {
      expect(rows[0].event.items).toHaveLength(2);
      // line 1 = product 1, line 2 = product 2 (cart order)
      expect(rows[0].event.items[0].unit_price).toBe(8);
      expect(rows[0].event.payment).toBe('Cash');
    }
  });

  it('throws on an empty cart', async () => {
    await expect(saveSale({}, 'Cash', products)).rejects.toThrow();
    expect(await db.outbox.count()).toBe(0);
  });

  it('snapshots null unit_price for priceless products', async () => {
    const ev = await saveSale({ 3: 1 }, 'Cash', products);
    if (ev.type === 'sale') expect(ev.items[0].unit_price).toBeNull();
  });
});

describe('saveDayEvent', () => {
  it('queues a rainy event with no product_id', async () => {
    const ev = await saveDayEvent('rainy');
    expect(ev.type).toBe('rainy');
    expect(await db.outbox.count()).toBe(1);
  });

  it('queues a stockout event with a product_id', async () => {
    const ev = await saveDayEvent('stockout', 3);
    expect(ev.type).toBe('stockout');
    if (ev.type === 'stockout') expect(ev.product_id).toBe(3);
  });

  it('throws when stockout has no product_id', async () => {
    await expect(saveDayEvent('stockout')).rejects.toThrow();
  });
});

describe('saveStockCounts', () => {
  it('queues one stock_count event per product', async () => {
    const evs = await saveStockCounts({ 1: 10, 2: 0 });
    expect(evs).toHaveLength(2);
    expect(await db.outbox.count()).toBe(2);
    expect(evs.every((e) => e.type === 'stock_count')).toBe(true);
  });
});

describe('voidSale', () => {
  it('removes an unsent sale from the outbox', async () => {
    const ev = await saveSale({ 1: 1 }, 'Cash', products);
    const result = await voidSale(ev.id);
    expect(result).toBe('removed-from-outbox');
    expect(await db.outbox.count()).toBe(0);
  });

  it('queues a void event when the sale is not in the outbox', async () => {
    const result = await voidSale('S-ALREADY-SENT');
    expect(result).toBe('queued');
    const rows = await db.outbox.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0].event.type).toBe('void');
    if (rows[0].event.type === 'void') expect(rows[0].event.trans_id).toBe('S-ALREADY-SENT');
  });
});

describe('deleteOutboxRow', () => {
  it('deletes a row by seq', async () => {
    const ev = await saveSale({ 1: 1 }, 'Cash', products);
    const row = await db.outbox.toCollection().first();
    expect(row).toBeDefined();
    await deleteOutboxRow(row!.seq!);
    expect(await db.outbox.count()).toBe(0);
    expect(ev.type).toBe('sale');
  });
});

describe('device id', () => {
  it('persists and reads back a device id', async () => {
    await setDeviceId('phone-xyz');
    expect(await getDeviceId()).toBe('phone-xyz');
  });

  it('generates and persists a device id on first read', async () => {
    const id = await getDeviceId();
    expect(id).toBeTruthy();
    expect(await getDeviceId()).toBe(id); // stable across calls
  });
});
