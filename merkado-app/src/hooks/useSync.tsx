import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createSyncEngine, type SyncEngine } from '../lib/sync';
import { registerSyncTrigger } from '../lib/events';
import { db, type ServerSale } from '../lib/db';
import { supabase } from '../lib/supabase';
import { manilaDate } from '../lib/time';
import type { AppEvent, SubmitResult, Payment, SaleLine } from '../types/events';
import type { Json } from '../types/database';

export type SyncStatus = 'idle' | 'syncing' | 'offline' | 'error';

export interface SyncState {
  status: SyncStatus;
  lastSyncAt: number | null;
  lastError: string | null;
  trigger(): void;
  clockSkewMs: number | null;
}

const SyncContext = createContext<SyncState | null>(null);

const SYNC_INTERVAL_MS = 60_000;

/** Submit a batch of events through the submit_events RPC. */
async function submitEvents(events: AppEvent[]): Promise<SubmitResult> {
  if (!supabase) throw new Error('offline: no supabase client');
  const { data, error } = await supabase.rpc('submit_events', {
    p_events: events as unknown as Json,
  });
  if (error) throw new Error(error.message);
  return data as unknown as SubmitResult;
}

/** Fetch today's and yesterday's (Manila) non-deleted sales plus their lines. */
async function fetchTodaySales(): Promise<ServerSale[]> {
  if (!supabase) return [];
  const today = manilaDate();
  const yesterday = manilaDate(new Date(Date.now() - 24 * 60 * 60 * 1000));
  const { data, error } = await supabase
    .from('sales')
    .select('trans_id, sale_date, sale_time, payment, voided, sale_items(product_id, qty, unit_price)')
    .gte('sale_date', yesterday <= today ? yesterday : today);
  if (error) throw new Error(error.message);

  type Row = {
    trans_id: string;
    sale_date: string;
    sale_time: string;
    payment: string;
    voided: boolean;
    sale_items: { product_id: number; qty: number; unit_price: number | null }[] | null;
  };
  return ((data ?? []) as unknown as Row[]).map((r) => ({
    trans_id: r.trans_id,
    sale_date: r.sale_date,
    sale_time: r.sale_time,
    payment: r.payment as Payment,
    voided: r.voided,
    items: (r.sale_items ?? []) as SaleLine[],
  }));
}

export function SyncProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SyncStatus>('idle');
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [clockSkewMs, setClockSkewMs] = useState<number | null>(null);

  const engineRef = useRef<SyncEngine | null>(null);
  if (engineRef.current === null) {
    engineRef.current = createSyncEngine({ rpc: submitEvents, refreshTodaySales: fetchTodaySales });
  }
  // failures drives backoff; we gate the interval/trigger with it.
  const failuresRef = useRef(0);
  const inFlightRef = useRef(false);

  const runSync = useCallback(async () => {
    const engine = engineRef.current!;
    if (inFlightRef.current) return; // single loop, never two at once
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setStatus('offline');
      return;
    }
    inFlightRef.current = true;
    setStatus('syncing');
    try {
      const report = await engine.syncOnce();
      if (report.error) {
        failuresRef.current += 1;
        setStatus('error');
        setLastError(report.error);
      } else {
        failuresRef.current = 0;
        setLastError(null);
        setLastSyncAt(Date.now());
        setStatus('idle');
      }
      const skew = (await db.meta.get('server_skew_ms'))?.value;
      if (typeof skew === 'number') setClockSkewMs(skew);
    } catch (err) {
      failuresRef.current += 1;
      setStatus('error');
      setLastError(err instanceof Error ? err.message : String(err));
    } finally {
      inFlightRef.current = false;
    }
  }, []);

  const trigger = useCallback(() => {
    void runSync();
  }, [runSync]);

  // Register the trigger so events.ts can kick a sync after every save.
  useEffect(() => {
    registerSyncTrigger(trigger);
    return () => registerSyncTrigger(null);
  }, [trigger]);

  // Triggers: mount, 'online' event, and a 60 s interval.
  useEffect(() => {
    // Defer the first run so we don't setState synchronously during mount.
    const startId = setTimeout(() => void runSync(), 0);
    const onOnline = () => void runSync();
    const onOffline = () => setStatus('offline');
    if (typeof window !== 'undefined') {
      window.addEventListener('online', onOnline);
      window.addEventListener('offline', onOffline);
    }
    const id = setInterval(() => void runSync(), SYNC_INTERVAL_MS);
    return () => {
      clearTimeout(startId);
      clearInterval(id);
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', onOnline);
        window.removeEventListener('offline', onOffline);
      }
    };
  }, [runSync]);

  const value = useMemo<SyncState>(
    () => ({ status, lastSyncAt, lastError, trigger, clockSkewMs }),
    [status, lastSyncAt, lastError, trigger, clockSkewMs],
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync(): SyncState {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error('useSync must be used inside <SyncProvider>');
  return ctx;
}
