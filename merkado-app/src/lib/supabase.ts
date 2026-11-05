import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../types/database';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

/**
 * When the env vars are missing we must not throw at import time — that would
 * take down the whole app (and the tests that import this module). Instead we
 * expose a clear `configError` string the UI can show, and a null client.
 */
export const configError: string | null =
  !url || !key
    ? 'Walang Supabase config. Itakda ang VITE_SUPABASE_URL at VITE_SUPABASE_PUBLISHABLE_KEY.'
    : null;

export const supabase: SupabaseClient<Database> | null = configError
  ? null
  : createClient<Database>(url, key, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
