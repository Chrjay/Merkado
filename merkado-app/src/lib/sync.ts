import { db } from './db';
import type { AppEvent, OutboxRow, SubmitResult } from '../types/events';
import type { ServerSale } from './db';

export interface SyncReport {
  sent: number;
  accepted: number;
  duplicates: number;
  rejected: number;
  error?: string;
  serverTime?: string;
}

export interface SyncEngineOptions {
  /** Submits a batch of events to the server (supabase.rpc('submit_events')). */
  rpc: (events: AppEvent[]) => Promise<SubmitResult>;
  /** Clock source, injectable for tests. */
  now?: () => number;
  /** Max events per rpc call. Default 50. */
  batchSize?: number;
  /**
   * Refreshes the local todaySales cache from the server (sales + sale_items for
   * today and yesterday, Manila). Called after a sync that accepted sales.
   * Optional so the engine stays unit-testable without supabase.
   */
  refreshTodaySales?: () => Promise<ServerSale[]>;
}

export interface SyncEngine {
  syncOnce(): Promise<SyncReport>;
  nextDelayMs(failures: number): number;
}

const BACKOFF = [10_000, 30_000, 120_000, 300_000];

export function createSyncEngine(opts: SyncEngineOptions): SyncEngine {
  const now = opts.now ?? (() => Date.now());
  const batchSize = opts.batchSize ?? 50;
  let running = false;

  function nextDelayMs(failures: number): number {
    if (failures <= 0) return 0;
    const idx = Math.min(failures, BACKOFF.length) - 1;
    return BACKOFF[idx];
  }

  async function syncOnce(): Promise<SyncReport> {
    // Concurrency guard: a single loop, two syncs never run at once.
    if (running) {
      return { sent: 0, accepted: 0, duplicates: 0, rejected: 0 };
    }
    running = true;
    try {
      // Oldest-first batch of pending rows (rejected rows are never resent).
      const batch = await db.outbox
        .where('status')
        .equals('pending')
        .sortBy('created_at')
        .then((rows) => rows.slice(0, batchSize));

      if (batch.length === 0) {
        return { sent: 0, accepted: 0, duplicates: 0, rejected: 0 };
      }

      const events = batch.map((r) => r.event);
      let result: SubmitResult;
      try {
        result = await opts.rpc(events);
      } catch (err) {
        // Network / RPC error: bump attempts, keep rows pending for backoff.
        await db.transaction('rw', db.outbox, async () => {
          for (const row of batch) {
            if (row.seq != null) {
              await db.outbox.update(row.seq, { attempts: row.attempts + 1 });
            }
          }
        });
        return {
          sent: 0,
          accepted: 0,
          duplicates: 0,
          rejected: 0,
          error: err instanceof Error ? err.message : String(err),
        };
      }

      const bySeq = new Map<string, OutboxRow>();
      for (const row of batch) bySeq.set(row.event.id, row);

      const removeIds = new Set<string>([...result.accepted, ...result.duplicates]);

      await db.transaction('rw', db.outbox, async () => {
        // Accepted + duplicates leave the outbox.
        for (const id of removeIds) {
          const row = bySeq.get(id);
          if (row?.seq != null) await db.outbox.delete(row.seq);
        }
        // Rejected rows stay, marked with the server's reason, not resent.
        for (const rej of result.rejected) {
          const row = bySeq.get(rej.id);
          if (row?.seq != null) {
            await db.outbox.update(row.seq, { status: 'rejected', reason: rej.reason });
          }
        }
      });

      // Clock-skew check against server_time (CONTRACT §6.2).
      if (result.server_time) {
        const serverMs = Date.parse(result.server_time);
        if (!Number.isNaN(serverMs)) {
          await db.meta.put({ key: 'server_skew_ms', value: serverMs - now() });
          await db.meta.put({ key: 'server_time', value: result.server_time });
        }
      }

      // If any accepted event was a sale, refresh the todaySales cache.
      const acceptedSale = result.accepted.some((id) => bySeq.get(id)?.event.type === 'sale');
      if (acceptedSale && opts.refreshTodaySales) {
        try {
          const sales = await opts.refreshTodaySales();
          await db.transaction('rw', db.todaySales, async () => {
            await db.todaySales.clear();
            await db.todaySales.bulkPut(sales);
          });
        } catch {
          // A failed refresh must not fail the whole sync; the next sync retries.
        }
      }

      return {
        sent: batch.length,
        accepted: result.accepted.length,
        duplicates: result.duplicates.length,
        rejected: result.rejected.length,
        serverTime: result.server_time,
      };
    } finally {
      running = false;
    }
  }

  return { syncOnce, nextDelayMs };
}
