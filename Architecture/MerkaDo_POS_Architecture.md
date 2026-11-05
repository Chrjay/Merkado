# MerkaDo Tindahan App (Option B, React + TypeScript + Supabase): System Architecture and Design Plan

**Status:** plan only. Nothing is built yet.
**Goal:** replace the Google Form with a fast, installable phone app (PWA) for the counter, backed by a **Supabase (PostgreSQL)** database. The analysis stays the same: the notebook reads the database, then Run All writes the weekly Taglish owner report.
**Changed from the previous version:**
- Google Sheets and Apps Script are replaced by Supabase.
- The PIN check is replaced by a login and database security rules.
- The duplicate check is now a database constraint.
- The notebook reads the database directly and saves a weekly backup.
- **The front end is now React + TypeScript**, built with Vite. Offline support comes from vite-plugin-pwa and Dexie (IndexedDB), and the database types are generated from Supabase. Deployment is a GitHub Actions build to GitHub Pages.

---

## 1. Goals and non-goals

**Goals**
1. **Fast logging:** a sale takes 2–3 taps. Product buttons replace dropdowns, and there's no item limit.
2. **Works offline:** sales are saved on the phone first and sent when there is signal.
3. **Clean data for the model:** one saved sale = one `trans_id` = one real basket. The database itself rejects bad data: unknown products, a quantity of 0 or less, unknown payment types, and duplicate sales.
4. **One product list:** the `products` table feeds the app's buttons and the notebook's `PACK_TABLE` and `PRICE_LIST`.
5. **Free and maintainable:** a typed React app built to static files on GitHub Pages, plus Supabase's free plan. We run no server of our own.

**Non-goals:** multiple stores, barcode scanning, receipts, utang ledgers (who owes how much), dashboards inside the app, and app-store releases.

---

## 2. Architecture overview

```
 OWNER'S PHONE (installed PWA)                     SUPABASE (free plan)                                 GROUP (weekly)
 ─────────────────────────────                     ────────────────────                                 ──────────────
 ┌───────────────────────────────┐  HTTPS (JWT)   ┌────────────────────────────────────────┐
 │ UI: Benta · Araw · Stock ·    │ ─────────────▶ │ Auth: 1 store login (sign-ups off)     │
 │     Ngayon · Settings         │  rpc           │ PostgREST API (auto)                   │
 ├───────────────────────────────┤  submit_events │  └─ rpc submit_events / void_sale      │
 │ React + TS app (Vite build)   │ ◀───────────── │ PostgreSQL                             │   read-only role    ┌────────────────────┐
 ├───────────────────────────────┤  products list │  products · sales · sale_items ·       │ ──────────────────▶ │ merkado_eda.ipynb  │
 │ supabase-js · Dexie IndexedDB │                │  day_events · stock_counts · store_users│  (pooler, SQL)      │ Run All → report   │
 │ (outbox, products, today)     │                │  reporting views: v_sales_log,         │                     │ + weekly CSV backup│
 ├───────────────────────────────┤                │  v_day_events, v_stock_latest          │                     └────────────────────┘
 │ Workbox SW (vite-plugin-pwa)  │                │ Row Level Security on every table      │
 └───────────────────────────────┘                └────────────────────────────────────────┘
        ▲ static files                                        ▲
 GitHub Pages ◀ GitHub Actions build              Group edits products in the Supabase Table Editor
```

**Data flow for one sale**
1. The owner taps the items, then the payment type, then **I-save**. The sale gets a `trans_id` on the phone and goes into the **outbox** (IndexedDB) right away.
2. When there is signal, the sync module calls `submit_events(batch)` through supabase-js.
3. That function runs in **one database transaction**. It checks that the caller is the store user, then inserts each sale header and all of its items. A sale is saved completely or not at all. An ID that already exists is skipped (`ON CONFLICT DO NOTHING`). It returns the accepted and duplicate IDs.
4. The app removes the confirmed events from the outbox.
5. On Sunday, the notebook connects with a **read-only** database user and reads the views. It then saves CSV backups and runs as before.

---

## 3. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Language | **TypeScript** (`strict: true`) | Catches mistakes such as a wrong field name, a missing payment type or a string where a number belongs, before they reach the store's data |
| UI | **React** (function components and hooks) | Reusable components (product button, cart, sync badge); well known, so easy for group members to learn or take over |
| Build tool | **Vite** (React + TS template) | Fast dev server; outputs plain static files for GitHub Pages |
| PWA / offline shell | **vite-plugin-pwa** (Workbox) | Generates the service worker and manifest and caches every built file, so the app opens with no signal. Update prompt built in |
| Offline storage | **Dexie** (IndexedDB) + `dexie-react-hooks` | Typed tables; `useLiveQuery` re-renders screens when the outbox changes; survives app and phone restarts |
| Database client | **@supabase/supabase-js v2** with types from `supabase gen types typescript` | Login, token refresh, `rpc()` calls; the generated types keep the app in step with `schema.sql` |
| Validation | **zod** | Checks every event before it enters the outbox, and checks server replies |
| State | React state + context (cart, auth) + Dexie live queries (outbox, products) | Small app, so Redux or similar isn't needed |
| Navigation | One tab bar with React state (5 screens), no router | Avoids GitHub Pages routing issues; fewer dependencies |
| Styling | Plain CSS with CSS Modules | No extra framework; big buttons and high contrast are easy to control |
| Testing | **Vitest** + React Testing Library + `fake-indexeddb` (unit); **Playwright** (end-to-end, offline mode, phone viewport); SQL tests for RLS | Covers logic, screens, offline sync and security |
| Code quality | ESLint (typescript-eslint, react-hooks) + Prettier; `tsc --noEmit` | Same style for every group member; type errors fail the build |
| Hosting / CI | **GitHub Pages**, deployed by **GitHub Actions** (lint → typecheck → test → build → deploy) | Free HTTPS; nothing broken reaches the owner's phone |
| Backend | **Supabase**: PostgreSQL, Auth, PostgREST, Row Level Security | Unchanged (Section 5) |
| Analysis | Existing **merkado_eda.ipynb** + `from_db()` (SQLAlchemy + psycopg2) | Unchanged (Section 7) |

**Versions:** use the current stable releases when the project is created: Node.js LTS, React, Vite, supabase-js v2 and Dexie 4. Pin them in `package-lock.json`, and only upgrade between collection periods, never mid-collection.

**Cost of this choice vs plain JavaScript:**
- There's a build step and a Node.js toolchain.
- Every group member who edits the app needs basic React and TypeScript.
- The download is larger, though it's cached once by the service worker.

In return, you get type safety between the database and the app, reusable components and proper tests.

---

## 4. Supabase free plan: what it means for us

Checked on Supabase's pricing page on 2026-11-05. Recheck before starting, because terms can change.

| Limit (free plan) | Our expected use | OK? |
|---|---|---|
| 500 MB database per project | About 40–80 MB per year even for a busy store (300 sales and 450 item rows a day). About 80–160 MB over 2 years | Yes |
| 5 GB egress per month | About 20 MB per weekly notebook download by Year 2, about 80 MB a month | Yes |
| Unlimited API requests; 50,000 monthly active users | 1 store login | Yes |
| 2 active projects | 1 project, plus an optional test project | Yes |
| **Paused after 1 week of inactivity** | Daily logging keeps it active. A closure longer than a week, or the end of the project, can pause it | Plan for it (Section 9) |
| **No automatic backups** | Data could be lost to a mistake | The notebook saves a weekly CSV backup (Section 9) |

Size estimate: about 150 bytes per item row and about 100 bytes per sale header, including indexes. The proxy data averages only about 5–6 rows a day, so a real store will probably use much less than this.

---

## 5. Database design

### 5.1 Tables

**`products`**: the single product list, edited by the group in the Table Editor.

| Column | Type | Rule |
|---|---|---|
| `product_id` | `serial` PK | |
| `product` | `text` | e.g. `Shampoo Sachet`; no brackets |
| `unit` | `text` default `'pc'` | e.g. `banig` |
| `pack_multiplier` | `int` | `> 0`; `1` for `pc` |
| `price` | `numeric(8,2)` | optional, `>= 0` |
| `sort_order` | `int` | best sellers first |
| `active` | `bool` default `true` | hides an item without deleting its history |
| | | `unique (product, unit)` |

**`sales`**: one row per customer purchase (the basket).

| Column | Type | Rule |
|---|---|---|
| `trans_id` | `text` PK | made on the phone, e.g. `S-20261102-060812-A7F3` |
| `sale_date`, `sale_time` | `date`, `time` | phone's local Manila time **when the sale happened** |
| `payment` | `text` | `in ('Cash','GCash','Utang')` |
| `device_id` | `text` | e.g. `phone-1` |
| `received_at` | `timestamptz` default `now()` | when the server got it |
| `voided`, `voided_at` | `bool` default `false`, `timestamptz` | set by `void_sale()` |

**`sale_items`**: one row per item line in a sale.

| Column | Type | Rule |
|---|---|---|
| `trans_id` | `text` FK → `sales` | |
| `line_no` | `smallint` | PK together with `trans_id` |
| `product_id` | `int` FK → `products` | the product must exist |
| `qty` | `int` | `> 0` (count of that unit) |
| `unit_price` | `numeric(8,2)` | price at the time of sale |

**`day_events`**: `event_id text PK`, `event_date`, `event_time`, `type in ('stockout','rainy','closed')`, `product_id` FK. A product is required when `type = 'stockout'`. Also `device_id` and `received_at`.

**`stock_counts`**: `event_id text PK`, `count_date`, `count_time`, `product_id` FK, `count int >= 0`, `device_id`, `received_at`.

**`store_users`**: `user_id uuid PK → auth.users`, `role in ('owner','analyst')`.

The previous plan had a separate `raw_events` audit tab. It's no longer needed: primary keys handle duplicates, `received_at` records arrival, and sales are voided rather than deleted. This also keeps the database smaller.

### 5.2 Views for the notebook (standard log format)
The views live in a separate **`reporting` schema** that isn't exposed through the API. Supabase grants the API roles access to new objects in `public` by default, and views ignore RLS, so a view in `public` could be read through the API.
- **`v_sales_log`:** joins `sales`, `sale_items` and `products` and leaves out voided sales. Columns: `Date, Time, Trans_ID, Product, Unit, Qty, UnitPrice, PaymentType, Pack_Multiplier`. This is the same format the notebook reads now.
- **`v_day_events`:** `Date, Time, Type, Product`.
- **`v_stock_latest`:** the latest count per product, as `Product, Count, Date`.

### 5.3 Database functions (called by the app)
- **`submit_events(p_events jsonb) returns jsonb`**
  - `SECURITY DEFINER`, with `search_path` fixed, and callable only by logged-in users. It first checks that `auth.uid()` is in `store_users`.
  - It loops over the events. A `sale` inserts the header and all its lines, while `stockout`, `rainy`, `closed` and `stock_count` insert into their own tables. Every insert uses `ON CONFLICT DO NOTHING`.
  - It returns `{accepted:[…], duplicates:[…], rejected:[{id, reason}], server_time}`. If one event is invalid, for example a deactivated product, only that event is rejected. Each event runs in its own sub-transaction (`BEGIN … EXCEPTION` block), so a sale is still saved completely or not at all.
- **`void_sale(p_trans_id text)`:** sets `voided = true` and `voided_at = now()` for store users. It never deletes rows.

### 5.4 Security (Row Level Security)
- **RLS is turned on for every table.** With no policy, nobody can read or write, so access is denied by default.
- **Owner (logged in on the phone):**
  - Can read active `products`, and their own `sales` and `sale_items` from the last 2 days (for the Ngayon screen).
  - Can write only through `submit_events` and `void_sale`. There are no direct insert, update or delete policies.
- **Analyst (group members):** use the Supabase dashboard to edit `products` and fix data. The dashboard bypasses RLS, so only group members get dashboard access.
- **Notebook:** a separate Postgres role, `merkado_reader`, with `SELECT` only on the views in the `reporting` schema, which includes a products view. It can't change anything.
- **Not logged in (anon):** no access to any table or function.
- **Keys:**
  - The publishable/anon key in the app is public by design. Security comes from the login and RLS.
  - The **service_role key and the database passwords are never put in the app, the notebook file or Git.** The notebook reads its connection string from an environment variable or Colab Secrets.
- **Auth settings:** turn **sign-ups off**. Create the single store login by hand in the dashboard, e.g. `tindahan@…` with a strong password, and log in once on the owner's phone. The session is remembered and refreshed automatically.
- **No customer data** is stored: no names or phone numbers.

---

## 6. Front-end design

### 6.1 Screens (Taglish labels, big touch targets)

| Screen | Purpose | Main elements |
|---|---|---|
| **Benta** (home) | Log a sale | Product grid in `sort_order` (tap = +1, long-press = type a quantity); cart with ₱ total; **Cash · GCash · Utang**; **I-save** |
| **Araw** | Day events | **Ubos na** (tick items), **Umuulan ngayon**, **Sarado ngayon** (asks to confirm) |
| **Stock** | Weekly count | Active products with number inputs, then **I-save ang bilang** |
| **Ngayon** | Today's check | Today's total and units, recent sales with **Bawiin** (void), sync badge and **Ipadala** |
| **Settings** | One-time setup | Login, device name, **I-refresh ang produkto**, app version, logout |

### 6.2 Offline and sync
- **The outbox comes first.** Every save goes to IndexedDB before any network call. Unsent sales can still be edited or deleted.
- **Sync runs:**
  - when the app opens
  - after each save
  - when the phone comes back online (the `online` event)
  - every 60 seconds while the app is open
  - when the owner taps **Ipadala**
- **Batching:** up to 50 events per `submit_events` call. After a failure, wait 10 seconds, then 30 seconds, then 2 minutes, and so on. Events leave the outbox only after the server lists them as accepted or duplicate.
- **Rejected events:** these stay in the outbox with the server's reason, e.g. "product not active". They are shown on the Ngayon screen so the owner or group can fix them.
- **Login while offline:** supabase-js keeps the session on the phone. When the access token expires, it refreshes the next time there's signal, and logging continues offline in the meantime. If the session is lost, events wait in the outbox until the owner logs in again.
- **Clock check:** compare the phone time with the `server_time` returned by each sync. Warn if they differ by more than 10 minutes, or if a sale is dated before the last saved sale.
- **Products cache:** fetched after login and on **I-refresh**, and kept in IndexedDB so the grid works offline.

### 6.3 Project structure

```
merkado-app/
├── index.html
├── package.json / package-lock.json
├── vite.config.ts            # react(), VitePWA({ registerType: 'prompt', manifest, workbox }), base: '/merkado-app/'
├── tsconfig.json             # strict: true
├── .env.example              # VITE_SUPABASE_URL=, VITE_SUPABASE_PUBLISHABLE_KEY=  (real values in GitHub repo variables)
├── public/icons/             # 192 and 512 px app icons
├── src/
│   ├── main.tsx              # React root, service-worker registration
│   ├── App.tsx               # auth gate + tab bar
│   ├── screens/              # Benta.tsx · Araw.tsx · Stock.tsx · Ngayon.tsx · Settings.tsx · Login.tsx
│   ├── components/           # ProductGrid · ProductButton · Cart · PaymentButtons · SyncBadge · ConfirmDialog · UpdatePrompt
│   ├── hooks/                # useAuth · useProducts · useOutbox · useSync · useTodaySales · useClockCheck
│   ├── lib/
│   │   ├── supabase.ts       # createClient<Database>(url, key, { auth: { persistSession: true } })
│   │   ├── db.ts             # Dexie schema: outbox, products, todaySales, meta
│   │   ├── sync.ts           # batching, retry/backoff, accepted/duplicate/rejected handling
│   │   ├── ids.ts            # makeId('S' | 'E') → S-20261102-060812-A7F3
│   │   └── time.ts           # Manila local date/time helpers
│   ├── types/
│   │   ├── database.ts       # generated: supabase gen types typescript
│   │   └── events.ts         # AppEvent union + zod schemas
│   └── styles/               # *.module.css, theme.css
├── tests/
│   ├── unit/                 # sync.test.ts, cart.test.ts, ids.test.ts (Vitest, fake-indexeddb)
│   └── e2e/                  # offline-sale.spec.ts, void.spec.ts (Playwright, phone viewport)
├── supabase/                 # schema.sql · seed_products.sql · tests.sql · migrations/
└── .github/workflows/deploy.yml
```

### 6.4 Core types (sketch)

```ts
export type Payment = 'Cash' | 'GCash' | 'Utang';

interface EventBase {
  id: string;            // S-… or E-…, made on the phone
  date: string;          // 'YYYY-MM-DD', Manila local time at the moment of the sale/event
  time: string;          // 'HH:MM:SS'
  device_id: string;
}

export interface SaleLine { product_id: number; qty: number; unit_price: number | null }

export type AppEvent =
  | (EventBase & { type: 'sale'; payment: Payment; items: SaleLine[] })
  | (EventBase & { type: 'stockout'; product_id: number })
  | (EventBase & { type: 'rainy' | 'closed' })
  | (EventBase & { type: 'stock_count'; product_id: number; count: number })
  | (EventBase & { type: 'void'; trans_id: string });

export interface OutboxRow {
  event: AppEvent;
  status: 'pending' | 'rejected';
  attempts: number;
  reason?: string;       // server's reason when rejected
  created_at: number;
}

export interface SubmitResult {
  accepted: string[];
  duplicates: string[];
  rejected: { id: string; reason: string }[];
  server_time: string;
}
```

Each type has a matching **zod** schema: for example, a sale needs at least one line and every `qty` must be greater than 0. The app checks events against it before saving to the outbox. The database runs the same checks again, so bad data is caught twice.

### 6.5 State and data flow in the app
- **Cart:** React state in `Benta`, `{ product_id → qty }`. It's never stored until **I-save**.
- **I-save:** build a `sale` event, check it with zod, then `db.outbox.add()`. Clear the cart, vibrate once and show "Naitala na!". Then call `sync.trigger()`.
- **`useSync`:** a single sync loop, so two syncs never run at the same time. It runs on app open, `online`, a 60-second interval and the **Ipadala** button. It calls `supabase.rpc('submit_events', { p_events })` with up to 50 events.
  - Accepted and duplicate events are deleted from the outbox.
  - Rejected events are marked with the server's reason.
  - Network errors use backoff.
- **`useLiveQuery`:** keeps the sync badge, unsent count and Ngayon list live from Dexie, with no manual refresh.
- **`useProducts`:** fetches after login and on **I-refresh**, saves into Dexie, and the grid reads from Dexie, so it works offline.
- **App updates:** vite-plugin-pwa with `registerType: 'prompt'`. The **"May bagong bersyon, i-update"** banner only appears when the cart is empty, so an update can't interrupt a sale.

### 6.6 Build and deploy
- **Local:** `npm ci`, then `npm run dev` (phone testing over the same Wi-Fi with `--host`). Also `npm run test`, `npm run e2e` and `npm run build`.
- **GitHub Actions (`deploy.yml`):** on push to `main`, run `npm ci`, then lint, `tsc --noEmit`, Vitest, `vite build` and `actions/deploy-pages`. A failing step stops the deploy.
- **Config:** `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` come from GitHub repository variables. The publishable key is public by design, and security comes from login and RLS. **The service_role key is never a `VITE_` variable**, because anything starting with `VITE_` ends up in the browser.
- **Types:** after each schema change, run `supabase gen types typescript` and commit `src/types/database.ts`. A mismatch then shows up as a type error.
- **Branches:** work on feature branches with pull requests into `main`. One person reviews before merge, so the owner's app only changes through checked code.

---

## 7. Notebook changes (small)

| Change | What |
|---|---|
| Input | Section 0: `DB_URL = os.environ.get('MERKADO_DB_URL', '')`. Use the Supabase **connection pooler** string for the `merkado_reader` role, which works from Colab and laptops. `SHEET_CSV_URL` and `DATA_PATH` stay as fallbacks |
| `from_db()` reader | `pd.read_sql` on `v_sales_log`, `v_day_events` and `v_stock_latest`. Day events become `Stockout_Flag`, `Is_Rainy` and `Store_Open = 0` rows, the same way `from_google_form()` does now. `v_stock_latest` feeds `STOCK` |
| Product settings | `PACK_TABLE` and `PRICE_LIST` are built from `products`. A manual entry in Section 0 still overrides it |
| Weekly backup | Every run writes `outputs/backup/<date>/` with a CSV of each table and view. Copy it to the group's drive with `reports/weekNN/` |
| Connection errors | A clear message such as "Supabase project may be paused: open the dashboard and click Restore". The notebook can then run on the last backup CSV through `DATA_PATH` |
| Requirements | Add `sqlalchemy` and `psycopg2-binary` to `requirements.txt` |
| Everything else | Unchanged: cleaning, EDA, closed-day handling, forecasts, `CLOSED_NEXT_WEEK`, owner report |

---

## 8. Setup (one time)

1. Create a Supabase project on the free plan, in a Singapore-region data center (closest to Manila). Save the database password in the group's password manager.
2. In the SQL Editor, run `schema.sql`, then `seed_products.sql` with the store's items, packs and prices.
3. Under Auth:
   - Turn sign-ups off.
   - Create the store user.
   - Add that user's ID to `store_users` with role `owner`.
4. Create the `merkado_reader` password. Share the pooler connection string only with group members, through Colab Secrets or an environment variable.
5. Create the repo from the Vite React + TS template. Add the project URL and publishable key as GitHub repository variables, enable GitHub Pages (source: GitHub Actions) and push to `main`.
6. On the owner's phone: open the site, log in, then **Add to Home screen**. Do a test sale and void it.
7. One-day trial at the store, then run the notebook.

---

## 9. Operations

| Situation | What to do |
|---|---|
| Every Sunday | Run All. Check the flagged items. Copy `outputs/` and `outputs/backup/` to `reports/weekNN/` |
| Add or change a product | Edit `products` in the Table Editor (set `active = false` instead of deleting). The owner taps **I-refresh** |
| Store closed for more than a week | Before leaving, a group member opens the dashboard or runs the notebook. If the project pauses anyway, click **Restore** in the dashboard. Check how long a paused project can still be restored |
| Mistaken sale | The owner taps **Bawiin**, or a group member sets `voided = true` in the dashboard. Never delete rows |
| Lost phone | Change the store user's password in the dashboard, which logs the old phone out. Unsent outbox data on that phone is lost, so keep syncing regularly |
| Schema change | Add a numbered migration file, test it on the test project, then run it on the main project |
| Project end | Export the final backup, give the owner a copy as agreed, then pause or delete the project |

---

## 10. Build plan

| Phase | Work | Done when |
|---|---|---|
| 0. Decide | Owner's phone (Android or iPhone), and whether the app or the Form is used from Week 1 | Decision recorded |
| 1. Database | `schema.sql`: tables, views, `submit_events`, `void_sale`, RLS, `merkado_reader`. Then `tests.sql` | All security tests pass in the SQL Editor |
| 2. App scaffold | Vite React + TS, ESLint/Prettier, Vitest, Playwright, generated DB types, GitHub Actions deploy of a "hello" page | CI green; page live on GitHub Pages |
| 3. Benta screen | Login, `ProductGrid`, `Cart`, Dexie outbox, `useSync` | Unit tests pass; sales logged offline appear once in `v_sales_log` |
| 4. Other screens | Araw, Stock, Ngayon (with void), Settings | All event types reach the right tables; e2e tests pass |
| 5. PWA | vite-plugin-pwa manifest, icons, update prompt | Lighthouse "installable"; app opens in airplane mode; update banner only when the cart is empty |
| 6. Notebook | `DB_URL`, `from_db()`, products → `PACK_TABLE`/`PRICE_LIST`, weekly backup | Run All passes on the database, the Form export and the CSV fallback |
| 7. Field trial | One day at the store | Owner logs a full day without help |

Phases 1–6 have to be done before daily logging starts. If the app isn't ready by Week 1, collect with the Google Form. The notebook can read both sources, so you can switch to the app later.

---

## 11. Testing plan

| Test | How | Pass condition |
|---|---|---|
| Unit: cart, IDs, zod schemas, sync results | Vitest + fake-indexeddb | Accepted and duplicate events removed; rejected events kept with their reason; bad events never enter the outbox |
| Type check | `tsc --noEmit` in CI | No errors; generated DB types match `schema.sql` |
| E2E offline sale | Playwright, phone viewport, `context.setOffline(true)`, 10 sales, back online | 10 sales in `v_sales_log`; badge shows "Lahat naipadala" |
| Offline save (real phone) | Airplane mode, log 10 sales, go online | 10 sales in `v_sales_log`; outbox empty |
| No double counting | Send the same batch twice | Second call returns all IDs as duplicates; counts unchanged |
| Whole sale or nothing | Batch with one sale containing an inactive product | That sale is rejected entirely; other sales accepted |
| Bad values | Qty 0, unknown payment type | Rejected by the database constraints |
| Security | As anon: select or insert on every table and view, call `submit_events`. As the owner: direct insert or delete, read the `reporting` views through the API | All denied |
| Read-only notebook role | `merkado_reader` tries insert or update | Denied; select on views works |
| Void | Save, sync, **Bawiin** | `voided = true`; sale missing from `v_sales_log` |
| Packs | Sell `Shampoo Sachet (banig)` ×1 | Notebook counts 12 sachets |
| Day events and stock | Ubos, Umuulan, Sarado, stock count | The notebook reports the closed day and the stockout correction; Restock Soon uses the count |
| Clock wrong | Set the phone date back a day | Warning shown |
| Pause recovery | Notebook with a wrong or unreachable `DB_URL` | Clear message; fallback to the backup CSV works |
| End to end | One mock week through the app, then Run All | `owner_report.pdf` created; TEST DATA ONLY banner while `DATASET_LABEL` says mock |

---

## 12. Risks

| Risk | Handling |
|---|---|
| Project pauses or the free terms change | Daily use keeps it active; weekly CSV backups; the CSV fallback in the notebook; recheck pricing before starting |
| No automatic backups | Weekly backup from the notebook; never delete rows |
| A secret leaks (service_role key or a DB password) | Never in the app or Git; rotate it in the dashboard if exposed; the notebook uses a read-only role |
| iPhone clears app storage after long non-use | Sync whenever the app is open; show the unsent count |
| Owner finds it slow at rush hour | Best sellers first, tap = +1, paper fallback entered later with the real time |
| Group members leave | TypeScript types, tests and CI make the code safer to hand over; `schema.sql`, this document and a README in the repo |
| Toolchain or dependency breakage | Pin versions in `package-lock.json`; CI must pass before deploy; no upgrades during data collection |
| Group unfamiliar with React/TS | Keep components small, avoid extra libraries, and pair on the first screens |
| Scope creep | Keep to Section 1. Anything else goes under "future work" in the paper |

---

## 13. Comparison

| | Google Form (current) | App + Google Sheets (previous plan) | **App + Supabase (this plan)** |
|---|---|---|---|
| Taps per sale | Many | 4–6 | 4–6 |
| Items per sale | 4 per answer | Unlimited | Unlimited |
| Offline | No | Yes | Yes |
| Data checks | Dropdowns only | Script checks | **Database constraints + foreign keys** |
| Duplicates | Exact-row removal in the notebook | Script ID check | **Primary key, cannot happen** |
| Security | Public CSV link | PIN + read key | **Login + RLS + read-only notebook role** |
| Hand edits | Sheet | Sheet | Table Editor (spreadsheet-like) |
| Backups | Google Drive | Google Drive | **Weekly notebook backup (none built in)** |
| Main risk | Slow logging | Apps Script quirks | Project pausing; keys to manage |
| Setup and maintenance | Lowest | Medium | Medium |

**Recommendation:** build this if the owner will use it and it can be field-tested before daily logging starts. Otherwise collect with the Google Form and present this design as future work.

---

## Appendix A: Core SQL sketch (for Phase 1, to be tested)

```sql
create table products (
  product_id serial primary key,
  product text not null check (product !~ '[()]'),
  unit text not null default 'pc',
  pack_multiplier int not null default 1 check (pack_multiplier > 0),
  price numeric(8,2) check (price >= 0),
  sort_order int not null default 999,
  active boolean not null default true,
  unique (product, unit)
);

create table sales (
  trans_id text primary key,
  sale_date date not null,
  sale_time time not null,
  payment text not null check (payment in ('Cash','GCash','Utang')),
  device_id text,
  received_at timestamptz not null default now(),
  voided boolean not null default false,
  voided_at timestamptz
);

create table sale_items (
  trans_id text not null references sales on delete restrict,
  line_no smallint not null,
  product_id int not null references products,
  qty int not null check (qty > 0),
  unit_price numeric(8,2),
  primary key (trans_id, line_no)
);

create table day_events (
  event_id text primary key,
  event_date date not null,
  event_time time not null,
  type text not null check (type in ('stockout','rainy','closed')),
  product_id int references products,
  device_id text,
  received_at timestamptz not null default now(),
  check (type <> 'stockout' or product_id is not null)
);

create table stock_counts (
  event_id text primary key,
  count_date date not null,
  count_time time not null,
  product_id int not null references products,
  count int not null check (count >= 0),
  device_id text,
  received_at timestamptz not null default now()
);

create table store_users (
  user_id uuid primary key references auth.users,
  role text not null check (role in ('owner','analyst'))
);

create schema reporting;  -- not in the API's exposed schemas
revoke all on schema reporting from anon, authenticated;

create view reporting.v_sales_log as
select s.sale_date as "Date", s.sale_time as "Time", s.trans_id as "Trans_ID",
       p.product as "Product", p.unit as "Unit", i.qty as "Qty",
       i.unit_price as "UnitPrice", s.payment as "PaymentType",
       p.pack_multiplier as "Pack_Multiplier"
from sales s join sale_items i using (trans_id) join products p using (product_id)
where not s.voided;

alter table products     enable row level security;
alter table sales        enable row level security;
alter table sale_items   enable row level security;
alter table day_events   enable row level security;
alter table stock_counts enable row level security;
alter table store_users  enable row level security;

create policy owner_read_products on products for select to authenticated
  using (active and exists (select 1 from store_users u where u.user_id = auth.uid()));

-- submit_events(p_events jsonb) and void_sale(p_trans_id text):
--   security definer, set search_path = public, check auth.uid() in store_users,
--   insert ... on conflict do nothing, one sub-transaction per event.
-- revoke execute on both from anon and public; grant to authenticated.
-- create role merkado_reader login password '…';  -- password set in the dashboard, never in Git
-- grant usage on schema reporting to merkado_reader;
-- grant select on all tables in schema reporting to merkado_reader;  -- views + a reporting.products view
```
