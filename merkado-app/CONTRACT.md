# MerkaDo Build Contract (authoritative interfaces)

Source designs: `../Architecture/MerkaDo_POS_Architecture.md` (v1, **front end**) and
`../Architecture/MerkaDo_POS_Architecture_v2_supabase_plainjs.md` (v2, **database**, Appendix A).
Where this file and the designs disagree, **this file wins**. Do not change an interface here
without asking the coordinator.

Deviations from the designs (decided):
- Hosting is **Vercel**, not GitHub Pages. Vite `base: '/'`. GitHub Actions runs CI only
  (lint, typecheck, unit tests, build); Vercel's Git integration deploys.
- Icons: **lucide-react** only (no emoji, no other icon set).
- `src/types/database.ts` is hand-written in the `supabase gen types typescript` shape (no live project yet).
- No live Supabase project: SQL is verified locally with **PGlite** plus a Supabase auth/roles stub.

---

## 1. Folder ownership

| Path | Owner |
|---|---|
| `merkado-app/supabase/**` | DB worker |
| `merkado-app/src/lib/**`, `src/hooks/**`, `src/types/**`, `tests/unit/**` | App-core worker |
| `merkado-app/src/screens/**`, `src/components/**`, `src/styles/**`, `src/App.tsx`, `src/main.tsx`, `index.html`, `public/**`, `vite.config.ts`, `tests/e2e/**`, `vercel.json` | UI worker |
| `MerkaDo_EDA/**` | Notebook worker |
| `package.json`, lockfile, `tsconfig*`, eslint/prettier config, `.github/**` | Coordinator. Need a new dependency? Ask first. |

---

## 2. Database (Postgres / Supabase)

Tables, constraints and the `v_sales_log` view exactly as v2 Appendix A, plus everything below.

### 2.1 `public.submit_events(p_events jsonb) returns jsonb`
`security definer`, `set search_path = public, pg_temp`. Executable by `authenticated` only
(revoke from `public`, `anon`).

- If `auth.uid()` is not in `store_users`: `raise exception 'not authorized' using errcode = '42501'`.
- If `p_events` is not an array, or has more than 200 elements: raise exception (errcode `22023`).
- Each element is processed in its own `begin … exception when others` block. A sale is saved
  completely (header + all lines) or not at all.

Event shapes (JSON). All events: `id` (text), `type`, `date` (`YYYY-MM-DD`), `time` (`HH:MM:SS`), `device_id` (text).

```jsonc
{ "id":"S-20261102-060812-A7F3","type":"sale","date":"2026-11-02","time":"06:08:12","device_id":"phone-1",
  "payment":"Cash", "items":[{"product_id":1,"qty":2,"unit_price":8.00}] }          // unit_price may be null → products.price
{ "id":"E-…","type":"stockout","date":…,"time":…,"device_id":…,"product_id":3 }
{ "id":"E-…","type":"rainy" | "closed","date":…,"time":…,"device_id":… }
{ "id":"E-…","type":"stock_count","date":…,"time":…,"device_id":…,"product_id":3,"count":14 }
{ "id":"E-…","type":"void","date":…,"time":…,"device_id":…,"trans_id":"S-…" }
```

Rules:
- `sale` → `sales` (trans_id = id) + `sale_items` with `line_no` = 1-based index in `items`.
- `stockout` / `rainy` / `closed` → `day_events` (event_id = id). `stock_count` → `stock_counts`.
- `void` → sets `voided = true, voided_at = now()` on `trans_id`. Already voided → accepted (idempotent).
- Existing primary key → id goes to `duplicates` (insert with `on conflict do nothing`, detect 0 rows).
- Rejection `reason` strings (exact): `unknown event type`, `unknown product`, `product not active`,
  `invalid quantity`, `invalid payment`, `sale has no items`, `invalid count`, `sale not found`,
  `invalid date or time`. Anything else: the Postgres `SQLERRM`.
- Returns exactly: `{"accepted":[ids],"duplicates":[ids],"rejected":[{"id":…,"reason":…}],"server_time":"<ISO 8601 timestamptz>"}`.

### 2.2 `public.void_sale(p_trans_id text) returns boolean`
Same security as above. True if the sale exists (now voided), false if not found. Never deletes.

### 2.3 Row Level Security
RLS on every table. Owner/analyst (`authenticated` + in `store_users`) may SELECT:
- `products` where `active`;
- `sales` and `sale_items` whose `sale_date >= (now() at time zone 'Asia/Manila')::date - 1`.
No INSERT/UPDATE/DELETE policies at all. `anon`: nothing.

### 2.4 `reporting` schema (not exposed through the API; `revoke all … from anon, authenticated, public`)
Column names are quoted exactly as written.

| View | Columns |
|---|---|
| `reporting.v_sales_log` | `"Date"` date, `"Time"` time, `"Trans_ID"`, `"Product"`, `"Unit"`, `"Qty"` int, `"UnitPrice"` numeric, `"PaymentType"`, `"Pack_Multiplier"` int — non-voided sales only |
| `reporting.v_day_events` | `"Date"`, `"Time"`, `"Type"` (`stockout`/`rainy`/`closed`), `"Product"` (null unless stockout), `"Unit"` (null unless stockout) |
| `reporting.v_stock_latest` | `"Product"`, `"Unit"`, `"Count"` int (in that unit), `"Pack_Multiplier"`, `"Date"` — latest count per product_id |
| `reporting.v_products` | `"Product_ID"`, `"Product"`, `"Unit"`, `"Pack_Multiplier"`, `"Price"`, `"Sort_Order"`, `"Active"` |
| `reporting.raw_products`, `raw_sales`, `raw_sale_items`, `raw_day_events`, `raw_stock_counts` | `select *` of each table (for backups; includes voided) |

Role `merkado_reader`: `create role merkado_reader login` guarded by `if not exists` and **no password in Git**;
`usage` on `reporting`, `select` on all its views, nothing else (no access to `public` tables).

### 2.5 Local test stub (not part of `schema.sql`)
`supabase/test/stub.sql` recreates what Supabase provides before `schema.sql` runs:
roles `anon`, `authenticated`, `service_role` (nologin); schema `auth`, table `auth.users(id uuid primary key)`,
`auth.uid()` = `nullif(current_setting('request.jwt.claim.sub', true), '')::uuid`;
**Supabase's default grants** — `grant usage on schema public to anon, authenticated, service_role` and
`alter default privileges in schema public grant all on tables/sequences/functions to anon, authenticated, service_role`
(so RLS and revokes are what actually protect the data, exactly as in production).

---

## 3. App core API (React + TS; `src/lib`, `src/hooks`, `src/types`)

```ts
// src/types/events.ts  (+ matching zod schemas: appEventSchema, submitResultSchema)
export type Payment = 'Cash' | 'GCash' | 'Utang';
interface EventBase { id: string; date: string; time: string; device_id: string }
export interface SaleLine { product_id: number; qty: number; unit_price: number | null }
export type AppEvent =
  | (EventBase & { type: 'sale'; payment: Payment; items: SaleLine[] })
  | (EventBase & { type: 'stockout'; product_id: number })
  | (EventBase & { type: 'rainy' | 'closed' })
  | (EventBase & { type: 'stock_count'; product_id: number; count: number })
  | (EventBase & { type: 'void'; trans_id: string });
export interface OutboxRow { seq?: number; event: AppEvent; status: 'pending' | 'rejected';
  attempts: number; reason?: string; created_at: number }
export interface SubmitResult { accepted: string[]; duplicates: string[];
  rejected: { id: string; reason: string }[]; server_time: string }

// src/lib/db.ts  (Dexie 4)
export interface Product { product_id: number; product: string; unit: string; pack_multiplier: number;
  price: number | null; sort_order: number; active: boolean }
export interface ServerSale { trans_id: string; sale_date: string; sale_time: string; payment: Payment;
  voided: boolean; items: SaleLine[] }
export const db: Dexie & { outbox: Table<OutboxRow, number>; products: Table<Product, number>;
  todaySales: Table<ServerSale, string>; meta: Table<{ key: string; value: unknown }, string> };

// src/lib/ids.ts   makeId(prefix: 'S' | 'E', now?: Date): string   → 'S-20261102-060812-A7F3' (Manila time, 4 hex)
// src/lib/time.ts  manilaDate(now?: Date): 'YYYY-MM-DD'; manilaTime(now?: Date): 'HH:MM:SS'
// src/lib/cart.ts  type Cart = Record<number, number>; addOne, setQty (0 removes), cartTotal(cart, products), cartUnits(cart)
// src/lib/events.ts — the ONLY way screens write data. Each validates with zod, adds to outbox, then calls sync trigger.
export function saveSale(cart: Cart, payment: Payment, products: Product[]): Promise<AppEvent>;
export function saveDayEvent(type: 'stockout' | 'rainy' | 'closed', product_id?: number): Promise<AppEvent>;
export function saveStockCounts(counts: Record<number, number>): Promise<AppEvent[]>;
export function voidSale(trans_id: string): Promise<'removed-from-outbox' | 'queued'>; // unsent sale → delete from outbox
export function deleteOutboxRow(seq: number): Promise<void>;
export function getDeviceId(): Promise<string>; export function setDeviceId(id: string): Promise<void>;
// src/lib/sync.ts — pure-ish engine, unit-tested with fake-indexeddb and a fake rpc:
export function createSyncEngine(opts: { rpc: (events: AppEvent[]) => Promise<SubmitResult>;
  now?: () => number; batchSize?: number /*50*/ }): { syncOnce(): Promise<SyncReport>; nextDelayMs(failures: number): number };
//   backoff: 10s, 30s, 120s, 300s, then 300s cap. Accepted+duplicates deleted; rejected marked with reason; network error → attempts++.

// src/hooks (all consume providers mounted by App.tsx: <AuthProvider><SyncProvider>…)
useAuth(): { session: Session | null; loading: boolean; signIn(email: string, password: string): Promise<{ error?: string }>; signOut(): Promise<void> }
useProducts(): { products: Product[] /* active, sort_order asc */; refresh(): Promise<{ ok: boolean; error?: string }>; lastRefreshed: number | null }
useOutbox(): { pending: OutboxRow[]; rejected: OutboxRow[]; unsentCount: number }
useSync(): { status: 'idle' | 'syncing' | 'offline' | 'error'; lastSyncAt: number | null; lastError: string | null;
  trigger(): void; clockSkewMs: number | null }   // one loop: app open, 'online' event, 60 s interval, after each save, Ipadala
useTodaySales(): { sales: Array<ServerSale & { synced: boolean }>; totalPeso: number; totalUnits: number }  // pending outbox sales + server rows, voided excluded from totals
useClockCheck(): { warning: string | null }   // |skew| > 10 min, or newest sale dated before last saved sale
// exported providers: AuthProvider (src/hooks/useAuth.tsx), SyncProvider (src/hooks/useSync.tsx)
```

Env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` (see `.env.example`). Never a service_role key.

---

## 4. Screens (UI worker) — Taglish labels per v1 §6.1
Tab bar (lucide): Benta `ShoppingBasket`, Araw `CloudSun`, Stock `PackageCheck`, Ngayon `ReceiptText`, Settings `Settings`.
Login screen when no session. Update banner "May bagong bersyon, i-update" only when cart empty.
Phone-first: min touch target 48 px, high contrast, works at 360×640.

---

## 5. Notebook (`MerkaDo_EDA/merkado_eda.ipynb`)
`DB_URL = os.environ.get('MERKADO_DB_URL', '')`. When set, `from_db(engine)` reads the `reporting` views and returns a
DataFrame in the notebook's existing log format (`Date, Time, Trans_ID, Product, Unit, Qty, UnitPrice, PaymentType,
Pack_Multiplier`, plus `Stockout_Flag`, `Is_Rainy`, `Store_Open` per §2.4 events). When unset or unreachable,
falls back to `DATA_PATH` with a clear message. Existing CSV behaviour must be byte-for-byte unchanged in `eda_summary.txt`.
