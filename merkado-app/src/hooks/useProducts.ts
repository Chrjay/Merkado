import { useCallback, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Product } from '../lib/db';
import { supabase, configError } from '../lib/supabase';

export interface ProductsState {
  products: Product[];
  refresh(): Promise<{ ok: boolean; error?: string }>;
  lastRefreshed: number | null;
}

const LAST_REFRESHED_KEY = 'products_refreshed_at';

export function useProducts(): ProductsState {
  const [lastRefreshed, setLastRefreshed] = useState<number | null>(null);

  // The grid always reads from Dexie so it works offline.
  const products =
    useLiveQuery(
      () => db.products.filter((p) => p.active).sortBy('sort_order'),
      [],
      [] as Product[],
    ) ?? [];

  const refresh = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
    if (!supabase) return { ok: false, error: configError ?? 'Walang Supabase config.' };
    const { data, error } = await supabase
      .from('products')
      .select('product_id, product, unit, pack_multiplier, price, sort_order, active')
      .eq('active', true)
      .order('sort_order', { ascending: true });
    if (error) return { ok: false, error: error.message };

    const rows = (data ?? []) as Product[];
    await db.transaction('rw', db.products, async () => {
      await db.products.clear();
      await db.products.bulkPut(rows);
    });
    const now = Date.now();
    await db.meta.put({ key: LAST_REFRESHED_KEY, value: now });
    setLastRefreshed(now);
    return { ok: true };
  }, []);

  return { products, refresh, lastRefreshed };
}
