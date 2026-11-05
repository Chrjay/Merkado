import { useSyncExternalStore } from 'react';

/*
 * Synced day events leave the outbox and the server does not send them back,
 * so the UI keeps its own per-device note of what was already logged today.
 */
type DayKind = 'rainy' | 'closed' | `stockout:${number}`;

const PREFIX = 'merkado.day.';
const listeners = new Set<() => void>();

function key(date: string, kind: DayKind) {
  return `${PREFIX}${date}.${kind}`;
}

export function markLogged(date: string, kind: DayKind) {
  try {
    localStorage.setItem(key(date, kind), '1');
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith(PREFIX) && !k.startsWith(`${PREFIX}${date}.`)) localStorage.removeItem(k);
    }
  } catch {
    /* storage full or blocked: the outbox check still covers unsent events */
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener('storage', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', listener);
  };
}

function snapshot(date: string) {
  try {
    return Object.keys(localStorage)
      .filter((k) => k.startsWith(`${PREFIX}${date}.`))
      .sort()
      .join('|');
  } catch {
    return '';
  }
}

/** Kinds logged on this device for `date`. */
export function useLoggedToday(date: string): Set<string> {
  const snap = useSyncExternalStore(subscribe, () => snapshot(date));
  const prefix = `${PREFIX}${date}.`;
  return new Set(snap ? snap.split('|').map((k) => k.slice(prefix.length)) : []);
}
