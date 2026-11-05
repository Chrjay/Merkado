import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import type { OutboxRow } from '../types/events';

export interface OutboxState {
  pending: OutboxRow[];
  rejected: OutboxRow[];
  unsentCount: number;
}

export function useOutbox(): OutboxState {
  const pending =
    useLiveQuery(
      () => db.outbox.where('status').equals('pending').sortBy('created_at'),
      [],
      [] as OutboxRow[],
    ) ?? [];

  const rejected =
    useLiveQuery(
      () => db.outbox.where('status').equals('rejected').sortBy('created_at'),
      [],
      [] as OutboxRow[],
    ) ?? [];

  // Unsent = anything still in the outbox (pending + rejected) waiting on action.
  return { pending, rejected, unsentCount: pending.length + rejected.length };
}
