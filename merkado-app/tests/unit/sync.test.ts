import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSyncEngine } from '../../src/lib/sync';
import { db } from '../../src/lib/db';
import type { AppEvent, OutboxRow, SubmitResult } from '../../src/types/events';

function saleEvent(id: string): AppEvent {
  return {
    id,
    type: 'sale',
    date: '2026-11-03',
    time: '06:08:12',
    device_id: 'phone-1',
    payment: 'Cash',
    items: [{ product_id: 1, qty: 1, unit_price: 8 }],
  };
}

async function seedOutbox(n: number): Promise<void> {
  const rows: OutboxRow[] = Array.from({ length: n }, (_, i) => ({
    event: saleEvent(`S-${String(i).padStart(4, '0')}`),
    status: 'pending' as const,
    attempts: 0,
    created_at: 1000 + i,
  }));
  await db.outbox.bulkAdd(rows);
}

beforeEach(async () => {
  await db.outbox.clear();
  await db.products.clear();
  await db.todaySales.clear();
  await db.meta.clear();
});

describe('createSyncEngine.nextDelayMs', () => {
  const engine = createSyncEngine({ rpc: async () => emptyResult() });

  it('follows 10s, 30s, 120s, 300s then caps at 300s', () => {
    expect(engine.nextDelayMs(1)).toBe(10_000);
    expect(engine.nextDelayMs(2)).toBe(30_000);
    expect(engine.nextDelayMs(3)).toBe(120_000);
    expect(engine.nextDelayMs(4)).toBe(300_000);
    expect(engine.nextDelayMs(5)).toBe(300_000);
    expect(engine.nextDelayMs(99)).toBe(300_000);
  });

  it('returns 0 when there have been no failures', () => {
    expect(engine.nextDelayMs(0)).toBe(0);
  });
});

function emptyResult(): SubmitResult {
  return { accepted: [], duplicates: [], rejected: [], server_time: '2026-11-03T06:08:12.000+08:00' };
}

describe('createSyncEngine.syncOnce', () => {
  it('batches 120 outbox events into 3 rpc calls of <=50', async () => {
    await seedOutbox(120);
    const calls: number[] = [];
    const rpc = vi.fn(async (events: AppEvent[]): Promise<SubmitResult> => {
      calls.push(events.length);
      return {
        accepted: events.map((e) => e.id),
        duplicates: [],
        rejected: [],
        server_time: '2026-11-03T06:08:12.000+08:00',
      };
    });
    const engine = createSyncEngine({ rpc });

    const r1 = await engine.syncOnce();
    expect(calls[0]).toBe(50);
    const r2 = await engine.syncOnce();
    const r3 = await engine.syncOnce();

    expect([r1.sent, r2.sent, r3.sent]).toEqual([50, 50, 20]);
    expect(rpc).toHaveBeenCalledTimes(3);
    expect(await db.outbox.count()).toBe(0);
  });

  it('removes accepted and duplicate events from the outbox', async () => {
    await seedOutbox(3);
    const rpc = async (events: AppEvent[]): Promise<SubmitResult> => ({
      accepted: [events[0].id],
      duplicates: [events[1].id],
      rejected: [],
      server_time: '2026-11-03T06:08:12.000+08:00',
    });
    const engine = createSyncEngine({ rpc });
    const r = await engine.syncOnce();
    expect(r.accepted).toBe(1);
    expect(r.duplicates).toBe(1);
    // one row (the untouched third) remains pending
    expect(await db.outbox.count()).toBe(1);
  });

  it('keeps rejected rows with the reason and status rejected, not resent', async () => {
    await seedOutbox(1);
    const rpc = vi.fn(async (events: AppEvent[]): Promise<SubmitResult> => ({
      accepted: [],
      duplicates: [],
      rejected: [{ id: events[0].id, reason: 'product not active' }],
      server_time: '2026-11-03T06:08:12.000+08:00',
    }));
    const engine = createSyncEngine({ rpc });

    const r = await engine.syncOnce();
    expect(r.rejected).toBe(1);
    const row = await db.outbox.toCollection().first();
    expect(row?.status).toBe('rejected');
    expect(row?.reason).toBe('product not active');

    // a second sync must not resend the rejected row
    await engine.syncOnce();
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('increments attempts and reports the error on a network failure', async () => {
    await seedOutbox(2);
    const rpc = async (): Promise<SubmitResult> => {
      throw new Error('network down');
    };
    const engine = createSyncEngine({ rpc });
    const r = await engine.syncOnce();
    expect(r.error).toContain('network down');
    expect(r.sent).toBe(0);
    const rows = await db.outbox.toArray();
    expect(rows.every((x) => x.attempts === 1)).toBe(true);
    expect(rows.every((x) => x.status === 'pending')).toBe(true);
  });

  it('does not double-send when two syncOnce calls race', async () => {
    await seedOutbox(10);
    let active = 0;
    let maxActive = 0;
    const rpc = vi.fn(async (events: AppEvent[]): Promise<SubmitResult> => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((res) => setTimeout(res, 10));
      active -= 1;
      return { accepted: events.map((e) => e.id), duplicates: [], rejected: [], server_time: 'x' };
    });
    const engine = createSyncEngine({ rpc });

    const [a, b] = await Promise.all([engine.syncOnce(), engine.syncOnce()]);
    expect(maxActive).toBe(1); // never two rpc calls at once
    // exactly one of them actually ran; the other was a no-op guard
    const totalSent = a.sent + b.sent;
    expect(totalSent).toBe(10);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('records clock skew in meta from server_time', async () => {
    await seedOutbox(1);
    const fixedNow = Date.parse('2026-11-03T06:08:00.000+08:00'); // 12s before server
    const rpc = async (events: AppEvent[]): Promise<SubmitResult> => ({
      accepted: events.map((e) => e.id),
      duplicates: [],
      rejected: [],
      server_time: '2026-11-03T06:08:12.000+08:00',
    });
    const engine = createSyncEngine({ rpc, now: () => fixedNow });
    const r = await engine.syncOnce();
    expect(r.serverTime).toBe('2026-11-03T06:08:12.000+08:00');
    const skew = (await db.meta.get('server_skew_ms'))?.value as number;
    // server is 12s ahead of our clock
    expect(skew).toBe(12_000);
  });
});
